import time
from datetime import datetime
from typing import Any, Optional

from api_models import JobStatus
from utils import logger


class JobService:
    def __init__(self, job_ttl_seconds: int, max_stored_jobs: int):
        self.job_ttl_seconds = job_ttl_seconds
        self.max_stored_jobs = max_stored_jobs
        self.jobs: dict[str, dict[str, Any]] = {}

    def cleanup_expired_jobs(self) -> None:
        now = time.time()
        removable = []

        for job_id, job in self.jobs.items():
            created_at = datetime.fromisoformat(job["created_at"]).timestamp()
            if now - created_at > self.job_ttl_seconds:
                removable.append(job_id)

        for job_id in removable:
            self.jobs.pop(job_id, None)

        if len(self.jobs) > self.max_stored_jobs:
            sorted_job_ids = sorted(
                self.jobs.items(), key=lambda item: item[1]["created_at"]
            )
            overflow = len(self.jobs) - self.max_stored_jobs
            for job_id, _ in sorted_job_ids[:overflow]:
                self.jobs.pop(job_id, None)

    def create_pending_job(self, job_id: str) -> None:
        self.jobs[job_id] = {
            "job_id": job_id,
            "status": "pending",
            "progress": 0,
            "message": "ジョブをキューに追加しました",
            "created_at": datetime.now().isoformat(),
            "started_at": None,
            "completed_at": None,
            "result": None,
            "error": None,
            "pages": None,
        }

    def get_job_status(self, job_id: str) -> JobStatus:
        return JobStatus(**self.jobs[job_id])

    def has_job(self, job_id: str) -> bool:
        return job_id in self.jobs

    def delete_job(self, job_id: str) -> None:
        del self.jobs[job_id]

    def mark_processing(self, job_id: str) -> None:
        self.jobs[job_id]["status"] = "processing"
        self.jobs[job_id]["started_at"] = datetime.now().isoformat()

    def update_progress(
        self, job_id: str, progress: int, message: str, pages: Optional[int] = None
    ) -> None:
        if job_id in self.jobs:
            self.jobs[job_id]["progress"] = progress
            self.jobs[job_id]["message"] = message
            if pages is not None:
                self.jobs[job_id]["pages"] = pages
            logger.info(f"Job {job_id}: {progress}% - {message}")

    def mark_completed(
        self, job_id: str, result: str, pages: int, processing_time_ms: int
    ) -> None:
        self.jobs[job_id]["status"] = "completed"
        self.jobs[job_id]["progress"] = 100
        self.jobs[job_id]["message"] = "処理完了"
        self.jobs[job_id]["completed_at"] = datetime.now().isoformat()
        self.jobs[job_id]["result"] = result
        self.jobs[job_id]["pages"] = pages
        self.jobs[job_id]["processing_time_ms"] = processing_time_ms

    def mark_failed(self, job_id: str, error: Exception) -> None:
        self.jobs[job_id]["status"] = "failed"
        self.jobs[job_id]["error"] = str(error)
        self.jobs[job_id]["message"] = f"処理エラー: {error}"
        self.jobs[job_id]["completed_at"] = datetime.now().isoformat()
