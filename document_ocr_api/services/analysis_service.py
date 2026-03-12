import uuid

from fastapi import BackgroundTasks, HTTPException, UploadFile

from api_models import JobSubmitResponse
from document_backend import analyze_document
from schemas import AnalysisResponse, OutputFormat
from services.jobs_service import JobService
from utils import Timer, cleanup_temp_file, logger, save_upload_file_tmp


async def submit_async_analysis(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    output_format: OutputFormat,
    device: str,
    lite: bool,
    job_service: JobService,
) -> JobSubmitResponse:
    job_service.cleanup_expired_jobs()
    job_id = str(uuid.uuid4())
    temp_file_path, original_filename = await save_upload_file_tmp(file)
    job_service.create_pending_job(job_id)

    background_tasks.add_task(
        process_job_background,
        job_service,
        job_id,
        temp_file_path,
        original_filename,
        output_format.value,
        device,
        False,
        lite,
    )

    return JobSubmitResponse(
        job_id=job_id,
        status="pending",
        message=f"ジョブ {job_id} を送信しました。GET /jobs/{job_id} でステータスを確認してください。",
    )


async def analyze_document_sync(
    file: UploadFile, output_format: OutputFormat
) -> AnalysisResponse:
    temp_file_path = None
    try:
        temp_file_path, original_filename = await save_upload_file_tmp(file)
        with Timer() as timer:
            result = analyze_document(
                temp_file_path, original_filename, output_format.value
            )
        return AnalysisResponse(
            success=True,
            format=output_format,
            result=result["formatted"],
            error=None,
            pages=result["pages"],
            processing_time_ms=timer.elapsed_ms,
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.error(f"Error during analysis: {error}", exc_info=True)
        return AnalysisResponse(
            success=False,
            format=output_format,
            result=None,
            error=str(error),
            pages=0,
            processing_time_ms=0,
        )
    finally:
        if temp_file_path:
            cleanup_temp_file(temp_file_path)


def process_job_background(
    job_service: JobService,
    job_id: str,
    temp_file_path: str,
    original_filename: str,
    output_format: str,
    _device_str: str,
    _visualize: bool,
    _lite: bool = False,
) -> None:
    try:
        job_service.mark_processing(job_id)
        job_service.update_progress(job_id, 10, "処理を開始しています...")

        with Timer() as timer:
            result = analyze_document(
                temp_file_path,
                original_filename,
                output_format,
                progress_callback=lambda progress,
                message,
                pages=None: job_service.update_progress(
                    job_id,
                    progress,
                    message,
                    pages,
                ),
            )

        job_service.mark_completed(
            job_id, result["formatted"], result["pages"], timer.elapsed_ms
        )
        logger.info(f"Job {job_id} completed in {timer.elapsed_ms / 1000:.1f}s")
    except Exception as error:
        logger.error(f"Job {job_id} failed: {error}", exc_info=True)
        job_service.mark_failed(job_id, error)
    finally:
        cleanup_temp_file(temp_file_path)
