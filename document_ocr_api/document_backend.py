import csv
import io
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from html import unescape
from threading import Lock
from typing import Any, Callable, Dict, List, Optional

import cv2
import fitz
import numpy as np
from utils import is_pdf, load_image_from_file, logger


ProgressCallback = Optional[Callable[[int, str, Optional[int]], None]]
SCHEMA_VERSION = "ocr-backend-v1"
_PADDLE_OCR_INSTANCE = None
_PADDLE_OCR_LOCK = Lock()
_PADDLE_TABLE_INSTANCE = None
_PADDLE_TABLE_LOCK = Lock()


@dataclass
class OCRBackendCapabilities:
    pymupdf_available: bool
    paddleocr_available: bool
    tesseract_available: bool
    tesseract_languages: List[str]


def get_backend_capabilities() -> OCRBackendCapabilities:
    return OCRBackendCapabilities(
        pymupdf_available=importlib.util.find_spec("fitz") is not None,
        paddleocr_available=(
            importlib.util.find_spec("paddleocr") is not None
            and importlib.util.find_spec("paddle") is not None
        ),
        tesseract_available=shutil.which("tesseract") is not None,
        tesseract_languages=_list_tesseract_languages(),
    )

def analyze_document(
    file_path: str,
    original_filename: str,
    output_format: str,
    progress_callback: ProgressCallback = None,
) -> Dict[str, Any]:
    if is_pdf(original_filename):
        document = analyze_pdf_document(file_path, progress_callback)
    else:
        document = analyze_image_document(file_path, progress_callback)

    return {
        "document": document,
        "formatted": format_document_output(document, output_format),
        "pages": len(document.get("pages", [])),
    }


def analyze_pdf_document(file_path: str, progress_callback: ProgressCallback = None) -> Dict[str, Any]:
    capabilities = get_backend_capabilities()
    doc = fitz.open(file_path)

    metadata = _normalize_metadata(doc.metadata or {})
    page_results: List[Dict[str, Any]] = []
    page_modes: List[str] = []
    total_pages = len(doc)

    for page_index, page in enumerate(doc, start=1):
        progress = 20 + int((page_index / max(total_pages, 1)) * 60)
        progress_callback and progress_callback(progress, f"ページ {page_index}/{total_pages} を解析中...", total_pages)
        page_result = analyze_pdf_page(page, capabilities)
        page_results.append(page_result)
        page_modes.append(page_result["extraction_mode"])

    classification, confidence = classify_document(page_results)
    path_used = "pdf_text_fast_path" if classification == "digital_text_pdf" else "backend_ocr"

    return {
        "schema_version": SCHEMA_VERSION,
        "engine": {
            "primary": "pymupdf",
            "ocr": _resolve_ocr_engine_name(capabilities),
        },
        "classification": classification,
        "classification_confidence": confidence,
        "path_used": path_used,
        "metadata": metadata,
        "pages": page_results,
        "summary": {
            "page_count": total_pages,
            "page_modes": page_modes,
            "table_count": sum(len(page["tables"]) for page in page_results),
        },
    }


def analyze_image_document(file_path: str, progress_callback: ProgressCallback = None) -> Dict[str, Any]:
    capabilities = get_backend_capabilities()
    progress_callback and progress_callback(35, "画像をOCR解析中...", 1)
    image = load_image_from_file(file_path)
    ocr_page = _extract_ocr_page(image, 1, capabilities)
    progress_callback and progress_callback(90, "結果を整形中...", 1)

    return {
        "schema_version": SCHEMA_VERSION,
        "engine": {
            "primary": "image-ocr",
            "ocr": ocr_page["ocr_engine"],
        },
        "classification": "image_pdf",
        "classification_confidence": 0.92,
        "path_used": "backend_ocr",
        "metadata": {},
        "pages": [ocr_page],
        "summary": {
            "page_count": 1,
            "page_modes": [ocr_page["extraction_mode"]],
            "table_count": len(ocr_page["tables"]),
        },
    }


def analyze_pdf_page(page: fitz.Page, capabilities: OCRBackendCapabilities) -> Dict[str, Any]:
    digital_page = _extract_digital_page(page)
    if _should_use_digital_page(digital_page):
        return digital_page

    image = _render_page_to_bgr(page)
    ocr_page = _extract_ocr_page(image, page.number + 1, capabilities)
    if ocr_page["char_count"] >= max(digital_page["char_count"] * 1.2, 40):
        return ocr_page
    return digital_page


def _extract_digital_page(page: fitz.Page) -> Dict[str, Any]:
    blocks = page.get_text("blocks", sort=True)
    words = page.get_text("words", sort=True)
    plain_text = _normalize_text(page.get_text("text", sort=True))
    layout_text = _build_layout_text_from_words(words) or plain_text
    text_blocks = [
        {
            "text": _normalize_text(block[4]),
            "bbox": [float(block[0]), float(block[1]), float(block[2]), float(block[3])],
            "source": "pymupdf",
        }
        for block in blocks
        if len(block) >= 5 and _normalize_text(block[4])
    ]
    tables = _extract_tables_from_page(page)

    return {
        "page_number": page.number + 1,
        "text": plain_text,
        "layout_text": layout_text,
        "text_blocks": text_blocks,
        "tables": tables,
        "char_count": len(plain_text.replace(" ", "")),
        "extraction_mode": "digital",
        "ocr_engine": None,
    }


def _should_use_digital_page(page_result: Dict[str, Any]) -> bool:
    if page_result["char_count"] >= 80:
        return True
    if page_result["char_count"] >= 40 and len(page_result["tables"]) > 0:
        return True
    return False


def _extract_tables_from_page(page: fitz.Page) -> List[Dict[str, Any]]:
    try:
        finder = page.find_tables()
    except Exception as error:
        logger.warning(f"PyMuPDF table extraction failed on page {page.number + 1}: {error}")
        return []

    tables: List[Dict[str, Any]] = []
    for index, table in enumerate(finder.tables, start=1):
        rows = [
            ["" if cell is None else _normalize_text(str(cell)) for cell in row]
            for row in table.extract()
        ]
        meaningful_rows = [row for row in rows if any(cell for cell in row)]
        if len(meaningful_rows) < 2:
            continue

        row_count = len(meaningful_rows)
        col_count = max(len(row) for row in meaningful_rows)
        normalized_rows = [row + [""] * (col_count - len(row)) for row in meaningful_rows]
        tables.append(
            {
                "table_index": index,
                "bbox": [float(value) for value in table.bbox],
                "row_count": row_count,
                "col_count": col_count,
                "rows": normalized_rows,
                "cells": _rows_to_cells(normalized_rows),
                "csv": _rows_to_csv(normalized_rows),
                "markdown": _rows_to_markdown(normalized_rows),
                "source": "pymupdf",
            }
        )

    return tables


def _extract_ocr_page(
    image: np.ndarray,
    page_number: int,
    capabilities: OCRBackendCapabilities,
) -> Dict[str, Any]:
    if capabilities.paddleocr_available:
        try:
            return _extract_page_with_paddleocr(image, page_number)
        except Exception as error:
            logger.warning(f"PaddleOCR failed on page {page_number}: {error}")

    if capabilities.tesseract_available:
        return _extract_page_with_tesseract(image, page_number, capabilities.tesseract_languages)

    raise RuntimeError("No OCR engine available. Install PaddleOCR or Tesseract.")


def _extract_page_with_paddleocr(image: np.ndarray, page_number: int) -> Dict[str, Any]:
    ocr = _get_paddle_ocr()
    result = ocr.ocr(image)
    lines = []
    for line in _iter_paddle_lines(result):
        text = _normalize_text(line.get("text", ""))
        bbox = _normalize_bbox(line.get("bbox"))
        if not text or not bbox:
            continue
        lines.append({"text": text, "bbox": bbox})

    return _build_ocr_page_from_lines(lines, page_number, "paddleocr", source_image=image)


def _get_paddle_ocr():
    global _PADDLE_OCR_INSTANCE
    if _PADDLE_OCR_INSTANCE is not None:
        return _PADDLE_OCR_INSTANCE

    with _PADDLE_OCR_LOCK:
        if _PADDLE_OCR_INSTANCE is not None:
            return _PADDLE_OCR_INSTANCE

        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        from paddleocr import PaddleOCR

        _PADDLE_OCR_INSTANCE = PaddleOCR(
            lang="japan",
            use_textline_orientation=True,
        )
        return _PADDLE_OCR_INSTANCE


def _iter_paddle_lines(result: Any) -> List[Dict[str, Any]]:
    lines: List[Dict[str, Any]] = []

    for item in result or []:
        payload = item
        if hasattr(payload, "items"):
            payload = dict(payload)

        if isinstance(payload, dict):
            rec_texts = payload.get("rec_texts") or []
            rec_polys = payload.get("rec_polys") or payload.get("dt_polys") or []
            for text, poly in zip(rec_texts, rec_polys):
                lines.append({"text": text, "bbox": poly})
            continue

        if isinstance(payload, list):
            for candidate in payload:
                if not isinstance(candidate, (list, tuple)) or len(candidate) != 2:
                    continue
                points, rec = candidate
                text = ""
                if isinstance(rec, (list, tuple)) and rec:
                    text = str(rec[0])
                elif isinstance(rec, str):
                    text = rec
                lines.append({"text": text, "bbox": points})

    return lines


def _normalize_bbox(raw_bbox: Any) -> Optional[List[float]]:
    if raw_bbox is None:
        return None
    if hasattr(raw_bbox, "tolist"):
        raw_bbox = raw_bbox.tolist()

    if (
        isinstance(raw_bbox, (list, tuple))
        and len(raw_bbox) == 4
        and all(isinstance(value, (int, float)) for value in raw_bbox)
    ):
        left, top, right, bottom = raw_bbox
        return [float(left), float(top), float(right), float(bottom)]

    if isinstance(raw_bbox, (list, tuple)) and len(raw_bbox) >= 4:
        points = []
        for point in raw_bbox:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            points.append((float(point[0]), float(point[1])))
        if points:
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            return [min(xs), min(ys), max(xs), max(ys)]

    return None


def _extract_page_with_tesseract(
    image: np.ndarray,
    page_number: int,
    languages: List[str],
) -> Dict[str, Any]:
    lang = "jpn+eng" if "jpn" in languages else "eng"
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
      temp_path = temp_file.name
    try:
        cv2.imwrite(temp_path, image)
        command = [
            shutil.which("tesseract") or "tesseract",
            temp_path,
            "stdout",
            "-l",
            lang,
            "--psm",
            "6",
            "tsv",
        ]
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "Tesseract OCR failed")

        lines = _parse_tesseract_tsv(completed.stdout)
        return _build_ocr_page_from_lines(lines, page_number, "tesseract", source_image=image)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def _build_ocr_page_from_lines(
    lines: List[Dict[str, Any]],
    page_number: int,
    engine_name: str,
    source_image: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    ordered_lines = sorted(lines, key=lambda line: (line["bbox"][1], line["bbox"][0]))
    text_blocks = [
        {
            "text": line["text"],
            "bbox": [float(value) for value in line["bbox"]],
            "source": engine_name,
        }
        for line in ordered_lines
        if line["text"]
    ]
    text = "\n".join(line["text"] for line in text_blocks).strip()
    tables: List[Dict[str, Any]] = []
    if source_image is not None and engine_name == "paddleocr":
        tables = _extract_tables_with_paddle_table_recognizer(source_image, page_number, ordered_lines)
    if not tables:
        tables = _infer_tables_from_ocr_boxes(ordered_lines, engine_name)
    if not tables:
        tables = _infer_tables_from_ocr_lines(ordered_lines, engine_name)
    return {
        "page_number": page_number,
        "text": text,
        "layout_text": text,
        "text_blocks": text_blocks,
        "tables": tables,
        "char_count": len(text.replace(" ", "")),
        "extraction_mode": "ocr",
        "ocr_engine": engine_name,
    }


def _infer_tables_from_ocr_boxes(lines: List[Dict[str, Any]], engine_name: str) -> List[Dict[str, Any]]:
    if len(lines) < 12:
        return []

    row_groups = _cluster_boxes_into_rows(lines)
    candidate_rows = [_boxes_to_row_cells(group) for group in row_groups]
    candidate_rows = [row for row in candidate_rows if len(row) >= 3]

    if len(candidate_rows) < 2:
        return []

    col_anchors = _cluster_column_anchors(candidate_rows)
    if len(col_anchors) < 3:
        return []

    normalized_rows = [_align_cells_to_columns(row, col_anchors) for row in candidate_rows]
    meaningful_rows = [row for row in normalized_rows if sum(1 for cell in row if cell) >= 2]
    if len(meaningful_rows) < 2:
        return []

    return [
        {
            "table_index": 1,
            "bbox": _merge_bboxes([line["bbox"] for line in lines]),
            "row_count": len(postprocessed_rows := _postprocess_ocr_table_rows(meaningful_rows)),
            "col_count": len(postprocessed_rows[0]) if postprocessed_rows else len(col_anchors),
            "rows": postprocessed_rows,
            "cells": _rows_to_cells(postprocessed_rows),
            "csv": _rows_to_csv(postprocessed_rows),
            "markdown": _rows_to_markdown(postprocessed_rows),
            "source": f"{engine_name}-heuristic",
        }
    ]


def _extract_tables_with_paddle_table_recognizer(
    image: np.ndarray,
    page_number: int,
    ocr_lines: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    try:
        recognizer = _get_paddle_table_recognizer()
    except Exception as error:
        logger.warning(f"Paddle table recognizer unavailable on page {page_number}: {error}")
        return []

    try:
        result = recognizer.predict(image)
    except Exception as error:
        logger.warning(f"Paddle table recognizer failed on page {page_number}: {error}")
        return []

    parsed_tables: List[Dict[str, Any]] = []
    for item in result or []:
        payload = dict(item) if hasattr(item, "items") else item
        if not isinstance(payload, dict):
            continue
        table_res_list = payload.get("table_res_list") or []
        for index, table_res in enumerate(table_res_list, start=1):
            table_payload = dict(table_res) if hasattr(table_res, "items") else table_res
            if not isinstance(table_payload, dict):
                continue
            cell_boxes = table_payload.get("cell_box_list")
            if hasattr(cell_boxes, "tolist"):
                cell_boxes = cell_boxes.tolist()
            if cell_boxes is None:
                cell_boxes = []
            normalized_cell_boxes = [
                _normalize_bbox(box.tolist() if hasattr(box, "tolist") else box)
                for box in cell_boxes
                if box is not None
            ]
            normalized_cell_boxes = [box for box in normalized_cell_boxes if box]
            rows = _rows_from_table_cells(normalized_cell_boxes, ocr_lines)
            if len(rows) < 2:
                pred_html = table_payload.get("pred_html") or ""
                rows = _rows_from_table_html(pred_html)
            if len(rows) < 2:
                continue
            normalized_bbox = _merge_bboxes(normalized_cell_boxes)
            postprocessed_rows = _postprocess_ocr_table_rows(rows)
            parsed_tables.append(
                {
                    "table_index": index,
                    "bbox": normalized_bbox,
                    "row_count": len(postprocessed_rows),
                    "col_count": max(len(row) for row in postprocessed_rows),
                    "rows": postprocessed_rows,
                    "cells": _rows_to_cells(postprocessed_rows),
                    "csv": _rows_to_csv(postprocessed_rows),
                    "markdown": _rows_to_markdown(postprocessed_rows),
                    "source": "paddleocr-table-cells",
                }
            )
    return parsed_tables


def _get_paddle_table_recognizer():
    global _PADDLE_TABLE_INSTANCE
    if _PADDLE_TABLE_INSTANCE is not None:
        return _PADDLE_TABLE_INSTANCE

    with _PADDLE_TABLE_LOCK:
        if _PADDLE_TABLE_INSTANCE is not None:
            return _PADDLE_TABLE_INSTANCE

        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        from paddleocr import TableRecognitionPipelineV2

        _PADDLE_TABLE_INSTANCE = TableRecognitionPipelineV2(
            use_layout_detection=True,
            use_ocr_model=True,
        )
        return _PADDLE_TABLE_INSTANCE


def _rows_from_table_html(pred_html: str) -> List[List[str]]:
    if not pred_html:
        return []

    rows: List[List[str]] = []
    for tr_match in re.findall(r"<tr[^>]*>(.*?)</tr>", pred_html, flags=re.IGNORECASE | re.DOTALL):
        cells: List[str] = []
        for cell_match in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr_match, flags=re.IGNORECASE | re.DOTALL):
            text = re.sub(r"<[^>]+>", " ", cell_match)
            text = unescape(text)
            text = " ".join(text.split()).strip()
            cells.append(text)
        if any(cell for cell in cells):
            rows.append(cells)

    if not rows:
        return []

    col_count = max(len(row) for row in rows)
    return [row + [""] * (col_count - len(row)) for row in rows]


def _rows_from_table_cells(
    cell_boxes: List[List[float]],
    ocr_lines: List[Dict[str, Any]],
) -> List[List[str]]:
    if len(cell_boxes) < 4 or not ocr_lines:
        return []

    boxes = sorted(cell_boxes, key=lambda box: (box[1], box[0]))
    row_groups = _cluster_cell_boxes_into_rows(boxes)
    if len(row_groups) < 2:
        return []

    column_anchors = _cluster_cell_box_columns(row_groups)
    rows: List[List[str]] = []
    for group in row_groups:
        row = [""] * len(column_anchors)
        for box in sorted(group, key=lambda item: item[0]):
            col_index = min(range(len(column_anchors)), key=lambda index: abs(column_anchors[index] - box[0]))
            texts = _texts_for_cell_box(box, ocr_lines)
            row[col_index] = " ".join(texts).strip()
        rows.append(row)

    non_empty_rows = [row for row in rows if any(cell for cell in row)]
    if len(non_empty_rows) < 2:
        return []
    return non_empty_rows


def _postprocess_ocr_table_rows(rows: List[List[str]]) -> List[List[str]]:
    if not rows:
        return rows

    col_count = max(len(row) for row in rows)
    normalized = [row + [""] * (col_count - len(row)) for row in rows]

    normalized = _drop_empty_columns(normalized)
    normalized = _merge_sparse_columns(normalized)
    normalized = _drop_empty_columns(normalized)
    normalized = _normalize_cell_texts(normalized)
    header_row_count = _infer_header_row_count(normalized)
    normalized = _merge_prefix_columns_into_label_column(normalized, header_row_count)
    normalized = _drop_empty_columns(normalized)
    return normalized


def _drop_empty_columns(rows: List[List[str]]) -> List[List[str]]:
    if not rows:
        return rows

    col_count = len(rows[0])
    keep_indices = [
        index
        for index in range(col_count)
        if any(index < len(row) and row[index].strip() for row in rows)
    ]
    if not keep_indices:
        return rows
    return [[row[index] for index in keep_indices] for row in rows]


def _merge_sparse_columns(rows: List[List[str]]) -> List[List[str]]:
    if not rows:
        return rows

    col_count = len(rows[0])
    occupancies = [
        sum(1 for row in rows if index < len(row) and row[index].strip())
        for index in range(col_count)
    ]

    mutable = [row[:] for row in rows]
    for index in range(1, col_count - 1):
        current = occupancies[index]
        left = occupancies[index - 1]
        right = occupancies[index + 1]
        if current == 0 or current > 2:
            continue
        if max(left, right) < max(3, current * 2):
            continue

        for row in mutable:
            value = row[index].strip()
            if not value:
                continue
            target = index - 1 if left >= right else index + 1
            if row[target].strip():
                row[target] = f"{row[target]} {value}".strip()
            else:
                row[target] = value
            row[index] = ""

    return mutable


def _normalize_cell_texts(rows: List[List[str]]) -> List[List[str]]:
    return [[_normalize_ocr_cell_text(cell) for cell in row] for row in rows]


def _normalize_ocr_cell_text(value: str) -> str:
    text = " ".join(value.split()).strip()
    if not text:
        return ""

    if _looks_numeric_like(text):
        mapped = text.translate(
            str.maketrans(
                {
                    "O": "0",
                    "o": "0",
                    "D": "0",
                    "Q": "0",
                    "I": "1",
                    "l": "1",
                    "S": "5",
                    "s": "5",
                    "B": "8",
                    "。": ".",
                    "，": ",",
                    "：": ":",
                }
            )
        )
        mapped = re.sub(r"(?<=\d)[,:](?=\d{1,3}\b)", ".", mapped)
        mapped = re.sub(r"[^0-9.%()+\-/:]", "", mapped)
        if mapped:
            return mapped

    return text


def _looks_numeric_like(value: str) -> bool:
    if not value:
        return False
    digit_count = sum(char.isdigit() for char in value)
    if digit_count == 0:
        return False
    allowed = sum(char.isdigit() or char in ".:,()%+-/ ODoQIlSsB。：" for char in value)
    return digit_count >= 1 and allowed / max(len(value), 1) >= 0.7


def _infer_header_row_count(rows: List[List[str]]) -> int:
    header_rows = 0
    for row in rows[:3]:
        non_empty = [cell for cell in row if cell]
        if not non_empty:
            continue
        text_like = sum(1 for cell in non_empty if not _looks_numeric_like(cell))
        numeric_like = sum(1 for cell in non_empty if _looks_numeric_like(cell))
        if text_like >= numeric_like:
            header_rows += 1
        else:
            break
    return min(header_rows, 2)


def _merge_prefix_columns_into_label_column(rows: List[List[str]], header_row_count: int) -> List[List[str]]:
    if not rows or len(rows[0]) < 3:
        return rows

    label_col = _detect_label_column(rows, header_row_count)
    if label_col <= 0:
        return rows

    mutable = [row[:] for row in rows]
    for row_index, row in enumerate(mutable):
        if row_index < header_row_count:
            continue
        for index in range(label_col):
            value = row[index].strip()
            if not value:
                continue
            if _looks_numeric_like(value) and len(value) > 2:
                continue
            if row[label_col].strip():
                row[label_col] = f"{value} {row[label_col]}".strip()
            else:
                row[label_col] = value
            row[index] = ""
    return mutable


def _detect_label_column(rows: List[List[str]], header_row_count: int) -> int:
    search_limit = min(4, len(rows[0]))
    best_index = 0
    best_score = -1.0
    body_rows = rows[header_row_count:] or rows
    for index in range(search_limit):
        cells = [row[index].strip() for row in body_rows if index < len(row) and row[index].strip()]
        if not cells:
            continue
        text_like = sum(1 for cell in cells if not _looks_numeric_like(cell))
        avg_len = sum(len(cell) for cell in cells) / len(cells)
        score = text_like * 2 + avg_len
        if score > best_score:
            best_score = score
            best_index = index
    return best_index


def _cluster_cell_boxes_into_rows(cell_boxes: List[List[float]]) -> List[List[List[float]]]:
    tolerance = 18.0
    rows: List[List[List[float]]] = []
    for box in cell_boxes:
        center_y = (box[1] + box[3]) / 2
        if not rows:
            rows.append([box])
            continue
        last_row = rows[-1]
        last_center = np.mean([(item[1] + item[3]) / 2 for item in last_row])
        if abs(center_y - last_center) <= tolerance:
            last_row.append(box)
        else:
            rows.append([box])
    return rows


def _cluster_cell_box_columns(row_groups: List[List[List[float]]]) -> List[float]:
    anchors: List[float] = []
    tolerance = 24.0
    for row in row_groups:
        for box in row:
            x = box[0]
            matched = False
            for index, anchor in enumerate(anchors):
                if abs(anchor - x) <= tolerance:
                    anchors[index] = (anchor + x) / 2.0
                    matched = True
                    break
            if not matched:
                anchors.append(x)
    return sorted(anchors)


def _texts_for_cell_box(cell_box: List[float], ocr_lines: List[Dict[str, Any]]) -> List[str]:
    matched: List[tuple[float, str]] = []
    for line in ocr_lines:
        overlap = _bbox_overlap_ratio(cell_box, line["bbox"])
        center_x = (line["bbox"][0] + line["bbox"][2]) / 2
        center_y = (line["bbox"][1] + line["bbox"][3]) / 2
        inside = cell_box[0] <= center_x <= cell_box[2] and cell_box[1] <= center_y <= cell_box[3]
        if overlap >= 0.2 or inside:
            matched.append((line["bbox"][0], line["text"]))
    matched.sort(key=lambda item: item[0])
    texts: List[str] = []
    for _, text in matched:
        if text and text not in texts:
            texts.append(text)
    return texts


def _bbox_overlap_ratio(a: List[float], b: List[float]) -> float:
    x_left = max(a[0], b[0])
    y_top = max(a[1], b[1])
    x_right = min(a[2], b[2])
    y_bottom = min(a[3], b[3])
    if x_right <= x_left or y_bottom <= y_top:
        return 0.0
    intersection = (x_right - x_left) * (y_bottom - y_top)
    b_area = max((b[2] - b[0]) * (b[3] - b[1]), 1.0)
    return float(intersection / b_area)


def _infer_tables_from_ocr_lines(lines: List[Dict[str, Any]], engine_name: str) -> List[Dict[str, Any]]:
    if len(lines) < 2:
        return []

    rows = []
    for line in lines:
        words = _split_line_into_cells(line["text"])
        if len(words) >= 2:
            rows.append(words)

    if len(rows) < 2:
        return []

    col_count = max(len(row) for row in rows)
    normalized_rows = [row + [""] * (col_count - len(row)) for row in rows]
    return [
        {
            "table_index": 1,
            "bbox": _merge_bboxes([line["bbox"] for line in lines]),
            "row_count": len(normalized_rows),
            "col_count": col_count,
            "rows": normalized_rows,
            "cells": _rows_to_cells(normalized_rows),
            "csv": _rows_to_csv(normalized_rows),
            "markdown": _rows_to_markdown(normalized_rows),
            "source": engine_name,
        }
    ]


def classify_document(page_results: List[Dict[str, Any]]) -> tuple[str, float]:
    if not page_results:
        return "unknown", 0.0

    digital_pages = sum(1 for page in page_results if page["extraction_mode"] == "digital")
    ocr_pages = len(page_results) - digital_pages
    text_rich_pages = sum(1 for page in page_results if page["char_count"] >= 80)

    if digital_pages == len(page_results) and text_rich_pages >= max(1, len(page_results) - 1):
        return "digital_text_pdf", 0.96
    if ocr_pages == len(page_results):
        return "image_pdf", 0.9
    return "mixed_pdf", 0.82


def format_document_output(document: Dict[str, Any], output_format: str) -> str:
    if output_format == "json":
        return json.dumps(document, ensure_ascii=False, indent=2)

    if output_format == "markdown":
        parts = []
        for page in document.get("pages", []):
            page_parts = [f"## Page {page['page_number']}"]
            if page.get("layout_text"):
                page_parts.append(page["layout_text"])
            for table in page.get("tables", []):
                page_parts.append(table.get("markdown") or table.get("csv") or "")
            parts.append("\n\n".join(part for part in page_parts if part))
        return "\n\n---\n\n".join(parts)

    if output_format == "csv":
        csv_parts = []
        for page in document.get("pages", []):
            for index, table in enumerate(page.get("tables", []), start=1):
                csv_parts.append(f"# Page {page['page_number']} Table {index}\n{table.get('csv', '')}")
        return "\n\n".join(csv_parts)

    if output_format == "html":
        body_parts = []
        for page in document.get("pages", []):
            body_parts.append(f"<h2>Page {page['page_number']}</h2>")
            body_parts.append(f"<pre>{_escape_html(page.get('layout_text', ''))}</pre>")
        return f"<html><body>{''.join(body_parts)}</body></html>"

    raise ValueError(f"Unsupported output format: {output_format}")


def _parse_tesseract_tsv(tsv_text: str) -> List[Dict[str, Any]]:
    rows = list(csv.DictReader(io.StringIO(tsv_text), delimiter="\t"))
    line_map: Dict[tuple[str, str, str, str], List[Dict[str, Any]]] = {}

    for row in rows:
        text = _normalize_text(row.get("text", ""))
        if not text:
            continue
        conf = float(row.get("conf", "-1") or -1)
        if conf < 0:
            continue

        key = (
            row.get("page_num", "1"),
            row.get("block_num", "0"),
            row.get("par_num", "0"),
            row.get("line_num", "0"),
        )
        line_map.setdefault(key, []).append(
            {
                "text": text,
                "left": int(row.get("left", "0") or 0),
                "top": int(row.get("top", "0") or 0),
                "width": int(row.get("width", "0") or 0),
                "height": int(row.get("height", "0") or 0),
            }
        )

    lines: List[Dict[str, Any]] = []
    for items in line_map.values():
        items.sort(key=lambda item: item["left"])
        line_text = " ".join(item["text"] for item in items)
        bbox = _merge_bboxes(
            [
                [item["left"], item["top"], item["left"] + item["width"], item["top"] + item["height"]]
                for item in items
            ]
        )
        lines.append({"text": line_text, "bbox": bbox})
    return lines


def _build_layout_text_from_words(words: List[List[Any]]) -> str:
    if not words:
        return ""

    lines: List[List[List[Any]]] = []
    for word in words:
        if len(word) < 5:
            continue
        current_y = float(word[3])
        if not lines:
            lines.append([word])
            continue
        last_y = float(lines[-1][0][3])
        if abs(current_y - last_y) <= 4:
            lines[-1].append(word)
        else:
            lines.append([word])

    rendered = []
    for line in lines:
        line.sort(key=lambda item: float(item[0]))
        rendered.append(" ".join(_normalize_text(str(item[4])) for item in line if _normalize_text(str(item[4]))))
    return "\n".join(entry for entry in rendered if entry).strip()


def _rows_to_cells(rows: List[List[str]]) -> List[Dict[str, Any]]:
    cells = []
    for row_index, row in enumerate(rows, start=1):
        for col_index, value in enumerate(row, start=1):
            cells.append({"row": row_index, "col": col_index, "contents": value})
    return cells


def _rows_to_csv(rows: List[List[str]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL)
    writer.writerows(rows)
    return buffer.getvalue().strip()


def _rows_to_markdown(rows: List[List[str]]) -> str:
    if not rows:
        return ""
    header = rows[0]
    divider = ["---"] * len(header)
    body = rows[1:]
    markdown_rows = [header, divider, *body]
    return "\n".join("| " + " | ".join(cell or "" for cell in row) + " |" for row in markdown_rows)


def _split_line_into_cells(text: str) -> List[str]:
    return [cell.strip() for cell in text.replace("\u3000", "  ").split("  ") if cell.strip()]


def _cluster_boxes_into_rows(lines: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    if not lines:
        return []

    heights = [max(line["bbox"][3] - line["bbox"][1], 1.0) for line in lines]
    median_height = float(np.median(heights)) if heights else 12.0
    tolerance = max(8.0, median_height * 0.8)

    rows: List[List[Dict[str, Any]]] = []
    for line in sorted(lines, key=lambda item: ((item["bbox"][1] + item["bbox"][3]) / 2, item["bbox"][0])):
        center_y = (line["bbox"][1] + line["bbox"][3]) / 2
        if not rows:
            rows.append([line])
            continue
        last_row = rows[-1]
        last_center = np.mean([(item["bbox"][1] + item["bbox"][3]) / 2 for item in last_row])
        if abs(center_y - last_center) <= tolerance:
            last_row.append(line)
        else:
            rows.append([line])
    return rows


def _boxes_to_row_cells(row: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ordered = sorted(row, key=lambda item: item["bbox"][0])
    widths = [max(item["bbox"][2] - item["bbox"][0], 1.0) for item in ordered]
    median_width = float(np.median(widths)) if widths else 8.0
    gap_threshold = max(18.0, median_width * 2.0)

    cells: List[Dict[str, Any]] = []
    current: List[Dict[str, Any]] = []
    for item in ordered:
        if not current:
            current = [item]
            continue
        gap = item["bbox"][0] - current[-1]["bbox"][2]
        if gap > gap_threshold:
            cells.append(_merge_cell_group(current))
            current = [item]
        else:
            current.append(item)
    if current:
        cells.append(_merge_cell_group(current))
    return cells


def _merge_cell_group(group: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "text": "".join(item["text"] for item in group).strip(),
        "bbox": _merge_bboxes([item["bbox"] for item in group]),
    }


def _cluster_column_anchors(rows: List[List[Dict[str, Any]]]) -> List[float]:
    anchors: List[float] = []
    tolerance = 28.0
    for row in rows:
        for cell in row:
            x = float(cell["bbox"][0])
            matched = False
            for index, anchor in enumerate(anchors):
                if abs(anchor - x) <= tolerance:
                    anchors[index] = (anchor + x) / 2.0
                    matched = True
                    break
            if not matched:
                anchors.append(x)
    return sorted(anchors)


def _align_cells_to_columns(row: List[Dict[str, Any]], anchors: List[float]) -> List[str]:
    aligned = [""] * len(anchors)
    for cell in row:
        x = float(cell["bbox"][0])
        nearest_index = min(range(len(anchors)), key=lambda index: abs(anchors[index] - x))
        if aligned[nearest_index]:
            aligned[nearest_index] = f"{aligned[nearest_index]} {cell['text']}".strip()
        else:
            aligned[nearest_index] = cell["text"]
    return aligned


def _normalize_text(value: str) -> str:
    return " ".join(value.split()).strip()


def _normalize_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in metadata.items() if value}


def _resolve_ocr_engine_name(capabilities: OCRBackendCapabilities) -> Optional[str]:
    if capabilities.paddleocr_available:
        return "paddleocr"
    if capabilities.tesseract_available:
        return "tesseract"
    return None


def _render_page_to_bgr(page: fitz.Page, scale: float = 2.0) -> np.ndarray:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape((pixmap.height, pixmap.width, pixmap.n))
    if pixmap.n == 4:
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2BGR)
    else:
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    return image


def _merge_bboxes(bboxes: List[List[float]]) -> List[float]:
    if not bboxes:
        return [0.0, 0.0, 0.0, 0.0]
    return [
        float(min(bbox[0] for bbox in bboxes)),
        float(min(bbox[1] for bbox in bboxes)),
        float(max(bbox[2] for bbox in bboxes)),
        float(max(bbox[3] for bbox in bboxes)),
    ]


def _list_tesseract_languages() -> List[str]:
    executable = shutil.which("tesseract")
    if not executable:
        return []
    completed = subprocess.run(
        [executable, "--list-langs"],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return []
    return [line.strip() for line in completed.stdout.splitlines()[1:] if line.strip()]


def _escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
