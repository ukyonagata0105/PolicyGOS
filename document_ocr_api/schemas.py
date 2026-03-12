"""
Pydantic schemas for Yomitoku FastAPI Wrapper
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum


class OutputFormat(str, Enum):
    """Supported output formats"""
    JSON = "json"
    MARKDOWN = "markdown"
    HTML = "html"
    CSV = "csv"


class DeviceType(str, Enum):
    """Supported device types"""
    CPU = "cpu"
    CUDA = "cuda"
    MPS = "mps"


class AnalysisRequest(BaseModel):
    """Request model for document analysis"""
    output_format: OutputFormat = Field(
        default=OutputFormat.JSON,
        description="Output format for the analysis result"
    )
    visualize: bool = Field(
        default=False,
        description="Whether to include visualization images"
    )
    device: DeviceType = Field(
        default=DeviceType.CPU,
        description="Device to use for inference"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "output_format": "json",
                "visualize": False,
                "device": "cpu"
            }
        }


class AnalysisResponse(BaseModel):
    """Response model for document analysis"""
    success: bool = Field(description="Whether the analysis was successful")
    format: OutputFormat = Field(description="The output format used")
    result: Optional[str] = Field(None, description="Analysis result in the requested format")
    error: Optional[str] = Field(None, description="Error message if analysis failed")
    pages: int = Field(description="Number of pages processed")
    processing_time_ms: int = Field(description="Processing time in milliseconds")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "format": "json",
                "result": "{\"text\": \"...\", \"layout\": [...]}",
                "error": None,
                "pages": 1,
                "processing_time_ms": 1500
            }
        }


class HealthResponse(BaseModel):
    """Response model for health check"""
    status: str = Field(description="Service status")
    version: str = Field(description="API version")
    yomitoku_available: bool = Field(description="Legacy compatibility flag for frontend clients")
    device: str = Field(description="Current device")
    ocr_backend_available: bool = Field(default=True, description="Whether the OCR backend is available")
    primary_engine: str = Field(default="pymupdf", description="Primary extraction engine")
    ocr_engine: Optional[str] = Field(default=None, description="OCR fallback engine")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "2.0.0",
                "yomitoku_available": True,
                "device": "cpu",
                "ocr_backend_available": True,
                "primary_engine": "pymupdf",
                "ocr_engine": "tesseract",
            }
        }


class SupportedFormatsResponse(BaseModel):
    """Response model for supported formats"""
    input_formats: list[str] = Field(description="Supported input file formats")
    output_formats: list[str] = Field(description="Supported output formats")

    class Config:
        json_schema_extra = {
            "example": {
                "input_formats": ["pdf", "png", "jpg", "jpeg", "tiff", "bmp"],
                "output_formats": ["json", "markdown", "html", "csv"]
            }
        }
