"""
Document OCR API with background job processing.

Primary extraction uses PyMuPDF. OCR fallback uses PaddleOCR when available,
otherwise Tesseract.
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "document_ocr_api"

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .api_models import (
    JobStatus,
    JobSubmitResponse,
    RepairRequest,
    RepairResponse,
    SourceDiscoveryResponse,
)
from .document_backend import get_backend_capabilities
from .schemas import (
    AnalysisResponse,
    DeviceType,
    HealthResponse,
    OutputFormat,
    SupportedFormatsResponse,
)
from .services.analysis_service import (
    analyze_document_sync,
    submit_async_analysis,
)
from .services.jobs_service import JobService
from .services.repair_service import run_opencode_repair
from .services.source_service import discover_source, fetch_source_pdf
from .utils import (
    SUPPORTED_IMAGE_EXTENSIONS,
    SUPPORTED_PDF_EXTENSIONS,
    get_available_device,
    logger,
)

if __package__ == "document_ocr_api":
    _ = sys.modules.setdefault("api_models", sys.modules[f"{__package__}.api_models"])
    _ = sys.modules.setdefault(
        "document_backend", sys.modules[f"{__package__}.document_backend"]
    )
    _ = sys.modules.setdefault("schemas", sys.modules[f"{__package__}.schemas"])
    _ = sys.modules.setdefault("services", sys.modules[f"{__package__}.services"])
    _ = sys.modules.setdefault("utils", sys.modules[f"{__package__}.utils"])
    _ = sys.modules.setdefault(
        "services.analysis_service",
        sys.modules[f"{__package__}.services.analysis_service"],
    )
    _ = sys.modules.setdefault(
        "services.jobs_service",
        sys.modules[f"{__package__}.services.jobs_service"],
    )
    _ = sys.modules.setdefault(
        "services.repair_service",
        sys.modules[f"{__package__}.services.repair_service"],
    )
    _ = sys.modules.setdefault(
        "services.source_service",
        sys.modules[f"{__package__}.services.source_service"],
    )


startup_ready = False
job_service = JobService(
    job_ttl_seconds=int(os.environ.get("JOB_TTL_SECONDS", "3600")),
    max_stored_jobs=int(os.environ.get("MAX_STORED_JOBS", "20")),
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global startup_ready
    logger.info("Starting Document OCR FastAPI server...")
    capabilities = get_backend_capabilities()
    logger.info(
        "Backend capabilities: pymupdf=%s paddleocr=%s tesseract=%s",
        capabilities.pymupdf_available,
        capabilities.paddleocr_available,
        capabilities.tesseract_available,
    )
    startup_ready = capabilities.pymupdf_available
    yield
    logger.info("Shutting down Document OCR FastAPI server...")


app = FastAPI(
    title="Document OCR API",
    description="PyMuPDF-first Japanese document extraction API with OCR fallback and background job support",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=dict)
async def root():
    return {
        "name": "Document OCR API",
        "version": "2.0.0",
        "description": "PyMuPDF-first document extraction API with async jobs",
        "endpoints": {
            "health": "/health",
            "analyze": "/analyze",
            "analyze_async": "/analyze/async",
            "job_status": "/jobs/{job_id}",
            "formats": "/formats",
            "docs": "/docs",
        },
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    capabilities = get_backend_capabilities()
    backend_available = capabilities.pymupdf_available and (
        capabilities.paddleocr_available or capabilities.tesseract_available
    )
    return HealthResponse(
        status="healthy" if backend_available else "degraded",
        version="2.0.0",
        yomitoku_available=backend_available,
        device=get_available_device(),
        ocr_backend_available=backend_available,
        primary_engine="pymupdf",
        ocr_engine="paddleocr"
        if capabilities.paddleocr_available
        else ("tesseract" if capabilities.tesseract_available else None),
    )


@app.get("/ready", response_model=dict)
async def ready_check():
    return {
        "ready": startup_ready,
        "status": "ready" if startup_ready else "starting",
    }


@app.get("/formats", response_model=SupportedFormatsResponse)
async def get_supported_formats():
    return SupportedFormatsResponse(
        input_formats=sorted(
            [ext[1:] for ext in (SUPPORTED_IMAGE_EXTENSIONS | SUPPORTED_PDF_EXTENSIONS)]
        ),
        output_formats=["json", "markdown", "html", "csv"],
    )


@app.get("/sources/discover", response_model=SourceDiscoveryResponse)
async def discover_source_route(
    url: str = Query(..., description="Listing page or PDF URL"),
    strategy: str = Query(..., description="Discovery strategy"),
):
    return discover_source(url, strategy)


@app.get("/sources/fetch")
async def fetch_source_pdf_route(url: str = Query(..., description="Direct PDF URL")):
    fetched_pdf = fetch_source_pdf(url)
    return Response(
        content=fetched_pdf.content,
        media_type=fetched_pdf.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{fetched_pdf.file_name}"',
        },
    )


@app.post("/repair/opencode", response_model=RepairResponse)
async def repair_with_opencode(request: RepairRequest):
    return run_opencode_repair(request)


@app.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    job_service.cleanup_expired_jobs()
    if not job_service.has_job(job_id):
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job_service.get_job_status(job_id)


@app.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    job_service.cleanup_expired_jobs()
    if not job_service.has_job(job_id):
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    job_service.delete_job(job_id)
    return {"message": f"Job {job_id} deleted"}


@app.post("/analyze/async", response_model=JobSubmitResponse)
async def analyze_document_async(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Document file (PDF or image)"),
    output_format: OutputFormat = Query(default=OutputFormat.MARKDOWN),
    device: DeviceType = Query(default=DeviceType.CPU),
    lite: bool = Query(default=False),
):
    return await submit_async_analysis(
        background_tasks, file, output_format, device.value, lite, job_service
    )


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_document_route(
    file: UploadFile = File(..., description="Document file (PDF or image)"),
    output_format: OutputFormat = Query(default=OutputFormat.JSON),
    visualize: bool = Query(default=False),
    device: DeviceType = Query(default=DeviceType.CPU),
):
    return await analyze_document_sync(file, output_format)


@app.post("/analyze/json")
async def analyze_json(
    file: UploadFile = File(...),
    visualize: bool = Query(default=False),
    device: DeviceType = Query(default=DeviceType.CPU),
):
    return await analyze_document_route(file, OutputFormat.JSON, visualize, device)


@app.post("/analyze/markdown")
async def analyze_markdown(
    file: UploadFile = File(...),
    visualize: bool = Query(default=False),
    device: DeviceType = Query(default=DeviceType.CPU),
):
    return await analyze_document_route(file, OutputFormat.MARKDOWN, visualize, device)


@app.post("/analyze/html")
async def analyze_html(
    file: UploadFile = File(...),
    visualize: bool = Query(default=False),
    device: DeviceType = Query(default=DeviceType.CPU),
):
    return await analyze_document_route(file, OutputFormat.HTML, visualize, device)


@app.post("/analyze/csv")
async def analyze_csv(
    file: UploadFile = File(...),
    visualize: bool = Query(default=False),
    device: DeviceType = Query(default=DeviceType.CPU),
):
    return await analyze_document_route(file, OutputFormat.CSV, visualize, device)


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    reload_enabled = os.environ.get("UVICORN_RELOAD", "").lower() in {
        "1",
        "true",
        "yes",
    }

    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=reload_enabled,
        log_level="info",
    )
