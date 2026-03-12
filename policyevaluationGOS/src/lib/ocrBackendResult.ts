interface ParsedOCRBackendPage {
  pageNumber: number;
  text: string;
  layoutText: string;
  csvTables: string[];
  hasTables: boolean;
}

export interface ParsedOCRBackendResult {
  text: string;
  layoutText: string;
  rawJson: string;
  rawCsv: string | null;
  pages: ParsedOCRBackendPage[];
  hasTables: boolean;
  classification?: string;
  classificationConfidence?: number;
  pathUsed?: string;
}

type JsonRecord = Record<string, unknown>;

export function parseOCRBackendJsonResult(rawJson: string): ParsedOCRBackendResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      text: rawJson,
      layoutText: rawJson,
      rawJson,
      rawCsv: null,
      pages: [],
      hasTables: false,
    };
  }

  if (isNormalizedDocument(parsed)) {
    return parseNormalizedDocument(parsed, rawJson);
  }

  return parseLegacyArray(parsed, rawJson);
}

function parseNormalizedDocument(document: JsonRecord, rawJson: string): ParsedOCRBackendResult {
  const pages = Array.isArray(document.pages) ? document.pages : [];
  const normalizedPages = pages.map((page, index) => parseNormalizedPage(page, index + 1));
  const text = normalizedPages.map((page) => page.text).filter(Boolean).join('\n\n').trim();
  const layoutText = normalizedPages
    .map((page) => [`## Page ${page.pageNumber}`, page.layoutText || page.text].filter(Boolean).join('\n'))
    .join('\n\n')
    .trim();
  const csvTables = normalizedPages.flatMap((page) =>
    page.csvTables.map((csv, csvIndex) => `# Page ${page.pageNumber} Table ${csvIndex + 1}\n${csv}`)
  );

  return {
    text,
    layoutText,
    rawJson,
    rawCsv: csvTables.length > 0 ? csvTables.join('\n\n') : null,
    pages: normalizedPages,
    hasTables: normalizedPages.some((page) => page.hasTables),
    classification: typeof document.classification === 'string' ? document.classification : undefined,
    classificationConfidence:
      typeof document.classification_confidence === 'number' ? document.classification_confidence : undefined,
    pathUsed: typeof document.path_used === 'string' ? document.path_used : undefined,
  };
}

function parseNormalizedPage(page: unknown, fallbackPageNumber: number): ParsedOCRBackendPage {
  const record = isRecord(page) ? page : {};
  const pageNumber =
    typeof record.page_number === 'number' ? record.page_number : fallbackPageNumber;
  const text = normalizeText(typeof record.text === 'string' ? record.text : '');
  const layoutText = normalizeTextPreservingLines(typeof record.layout_text === 'string' ? record.layout_text : text);
  const tables = Array.isArray(record.tables) ? record.tables : [];
  const csvTables = tables
    .map((table) => (isRecord(table) && typeof table.csv === 'string' ? table.csv.trim() : ''))
    .filter(Boolean);

  return {
    pageNumber,
    text,
    layoutText,
    csvTables,
    hasTables: csvTables.length > 0 || tables.length > 0,
  };
}

function parseLegacyArray(parsed: unknown, rawJson: string): ParsedOCRBackendResult {
  const pages = Array.isArray(parsed) ? parsed : [parsed];
  const normalizedPages = pages.map((page, index) => parseLegacyPage(page, index + 1));
  const text = normalizedPages.map((page) => page.text).filter(Boolean).join('\n\n').trim();
  const layoutText = normalizedPages
    .map((page) => [`## Page ${page.pageNumber}`, page.layoutText || page.text].filter(Boolean).join('\n'))
    .join('\n\n')
    .trim();
  const csvTables = normalizedPages.flatMap((page) =>
    page.csvTables.map((csv, csvIndex) => `# Page ${page.pageNumber} Table ${csvIndex + 1}\n${csv}`)
  );

  return {
    text,
    layoutText,
    rawJson,
    rawCsv: csvTables.length > 0 ? csvTables.join('\n\n') : null,
    pages: normalizedPages,
    hasTables: normalizedPages.some((page) => page.hasTables),
  };
}

function parseLegacyPage(page: unknown, pageNumber: number): ParsedOCRBackendPage {
  const pageRecord = isRecord(page) ? page : {};
  const directText = extractLegacyTextBlocks(pageRecord).join('\n').trim();
  const csvTables = extractLegacyTablesAsCsv(pageRecord);

  return {
    pageNumber,
    text: directText,
    layoutText: directText,
    csvTables,
    hasTables: csvTables.length > 0,
  };
}

function extractLegacyTextBlocks(page: JsonRecord): string[] {
  const paragraphs = Array.isArray(page.paragraphs) ? page.paragraphs : [];
  const paragraphTexts = paragraphs
    .filter(isRecord)
    .sort((left, right) => {
      const leftOrder = typeof left.order === 'number' ? left.order : 0;
      const rightOrder = typeof right.order === 'number' ? right.order : 0;
      return leftOrder - rightOrder;
    })
    .map((paragraph) => {
      const candidate =
        typeof paragraph.contents === 'string'
          ? paragraph.contents
          : typeof paragraph.text === 'string'
            ? paragraph.text
            : '';
      return normalizeText(candidate);
    })
    .filter(Boolean);
  if (paragraphTexts.length > 0) {
    return paragraphTexts;
  }

  const directTextBlocks = Array.isArray(page.text_blocks) ? page.text_blocks : [];
  const directTexts = directTextBlocks
    .filter(isRecord)
    .map((block) =>
      normalizeText(
        typeof block.text === 'string'
          ? block.text
          : typeof block.contents === 'string'
            ? block.contents
            : ''
      )
    )
    .filter(Boolean);
  if (directTexts.length > 0) {
    return directTexts;
  }

  const fallbackText = typeof page.text === 'string' ? normalizeText(page.text) : '';
  return fallbackText ? [fallbackText] : [];
}

function extractLegacyTablesAsCsv(root: JsonRecord): string[] {
  const csvTables: string[] = [];
  collectLegacyTables(root, csvTables);
  return csvTables;
}

function collectLegacyTables(value: unknown, csvTables: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectLegacyTables(item, csvTables));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const csv = extractLegacyCsvFromNode(value);
  if (csv) {
    csvTables.push(csv);
  }

  for (const nested of Object.values(value)) {
    collectLegacyTables(nested, csvTables);
  }
}

function extractLegacyCsvFromNode(node: JsonRecord): string | null {
  if (typeof node.csv === 'string' && node.csv.trim()) {
    return node.csv.trim();
  }

  if (Array.isArray(node.rows)) {
    const rows = node.rows
      .map((row) => {
        if (Array.isArray(row)) {
          return row.map(cellToString).filter(Boolean);
        }
        if (isRecord(row) && Array.isArray(row.cells)) {
          return row.cells.map(cellToString).filter(Boolean);
        }
        return [];
      })
      .filter((row) => row.length >= 2);
    if (rows.length >= 2) {
      return rowsToCsv(rows);
    }
  }

  if (Array.isArray(node.cells)) {
    const cells = node.cells
      .filter(isRecord)
      .map((cell) => {
        const row = typeof cell.row === 'number' ? cell.row : null;
        const col = typeof cell.col === 'number' ? cell.col : null;
        const text = cellToString(cell);
        return row === null || col === null || !text ? null : { row, col, text };
      })
      .filter((cell): cell is { row: number; col: number; text: string } => Boolean(cell));

    if (cells.length >= 4) {
      const rowIndexes = Array.from(new Set(cells.map((cell) => cell.row))).sort((left, right) => left - right);
      const colIndexes = Array.from(new Set(cells.map((cell) => cell.col))).sort((left, right) => left - right);
      const rows = rowIndexes
        .map((rowIndex) =>
          colIndexes.map(
            (colIndex) => cells.find((cell) => cell.row === rowIndex && cell.col === colIndex)?.text || ''
          )
        )
        .filter((row) => row.filter(Boolean).length >= 2);
      if (rows.length >= 2) {
        return rowsToCsv(rows);
      }
    }
  }

  return null;
}

function cellToString(cell: unknown): string {
  if (typeof cell === 'string' || typeof cell === 'number') {
    return normalizeText(String(cell));
  }
  if (!isRecord(cell)) {
    return '';
  }
  if (typeof cell.contents === 'string') {
    return normalizeText(cell.contents);
  }
  if (typeof cell.content === 'string') {
    return normalizeText(cell.content);
  }
  if (typeof cell.text === 'string') {
    return normalizeText(cell.text);
  }
  return '';
}

function rowsToCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function isNormalizedDocument(value: unknown): value is JsonRecord {
  return isRecord(value) && Array.isArray(value.pages);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTextPreservingLines(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
