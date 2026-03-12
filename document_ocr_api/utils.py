"""
Utility functions for Yomitoku FastAPI Wrapper
"""

import os
import io
import logging
import tempfile
from pathlib import Path
from typing import Optional, Tuple, List
import time

import cv2
import numpy as np
from PIL import Image
from fastapi import UploadFile, HTTPException


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Supported file extensions
SUPPORTED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif'}
SUPPORTED_PDF_EXTENSIONS = {'.pdf'}
SUPPORTED_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS | SUPPORTED_PDF_EXTENSIONS


def get_file_extension(filename: str) -> str:
    """Get the file extension from a filename"""
    return Path(filename).suffix.lower()


def is_supported_file(filename: str) -> bool:
    """Check if the file format is supported"""
    return get_file_extension(filename) in SUPPORTED_EXTENSIONS


def is_pdf(filename: str) -> bool:
    """Check if the file is a PDF"""
    return get_file_extension(filename) in SUPPORTED_PDF_EXTENSIONS


def is_image(filename: str) -> bool:
    """Check if the file is an image"""
    return get_file_extension(filename) in SUPPORTED_IMAGE_EXTENSIONS


async def save_upload_file_tmp(upload_file: UploadFile) -> Tuple[str, str]:
    """
    Save an uploaded file to a temporary location.

    Args:
        upload_file: The uploaded file from FastAPI

    Returns:
        Tuple of (temp_file_path, original_filename)
    """
    # Validate file type
    if not is_supported_file(upload_file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Supported formats: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    # Create a temporary file
    suffix = get_file_extension(upload_file.filename)
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        # Write the uploaded file content
        content = await upload_file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name

    logger.info(f"Saved uploaded file to: {tmp_file_path}")
    return tmp_file_path, upload_file.filename


def load_image_from_file(file_path: str) -> np.ndarray:
    """
    Load an image from file path using OpenCV.

    Args:
        file_path: Path to the image file

    Returns:
        Image as numpy array in BGR format
    """
    img = cv2.imread(file_path)
    if img is None:
        raise ValueError(f"Failed to load image: {file_path}")
    return img


def load_images_from_pdf(file_path: str) -> List[np.ndarray]:
    """
    Load images from a PDF file using Yomitoku's load_pdf function.

    Args:
        file_path: Path to the PDF file

    Returns:
        List of images as numpy arrays
    """
    try:
        from yomitoku.data.functions import load_pdf
        images = load_pdf(file_path)
        return images
    except ImportError:
        # Fallback to basic PDF rendering if yomitoku.data.functions is not available
        logger.warning("yomitoku.data.functions.load_pdf not available, using fallback")
        import fitz  # PyMuPDF

        doc = fitz.open(file_path)
        images = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render page to pixmap
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x scaling for better quality
            # Convert to numpy array
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
            # Convert RGB to BGR for OpenCV
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            images.append(img)

        doc.close()
        return images


def cleanup_temp_file(file_path: str) -> None:
    """
    Remove a temporary file.

    Args:
        file_path: Path to the temporary file
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temp file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup temp file {file_path}: {e}")


class Timer:
    """Context manager for timing operations"""

    def __init__(self):
        self.start_time = None
        self.end_time = None

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, *args):
        self.end_time = time.time()

    @property
    def elapsed_ms(self) -> int:
        """Get elapsed time in milliseconds"""
        if self.start_time is None:
            return 0
        end = self.end_time if self.end_time else time.time()
        return int((end - self.start_time) * 1000)


def validate_device(device: str) -> str:
    """
    Validate and normalize the device string.

    Args:
        device: Device string (cpu, cuda, mps)

    Returns:
        Normalized device string

    Raises:
        ValueError: If device is not supported
    """
    device = device.lower()
    if device not in ['cpu', 'cuda', 'mps']:
        raise ValueError(f"Unsupported device: {device}. Use 'cpu', 'cuda', or 'mps'")
    return device


def get_available_device() -> str:
    """
    Get the best available device for inference.

    Returns:
        Device string ('cuda', 'mps', or 'cpu')
    """
    try:
        import torch
        if torch.cuda.is_available():
            return 'cuda'
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return 'mps'
    except ImportError:
        pass
    return 'cpu'
