from typing import Any, Optional

from pydantic import BaseModel


class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    message: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[str] = None
    error: Optional[str] = None
    pages: Optional[int] = None


class JobSubmitResponse(BaseModel):
    job_id: str
    status: str
    message: str


class SourceCandidate(BaseModel):
    url: str
    label: str
    file_name: str


class SourceDiscoveryResponse(BaseModel):
    source_url: str
    strategy: str
    candidates: list[SourceCandidate]


class RepairRow(BaseModel):
    source_reference: str
    section_path: list[str] = []
    municipality: Optional[str] = None
    project_number: Optional[str] = None
    project_name: str
    project_summary: str
    department: Optional[str] = None
    budget: Optional[str] = None
    fiscal_year: Optional[str] = None
    status: Optional[str] = None
    activity_indicator_name: Optional[str] = None
    activity_indicator_unit: Optional[str] = None
    activity_planned_value: Optional[str] = None
    activity_actual_value: Optional[str] = None
    outcome_indicator_name: Optional[str] = None
    outcome_indicator_unit: Optional[str] = None
    outcome_target_value: Optional[str] = None
    outcome_actual_value: Optional[str] = None
    achievement: Optional[str] = None
    confidence: float = 0.6
    review_flags: list[str] = []


class RepairRequest(BaseModel):
    document_id: str
    document_name: str
    municipality_hint: Optional[str] = None
    title_hint: Optional[str] = None
    overview_hint: Optional[str] = None
    raw_csv: Optional[str] = None
    extraction_raw_response: Optional[str] = None
    candidate_rows: list[dict[str, Any]] = []
    row_decisions: list[dict[str, Any]] = []
    normalized_rows: list[RepairRow] = []
    review_items: list[dict[str, Any]] = []
    gemini_api_key: Optional[str] = None
    model: Optional[str] = None
    agent: Optional[str] = None


class RepairResponse(BaseModel):
    success: bool
    provider: str
    model: Optional[str] = None
    normalized_rows: list[RepairRow] = []
    notes: list[str] = []
    raw_response: Optional[str] = None
    error: Optional[str] = None
