import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PDF_PATH = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';
const DEFAULT_OUTPUT_DIR = '/tmp/policyevgos-yomitoku-debug';

const pdfPath = process.env.PDF_PATH || process.argv[2] || DEFAULT_PDF_PATH;
const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
const outputDir = process.env.OUTPUT_DIR || DEFAULT_OUTPUT_DIR;

const rawJsonPath = path.join(outputDir, 'yomitoku-real.json');
const summaryPath = path.join(outputDir, 'yomitoku-real-summary.json');

await mkdir(outputDir, { recursive: true });

const fileBuffer = await readFile(pdfPath);
const formData = new FormData();
formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), path.basename(pdfPath));

const submitResponse = await fetch(`${backendUrl}/analyze/async?output_format=json`, {
  method: 'POST',
  body: formData,
});

if (!submitResponse.ok) {
  throw new Error(`Job submission failed: ${submitResponse.status} ${await submitResponse.text()}`);
}

const submitted = await submitResponse.json();
const startedAt = Date.now();

console.log(JSON.stringify({ event: 'submitted', jobId: submitted.job_id, pdfPath }, null, 2));

let finalStatus = null;

while (true) {
  const response = await fetch(`${backendUrl}/jobs/${submitted.job_id}`);
  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status} ${await response.text()}`);
  }

  const status = await response.json();
  console.log(JSON.stringify({
    event: 'progress',
    status: status.status,
    progress: status.progress,
    message: status.message,
    pages: status.pages ?? null,
  }));

  if (status.status === 'completed' || status.status === 'failed') {
    finalStatus = status;
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
}

if (finalStatus?.status !== 'completed' || typeof finalStatus.result !== 'string') {
  throw new Error(`OCR failed: ${JSON.stringify(finalStatus, null, 2)}`);
}

await writeFile(rawJsonPath, finalStatus.result, 'utf-8');

const parsed = JSON.parse(finalStatus.result);
const documentResult = Array.isArray(parsed)
  ? { pages: parsed, path_used: 'legacy', classification: 'unknown', classification_confidence: 0 }
  : parsed;
const pages = Array.isArray(documentResult.pages) ? documentResult.pages : [];
const pageStats = pages.map((page, index) => {
  const tables = Array.isArray(page.tables) ? page.tables : [];
  const nonEmptyCellCount = tables.reduce(
    (count, table) =>
      count +
      (Array.isArray(table.cells)
        ? table.cells.filter((cell) => typeof cell.contents === 'string' && cell.contents.trim().length > 0).length
        : 0),
    0
  );

  return {
    page: index + 1,
    textBlockCount: Array.isArray(page.text_blocks) ? page.text_blocks.length : 0,
    tableCount: tables.length,
    charCount: typeof page.char_count === 'number' ? page.char_count : 0,
    extractionMode: page.extraction_mode || 'unknown',
    nonEmptyCellCount,
  };
});

const topKeys = documentResult && typeof documentResult === 'object'
  ? Object.keys(documentResult)
  : [];
const synthesized = synthesizeDebugText(pages);

const summary = {
  sourceDocument: path.basename(pdfPath),
  backendUrl,
  durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  pages: finalStatus.pages ?? pages.length,
  classification: documentResult.classification || 'unknown',
  classificationConfidence: documentResult.classification_confidence ?? 0,
  pathUsed: documentResult.path_used || 'unknown',
  topKeys,
  pageStats,
  hasTables: synthesized.hasTables,
  textLength: synthesized.text.length,
  csvLength: synthesized.rawCsv.length,
  textPreview: synthesized.text.slice(0, 300),
  csvPreview: synthesized.rawCsv.slice(0, 300),
  sampleFieldPaths: [
    'pages[].text',
    'pages[].layout_text',
    'pages[].tables[].rows',
    'pages[].tables[].cells[].contents',
    'pages[].text_blocks[].text',
  ],
  rawJsonPath,
};

await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

console.log(JSON.stringify({
  event: 'completed',
  rawJsonPath,
  summaryPath,
  durationSeconds: summary.durationSeconds,
  topKeys: summary.topKeys,
  textLength: summary.textLength,
  csvLength: summary.csvLength,
}, null, 2));

function synthesizeDebugText(pages) {
  const pageTexts = [];
  const csvTables = [];

  for (const page of pages) {
    const readableParagraphs = filterReadableTexts(
      (Array.isArray(page.text_blocks) ? page.text_blocks : [])
        .map((block) => normalizeText(block?.text || block?.contents || ''))
        .filter(Boolean),
      10
    );
    if (readableParagraphs.length === 0 && typeof page.text === 'string') {
      readableParagraphs.push(...filterReadableTexts(page.text.split('\n'), 10));
    }
    const tables = extractTablesAsCsv(page);
    const tableSummaries = tables.slice(0, 3).map((csv, index) => summarizeCsv(csv, index + 1)).filter(Boolean);

    const pageText = [readableParagraphs.join('\n'), tableSummaries.join('\n\n')]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (pageText) {
      pageTexts.push(pageText);
    }
    csvTables.push(...tables);
  }

  return {
    text: pageTexts.join('\n\n').trim(),
    rawCsv: csvTables.join('\n\n').trim(),
    hasTables: csvTables.length > 0,
  };
}

function filterReadableTexts(texts, limit) {
  const seen = new Set();
  const filtered = [];

  for (const text of texts) {
    const normalized = normalizeText(text);
    if (!normalized || seen.has(normalized) || !looksReadable(normalized)) {
      continue;
    }

    seen.add(normalized);
    filtered.push(normalized);
    if (filtered.length >= limit) {
      break;
    }
  }

  return filtered;
}

function looksReadable(text) {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 4) {
    return false;
  }

  if (/^[A-Za-z0-9._-]+$/.test(compact) && compact.length < 12) {
    return false;
  }

  const japaneseChars = [...compact.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々]/gu)].length;
  const latinChars = [...compact.matchAll(/[A-Za-z]/g)].length;
  const digitChars = [...compact.matchAll(/[0-9０-９]/g)].length;
  const punctuationChars = [...compact.matchAll(/[.,、。:：;；()\[\]{}（）【】「」『』%％\/\-+]/g)].length;
  const coveredChars = japaneseChars + latinChars + digitChars + punctuationChars;
  const otherChars = Math.max(0, compact.length - coveredChars);

  if (otherChars / compact.length > 0.2) {
    return false;
  }

  if (japaneseChars === 0 && digitChars / compact.length >= 0.4) {
    return false;
  }

  if (japaneseChars + digitChars < Math.ceil(compact.length * 0.3) && compact.length < 12) {
    return false;
  }

  return true;
}

function extractTablesAsCsv(value) {
  const tables = [];
  collectTables(value, tables);
  return tables;
}

function collectTables(value, tables) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTables(item, tables));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const csv = extractCsvFromNode(value);
  if (csv) {
    tables.push(csv);
  }

  Object.values(value).forEach((nested) => collectTables(nested, tables));
}

function extractCsvFromNode(node) {
  if (typeof node.csv === 'string' && node.csv.trim()) {
    return node.csv.trim();
  }

  if (Array.isArray(node.rows)) {
    const rows = node.rows
      .map((row) => Array.isArray(row) ? row.map(cellToString).filter(Boolean) : [])
      .filter((row) => row.length >= 2);
    if (rows.length >= 2) {
      return buildCsv(rows);
    }
  }

  if (Array.isArray(node.cells)) {
    const indexed = node.cells
      .map((cell) => {
        const row = Number.isFinite(cell?.row) ? cell.row : null;
        const col = Number.isFinite(cell?.col) ? cell.col : null;
        const text = cellToString(cell);
        return row === null || col === null || !text ? null : { row, col, text };
      })
      .filter(Boolean);

    if (indexed.length >= 4) {
      const rows = new Map();
      indexed.forEach((cell) => {
        if (!rows.has(cell.row)) {
          rows.set(cell.row, new Map());
        }
        rows.get(cell.row).set(cell.col, cell.text);
      });
      const rowIndexes = [...rows.keys()].sort((a, b) => a - b);
      const colIndexes = [...new Set(indexed.map((cell) => cell.col))].sort((a, b) => a - b);
      const matrix = rowIndexes
        .map((rowIndex) => colIndexes.map((colIndex) => rows.get(rowIndex)?.get(colIndex) || ''))
        .filter((row) => row.filter(Boolean).length >= 2);
      if (matrix.length >= 2) {
        return buildCsv(matrix);
      }
    }
  }

  return null;
}

function summarizeCsv(csv, index) {
  const rows = csv.split('\n').map((line) => line.trim()).filter(Boolean).map(splitCsvLine);
  if (rows.length < 2) {
    return '';
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  return [
    `Table ${index}`,
    `Headers: ${rows[headerRowIndex].slice(0, 6).filter(Boolean).join(' | ')}`,
    `Rows:\n${rows.slice(headerRowIndex + 1).filter((row) => row.some(Boolean)).slice(0, 3).map((row) => row.slice(0, 6).filter(Boolean).join(' | ')).filter(Boolean).join('\n')}`,
  ].filter(Boolean).join('\n');
}

function findHeaderRowIndex(rows) {
  const candidateRows = rows.slice(0, Math.min(4, rows.length));
  let bestIndex = 0;
  let bestScore = -Infinity;

  candidateRows.forEach((row, index) => {
    const nonEmptyCells = row.filter(Boolean);
    if (nonEmptyCells.length === 0) {
      return;
    }

    const alphaNumericCells = nonEmptyCells.filter((cell) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u.test(cell)).length;
    const emptyPenalty = row.length - nonEmptyCells.length;
    const score = nonEmptyCells.length * 3 + alphaNumericCells * 2 - emptyPenalty;

    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function cellToString(cell) {
  const value =
    typeof cell === 'string' || typeof cell === 'number'
      ? String(cell)
      : typeof cell?.contents === 'string'
      ? cell.contents
      : typeof cell?.content === 'string'
      ? cell.content
      : typeof cell?.text === 'string'
      ? cell.text
      : '';
  return normalizeText(value);
}

function buildCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
