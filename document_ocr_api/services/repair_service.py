import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Optional

import requests

from api_models import RepairRequest, RepairResponse, RepairRow


def extract_json_object(raw_text: str) -> Optional[dict[str, Any]]:
    text = raw_text.strip()
    if not text:
        return None

    candidates = [text]
    if "```" in text:
        fenced_start = text.lower().find("```json")
        if fenced_start >= 0:
            fenced_body = text[fenced_start + len("```json") :]
            fenced_end = fenced_body.find("```")
            if fenced_end >= 0:
                candidates.append(fenced_body[:fenced_end].strip())

    start = text.find("{")
    if start >= 0:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(text[start : index + 1].strip())
                    break

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue

    return None


def get_repair_row_value(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return " / ".join(str(item) for item in value if str(item).strip())
        return str(value)
    return ""


def build_gemini_repair_context(request: RepairRequest) -> dict[str, Any]:
    normalized_refs = {
        row.source_reference
        for row in request.normalized_rows
        if row.source_reference and row.project_name
    }
    candidate_rows = []
    for row in request.candidate_rows:
        source_reference = get_repair_row_value(
            row, "sourceReference", "source_reference"
        )
        if normalized_refs and source_reference not in normalized_refs:
            continue
        candidate_rows.append(
            {
                "source_reference": source_reference,
                "section_path": row.get("sectionPath") or row.get("section_path") or [],
                "project_name_candidate": get_repair_row_value(
                    row, "projectNameCandidate", "project_name_candidate"
                ),
                "project_summary_candidate": get_repair_row_value(
                    row, "projectSummaryCandidate", "project_summary_candidate"
                ),
                "project_number": get_repair_row_value(
                    row, "projectNumber", "project_number"
                ),
                "activity_indicator_name": get_repair_row_value(
                    row, "activityIndicatorName", "activity_indicator_name"
                ),
                "indicator_unit": get_repair_row_value(
                    row, "indicatorUnit", "indicator_unit"
                ),
                "actual_value": get_repair_row_value(
                    row, "actualValue", "actual_value"
                ),
                "target_value": get_repair_row_value(
                    row, "targetValue", "target_value"
                ),
                "department": get_repair_row_value(row, "department"),
                "budget": get_repair_row_value(row, "budget"),
                "status": get_repair_row_value(row, "status"),
                "fiscal_year": get_repair_row_value(row, "fiscalYear", "fiscal_year"),
                "row_fields": row.get("rowFields") or row.get("row_fields") or {},
            }
        )
        if len(candidate_rows) >= 120:
            break

    row_decisions = []
    for row in request.row_decisions[:120]:
        row_decisions.append(
            {
                "source_reference": get_repair_row_value(
                    row, "sourceReference", "source_reference"
                ),
                "decision": get_repair_row_value(row, "decision"),
                "section_path": row.get("sectionPath") or row.get("section_path") or [],
                "project_name": get_repair_row_value(
                    row, "projectName", "project_name"
                ),
                "project_summary": get_repair_row_value(
                    row, "projectSummary", "project_summary"
                ),
                "quality_hints": row.get("qualityHints")
                or row.get("quality_hints")
                or [],
                "review_flags": row.get("reviewFlags") or row.get("review_flags") or [],
            }
        )

    normalized_rows = []
    for row in request.normalized_rows[:120]:
        normalized_rows.append(
            {
                "source_reference": row.source_reference,
                "section_path": row.section_path,
                "municipality": row.municipality or "",
                "project_number": row.project_number or "",
                "project_name": row.project_name,
                "project_summary": row.project_summary,
                "department": row.department or "",
                "budget": row.budget or "",
                "fiscal_year": row.fiscal_year or "",
                "status": row.status or "",
                "activity_indicator_name": row.activity_indicator_name or "",
                "activity_indicator_unit": row.activity_indicator_unit or "",
                "activity_planned_value": row.activity_planned_value or "",
                "activity_actual_value": row.activity_actual_value or "",
                "outcome_indicator_name": row.outcome_indicator_name or "",
                "outcome_indicator_unit": row.outcome_indicator_unit or "",
                "outcome_target_value": row.outcome_target_value or "",
                "outcome_actual_value": row.outcome_actual_value or "",
                "achievement": row.achievement or "",
                "confidence": row.confidence,
                "review_flags": row.review_flags,
            }
        )

    review_items = []
    for item in request.review_items[:60]:
        review_items.append(
            {
                "reason": get_repair_row_value(item, "reason"),
                "severity": get_repair_row_value(item, "severity"),
                "project_id": get_repair_row_value(item, "projectId", "project_id"),
            }
        )

    return {
        "document_id": request.document_id,
        "document_name": request.document_name,
        "municipality_hint": request.municipality_hint or "",
        "title_hint": request.title_hint or "",
        "overview_hint": request.overview_hint or "",
        "normalized_rows": normalized_rows,
        "candidate_rows": candidate_rows,
        "row_decisions": row_decisions,
        "review_items": review_items,
        "raw_csv_preview": (request.raw_csv or "")[:10000],
        "extraction_preview": (request.extraction_raw_response or "")[:5000],
    }


def build_gemini_repair_prompt(
    request: RepairRequest, fallback_reason: Optional[str] = None
) -> str:
    context = build_gemini_repair_context(request)
    prompt_parts = [
        "You repair extracted local-government policy evaluation rows.",
        "Return JSON only.",
        'Required shape: {"normalized_rows":[{"source_reference":"","section_path":[],"municipality":"","project_number":"","project_name":"","project_summary":"","department":"","budget":"","fiscal_year":"","status":"","activity_indicator_name":"","activity_indicator_unit":"","activity_planned_value":"","activity_actual_value":"","outcome_indicator_name":"","outcome_indicator_unit":"","outcome_target_value":"","outcome_actual_value":"","achievement":"","confidence":0.0,"review_flags":[]}],"notes":[""]}',
        "Rules:",
        "- Keep one repaired row per existing normalized row whenever possible.",
        "- Preserve source_reference exactly from the input normalized_rows.",
        "- Prefer municipality_hint over any guessed municipality in the text.",
        "- Do not output section headers, notes, or policy headings as projects.",
        "- Improve project_name, project_summary, project_number, and indicator mapping when supported by candidate_rows or raw_csv_preview.",
        "- Use empty string instead of null.",
        "- Keep review_flags only for issues that still remain after repair.",
    ]
    if fallback_reason:
        prompt_parts.append(
            f"- Previous repair path failed with: {fallback_reason[:400]}"
        )
    prompt_parts.extend(
        [
            "",
            "Input JSON:",
            json.dumps(context, ensure_ascii=False, indent=2),
        ]
    )
    return "\n".join(prompt_parts)


def request_gemini_json(
    api_key: str, model: str, prompt: str
) -> tuple[Optional[dict[str, Any]], str, Optional[str]]:
    api_base_url = os.environ.get(
        "GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
    )
    endpoint = (
        f"{api_base_url.rstrip('/')}/models/{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
            "maxOutputTokens": 8192,
        },
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=120)
        response.raise_for_status()
    except Exception as error:
        return None, "", str(error)

    try:
        data = response.json()
    except Exception:
        return None, response.text, "Gemini response was not valid JSON"

    raw_text = "".join(
        part.get("text", "")
        for candidate in data.get("candidates", [])
        for part in candidate.get("content", {}).get("parts", [])
        if isinstance(part, dict)
    )
    parsed = extract_json_object(raw_text)
    if parsed:
        return parsed, raw_text, None

    repair_prompt = "\n".join(
        [
            "Convert the following text into one valid JSON object only.",
            "Do not add explanation.",
            raw_text[:16000],
        ]
    )
    try:
        repair_response = requests.post(
            endpoint,
            json={
                "contents": [{"role": "user", "parts": [{"text": repair_prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0,
                    "maxOutputTokens": 4096,
                },
            },
            timeout=120,
        )
        repair_response.raise_for_status()
        repair_data = repair_response.json()
        repaired_text = "".join(
            part.get("text", "")
            for candidate in repair_data.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
            if isinstance(part, dict)
        )
        repaired_parsed = extract_json_object(repaired_text)
        if repaired_parsed:
            return repaired_parsed, repaired_text, None
        return None, repaired_text, "Gemini repaired response was not valid JSON"
    except Exception as error:
        return None, raw_text, str(error)


def coerce_repair_rows(rows: list[Any]) -> list[RepairRow]:
    normalized_rows = []
    for row in rows:
        try:
            normalized_rows.append(RepairRow(**row))
        except Exception:
            continue
    return normalized_rows


def run_gemini_repair(
    request: RepairRequest,
    fallback_reason: Optional[str] = None,
    raw_response: Optional[str] = None,
) -> RepairResponse:
    api_key = (
        request.gemini_api_key
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GOOGLE_API_KEY")
    )
    if not api_key:
        return RepairResponse(
            success=False,
            provider="gemini-repair-fallback",
            model=request.model,
            raw_response=raw_response,
            error=fallback_reason
            or "Gemini API key is not configured for repair fallback",
        )

    model = (
        request.model
        if request.model and request.model.startswith("gemini")
        else (os.environ.get("GEMINI_MODEL") or "gemini-flash-lite-latest")
    )
    batch_size = (
        8 if len(request.normalized_rows) > 8 else max(len(request.normalized_rows), 1)
    )
    batches = [
        request.normalized_rows[index : index + batch_size]
        for index in range(0, max(len(request.normalized_rows), 1), batch_size)
    ]
    if not batches:
        batches = [[]]

    collected_rows: list[RepairRow] = []
    collected_notes: list[str] = []
    raw_responses: list[str] = []
    successful_batches = 0
    last_error = fallback_reason or "Gemini repair fallback failed"

    for batch_index, batch in enumerate(batches, start=1):
        batch_request = request.model_copy(
            update={
                "normalized_rows": batch,
                "review_items": request.review_items[:20],
            }
        )
        parsed, gemini_raw_response, error = request_gemini_json(
            api_key,
            model,
            build_gemini_repair_prompt(batch_request, fallback_reason),
        )
        if gemini_raw_response:
            raw_responses.append(gemini_raw_response[:12000])

        if not parsed:
            last_error = error or last_error
            collected_notes.append(
                f"chunk {batch_index}: repair failed, kept original rows"
            )
            collected_rows.extend(batch)
            continue

        rows = coerce_repair_rows(parsed.get("normalized_rows") or [])
        if not rows:
            last_error = error or "Gemini repair returned no valid normalized rows"
            collected_notes.append(
                f"chunk {batch_index}: no valid repaired rows, kept original rows"
            )
            collected_rows.extend(batch)
            continue

        successful_batches += 1
        collected_rows.extend(rows)
        collected_notes.extend(
            str(note) for note in (parsed.get("notes") or []) if str(note).strip()
        )

    success = len(collected_rows) > 0
    return RepairResponse(
        success=success,
        provider="gemini-repair-fallback",
        model=model,
        normalized_rows=collected_rows,
        notes=collected_notes,
        raw_response="\n\n--- chunk ---\n\n".join(raw_responses)
        if raw_responses
        else raw_response,
        error=None if successful_batches > 0 else last_error,
    )


def run_opencode_repair(request: RepairRequest) -> RepairResponse:
    project_root = Path(__file__).resolve().parent.parent.parent
    runner_script = (
        Path(os.environ["REPAIR_RUNNER_SCRIPT"])
        if os.environ.get("REPAIR_RUNNER_SCRIPT")
        else project_root
        / "policyevaluationGOS"
        / "tools"
        / "policyeval-repair-runner"
        / "bin"
        / "policyeval-repair-runner.mjs"
    )
    if not runner_script.exists():
        return run_gemini_repair(
            request,
            fallback_reason=f"repair runner not found: {runner_script}",
        )

    node_bin = os.environ.get("REPAIR_RUNNER_NODE") or shutil.which("node")
    if not node_bin:
        return run_gemini_repair(
            request,
            fallback_reason="node binary not found for repair runner",
        )

    model = (
        request.model
        if request.model and request.model.startswith("gemini")
        else (
            os.environ.get("REPAIR_RUNNER_MODEL")
            or os.environ.get("GEMINI_MODEL")
            or "gemini-flash-lite-latest"
        )
    )
    payload = request.model_dump(mode="json")

    with NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        input_path = Path(handle.name)
    with NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as handle:
        handle.write("{}")
        output_path = Path(handle.name)

    try:
        command = [
            node_bin,
            str(runner_script),
            "--input",
            str(input_path),
            "--output",
            str(output_path),
        ]

        env = os.environ.copy()
        env["CI"] = "1"
        env["REPAIR_RUNNER_MODEL"] = model
        if request.gemini_api_key:
            env["GEMINI_API_KEY"] = request.gemini_api_key
            env["GOOGLE_API_KEY"] = request.gemini_api_key

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=240,
            env=env,
            cwd=str(project_root),
        )
        raw_response = (completed.stdout or "").strip()
        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            return run_gemini_repair(
                request,
                fallback_reason=stderr
                or f"repair runner exited with code {completed.returncode}",
                raw_response=raw_response or stderr,
            )

        try:
            parsed = json.loads(output_path.read_text(encoding="utf-8"))
        except Exception:
            parsed = extract_json_object(output_path.read_text(encoding="utf-8"))
        if not parsed:
            return run_gemini_repair(
                request,
                fallback_reason="repair runner response was not valid JSON",
                raw_response=raw_response or output_path.read_text(encoding="utf-8"),
            )

        rows = parsed.get("normalized_rows") or []
        notes = parsed.get("notes") or []
        normalized_rows = []
        for row in rows:
            try:
                normalized_rows.append(RepairRow(**row))
            except Exception:
                continue

        return RepairResponse(
            success=len(normalized_rows) > 0,
            provider="repair-runner",
            model=model,
            normalized_rows=normalized_rows,
            notes=[str(note) for note in notes if str(note).strip()],
            raw_response=parsed.get("raw_response") or raw_response,
            error=None
            if normalized_rows
            else "repair runner returned no valid normalized rows",
        )
    except subprocess.TimeoutExpired:
        return run_gemini_repair(
            request,
            fallback_reason="repair runner timed out after 240s",
        )
    except Exception as error:
        return run_gemini_repair(
            request,
            fallback_reason=str(error),
        )
    finally:
        input_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
