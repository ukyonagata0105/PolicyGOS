#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function chunk(array, size) {
  const batches = [];
  for (let index = 0; index < array.length; index += size) {
    batches.push(array.slice(index, index + size));
  }
  return batches;
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const candidates = [text];
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const start = text.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1).trim());
          break;
        }
      }
    }
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

function coerceRow(row) {
  return {
    source_reference: String(row.source_reference || ''),
    section_path: Array.isArray(row.section_path) ? row.section_path.map((item) => String(item)) : [],
    municipality: String(row.municipality || ''),
    project_number: String(row.project_number || ''),
    project_name: String(row.project_name || ''),
    project_summary: String(row.project_summary || ''),
    department: String(row.department || ''),
    budget: String(row.budget || ''),
    fiscal_year: String(row.fiscal_year || ''),
    status: String(row.status || ''),
    activity_indicator_name: String(row.activity_indicator_name || ''),
    activity_indicator_unit: String(row.activity_indicator_unit || ''),
    activity_planned_value: String(row.activity_planned_value || ''),
    activity_actual_value: String(row.activity_actual_value || ''),
    outcome_indicator_name: String(row.outcome_indicator_name || ''),
    outcome_indicator_unit: String(row.outcome_indicator_unit || ''),
    outcome_target_value: String(row.outcome_target_value || ''),
    outcome_actual_value: String(row.outcome_actual_value || ''),
    achievement: String(row.achievement || ''),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 0.6,
    review_flags: Array.isArray(row.review_flags) ? row.review_flags.map((item) => String(item)) : [],
  };
}

function buildPrompt(input, batchRows) {
  const refs = new Set(batchRows.map((row) => row.source_reference).filter(Boolean));
  const candidateRows = (input.candidate_rows || [])
    .filter((row) => refs.has(row.sourceReference || row.source_reference))
    .slice(0, 80)
    .map((row) => ({
      source_reference: row.sourceReference || row.source_reference || '',
      section_path: row.sectionPath || row.section_path || [],
      project_name_candidate: row.projectNameCandidate || row.project_name_candidate || '',
      project_summary_candidate: row.projectSummaryCandidate || row.project_summary_candidate || '',
      project_number: row.projectNumber || row.project_number || '',
      activity_indicator_name: row.activityIndicatorName || row.activity_indicator_name || '',
      indicator_unit: row.indicatorUnit || row.indicator_unit || '',
      actual_value: row.actualValue || row.actual_value || '',
      target_value: row.targetValue || row.target_value || '',
      department: row.department || '',
      budget: row.budget || '',
      row_fields: row.rowFields || row.row_fields || {},
    }));

  return [
    'You repair extracted local-government policy evaluation rows.',
    'Return JSON only.',
    'Required shape: {"normalized_rows":[{"source_reference":"","section_path":[],"municipality":"","project_number":"","project_name":"","project_summary":"","department":"","budget":"","fiscal_year":"","status":"","activity_indicator_name":"","activity_indicator_unit":"","activity_planned_value":"","activity_actual_value":"","outcome_indicator_name":"","outcome_indicator_unit":"","outcome_target_value":"","outcome_actual_value":"","achievement":"","confidence":0.0,"review_flags":[]}],"notes":[""]}',
    'Rules:',
    '- Output exactly one repaired row for every input normalized row in the same order.',
    '- Preserve source_reference exactly.',
    '- If a field cannot be improved safely, copy the input value unchanged.',
    '- Prefer municipality_hint over guessed municipality names.',
    '- Do not output section headers as projects.',
    '- Use empty string instead of null.',
    '- Only keep review_flags that still remain after repair.',
    '',
    'Input JSON:',
    JSON.stringify({
      document_id: input.document_id,
      document_name: input.document_name,
      municipality_hint: input.municipality_hint || '',
      title_hint: input.title_hint || '',
      overview_hint: input.overview_hint || '',
      normalized_rows: batchRows,
      candidate_rows: candidateRows,
      review_items: (input.review_items || []).slice(0, 30),
      raw_csv_preview: String(input.raw_csv || '').slice(0, 8000),
    }),
  ].join('\n');
}

async function requestGemini(apiKey, model, prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    }),
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const rawText = (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('');
  const parsed = extractJsonObject(rawText);
  if (!parsed) throw new Error('Gemini response was not valid JSON');
  return { parsed, rawText };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) throw new Error('Usage: --input <file> --output <file>');
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is required');
  const model = process.env.REPAIR_RUNNER_MODEL || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const input = JSON.parse(await readFile(args.input, 'utf8'));
  const baselineRows = Array.isArray(input.normalized_rows) ? input.normalized_rows.map(coerceRow) : [];
  const batches = chunk(baselineRows, baselineRows.length > 8 ? 8 : Math.max(baselineRows.length, 1));
  const normalizedRows = [];
  const notes = [];
  const rawResponses = [];

  for (const [batchIndex, batch] of batches.entries()) {
    if (batch.length === 0) continue;
    try {
      const { parsed, rawText } = await requestGemini(apiKey, model, buildPrompt(input, batch));
      rawResponses.push(rawText.slice(0, 8000));
      const repairedRows = Array.isArray(parsed.normalized_rows) ? parsed.normalized_rows.map(coerceRow) : [];
      if (repairedRows.length === 0) {
        notes.push(`chunk ${batchIndex + 1}: no valid repaired rows, kept original rows`);
        normalizedRows.push(...batch);
      } else {
        normalizedRows.push(...repairedRows);
      }
      if (Array.isArray(parsed.notes)) notes.push(...parsed.notes.map((item) => String(item)).filter(Boolean));
    } catch (error) {
      notes.push(`chunk ${batchIndex + 1}: ${error instanceof Error ? error.message : 'repair failed'}, kept original rows`);
      normalizedRows.push(...batch);
    }
  }

  await writeFile(
    args.output,
    JSON.stringify({ normalized_rows: normalizedRows, notes, raw_response: rawResponses.join('\n\n--- chunk ---\n\n') }, null, 2),
    'utf8'
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
