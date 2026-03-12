import { generateJsonWithFallback } from '@/lib/llmProviders';
import type {
  ParsedTable,
  ParserDecision,
  ParserHints,
  TableArtifact,
  TableParseResult,
  TableParserId,
} from '@/types';

interface TableParser {
  id: Exclude<TableParserId, 'no_parse'>;
  canParse(artifact: TableArtifact): boolean;
  parse(artifact: TableArtifact, hints?: ParserHints): ParsedTable | null;
}

interface SelectorResponse {
  parser_id?: string;
  confidence?: number;
  header_rows?: number;
  row_label_col?: number;
  notes?: string;
  fallback_parser_ids?: string[];
}

interface LlmTableRepairResponse {
  headers?: string[];
  rows?: string[][];
  notes?: string;
}

interface ExtractTableArtifactOptions {
  rawCsv?: string;
  sourceType?: TableArtifact['sourceType'];
  sourcePath?: TableArtifact['sourcePath'];
}

const TABLE_SELECTOR_SYSTEM_PROMPT = `You are a table parsing router.
Return only JSON:
{
  "parser_id": "backend_csv_passthrough|markdown_table|fixed_width_columns|key_value_rows|multi_header_matrix|ledger_budget_table|no_parse",
  "confidence": 0.0,
  "header_rows": 1,
  "row_label_col": 0,
  "notes": "short reason",
  "fallback_parser_ids": ["parser_id"]
}
Choose one parser based on table shape, not semantics.`;

const TABLE_REPAIR_SYSTEM_PROMPT = `You normalize OCR-broken Japanese tables into structured JSON.
Return only JSON:
{
  "headers": ["col1", "col2"],
  "rows": [["r1c1", "r1c2"]],
  "notes": "short reason"
}
Rules:
- Preserve numeric values exactly when present.
- Repair broken headers and row labels when possible.
- Keep the output compact and tabular.
- Do not invent rows or summary text.
- If unusable, return empty headers and rows.`;

const TABLE_PARSER_IDS: TableParserId[] = [
  'backend_csv_passthrough',
  'markdown_table',
  'fixed_width_columns',
  'key_value_rows',
  'multi_header_matrix',
  'ledger_budget_table',
  'llm_repair',
  'no_parse',
];

export function extractTableArtifacts(
  ocrText: string,
  sourceDocumentId: string,
  options: ExtractTableArtifactOptions = {}
): TableArtifact[] {
  if (options.rawCsv) {
    const csvArtifacts = extractCsvArtifacts(options.rawCsv, sourceDocumentId, options);
    if (csvArtifacts.length > 0) {
      return csvArtifacts;
    }
  }

  const artifacts: TableArtifact[] = [];
  const blocks = ocrText.split(/\n\s*\n/g);
  let currentPage: number | null = null;
  let tableIndex = 0;

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map(normalizeArtifactLine)
      .filter(Boolean);
    const trimmed = lines.join('\n').trim();
    if (!trimmed) {
      continue;
    }

    const pageMatch = trimmed.match(/^## Page (\d+)/m);
    if (pageMatch) {
      currentPage = Number(pageMatch[1]);
    }
    if (!looksLikeTable(trimmed)) {
      continue;
    }

    tableIndex += 1;
    artifacts.push({
      id: `${sourceDocumentId}-table-${tableIndex}`,
      sourceDocumentId,
      page: currentPage,
      tableIndex,
      sourceType:
        options.sourceType ||
        (options.rawCsv ? 'backend_csv' : trimmed.includes('|') ? 'ocr_markdown' : 'ocr_text'),
      preview: trimmed.split('\n').slice(0, 8).join('\n'),
      rawText: trimmed,
      rawMarkdown: trimmed.includes('|') ? trimmed : undefined,
      rawCsv: tableIndex === 1 ? options.rawCsv : undefined,
      layoutText: options.sourceType === 'pdf_layout_text' ? trimmed : undefined,
      sourcePath: options.sourcePath,
    });
  }

  return artifacts;
}

function extractCsvArtifacts(
  rawCsv: string,
  sourceDocumentId: string,
  options: ExtractTableArtifactOptions
): TableArtifact[] {
  const sections = rawCsv
    .split(/\n{2,}(?=# Page \d+ Table \d+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section, index) => {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
    const headerLine = lines[0] || '';
    const pageMatch = headerLine.match(/^# Page (\d+) Table (\d+)/);
    const csvLines = pageMatch ? lines.slice(1) : lines;
    const page = pageMatch ? Number(pageMatch[1]) : null;
    const tableIndex = pageMatch ? Number(pageMatch[2]) : index + 1;

    return {
      id: `${sourceDocumentId}-table-${index + 1}`,
      sourceDocumentId,
      page,
      tableIndex,
      sourceType: 'backend_csv',
      preview: csvLines.slice(0, 8).join('\n'),
      rawText: csvLines.join('\n'),
      rawCsv: csvLines.join('\n'),
      sourcePath: options.sourcePath,
    };
  });
}

export async function parseTableArtifacts(artifacts: TableArtifact[]): Promise<TableParseResult[]> {
  const results: TableParseResult[] = [];

  for (const artifact of artifacts) {
    const decision = await selectParserDecision(artifact);
    results.push(await parseArtifactWithDecision(artifact, decision));
  }

  return results;
}

export function buildTableContextForStructuring(tableResults: TableParseResult[]): string {
  const parsedTables = tableResults.filter(
    (result): result is Extract<TableParseResult, { status: 'parsed' }> => result.status === 'parsed'
  );

  if (parsedTables.length === 0) {
    return '';
  }

  return parsedTables
    .slice(0, 3)
    .map((result, index) => {
      const previewRows = result.table.rows.slice(0, 3).map((row) => row.join(' | ')).join('\n');
      return [
        `Table ${index + 1}`,
        `Headers: ${result.table.headers.join(' | ')}`,
        `Rows:\n${previewRows || 'N/A'}`,
      ].join('\n');
    })
    .join('\n\n');
}

async function parseArtifactWithDecision(artifact: TableArtifact, decision: ParserDecision): Promise<TableParseResult> {
  const tried = new Set<TableParserId>();
  const candidateIds: TableParserId[] = [decision.parserId, ...decision.fallbackParserIds, 'no_parse'];

  for (const parserId of candidateIds) {
    if (tried.has(parserId)) {
      continue;
    }
    tried.add(parserId);

    if (parserId === 'no_parse') {
      break;
    }

    const parser = TABLE_PARSERS.find((entry) => entry.id === parserId);
    if (!parser || !parser.canParse(artifact)) {
      continue;
    }

    const parsed = parser.parse(artifact, decision.hints);
    if (!parsed) {
      continue;
    }

    const issues = validateParsedTable(parsed, artifact);
    if (issues.length === 0) {
      return {
        status: 'parsed',
        table: parsed,
        decision,
      };
    }
  }

  const repaired = await attemptLlmRepair(artifact);
  if (repaired) {
    return {
      status: 'parsed',
      table: repaired,
      decision: {
        ...decision,
        parserId: 'llm_repair',
        confidence: 0.35,
      },
    };
  }

  return {
    status: 'unparsed',
    table: {
      id: `${artifact.id}-unparsed`,
      artifactId: artifact.id,
      parserId: 'no_parse',
      preview: artifact.preview,
      reason: 'No parser produced a valid normalized table',
      issues: ['validation_failed'],
    },
    decision,
  };
}

async function attemptLlmRepair(artifact: TableArtifact): Promise<ParsedTable | null> {
  if (artifact.sourceType === 'backend_csv') {
    return null;
  }

  const response = await generateJsonWithFallback<LlmTableRepairResponse>({
    systemPrompt: TABLE_REPAIR_SYSTEM_PROMPT,
    prompt: [
      `Source type: ${artifact.sourceType}`,
      `Preview:\n${artifact.preview}`,
      artifact.rawCsv ? `CSV:\n${artifact.rawCsv}` : `Raw text:\n${artifact.rawText}`,
    ].join('\n\n'),
    temperature: 0.1,
    maxTokens: 2048,
  });

  if (!response.success || !response.data) {
    return null;
  }

  const headers = Array.isArray(response.data.headers)
    ? response.data.headers.map((cell) => String(cell ?? '').trim())
    : [];
  const rows = Array.isArray(response.data.rows)
    ? response.data.rows.map((row) =>
        Array.isArray(row) ? row.map((cell) => String(cell ?? '').trim()) : []
      )
    : [];

  if (headers.length < 2 || rows.length === 0) {
    return null;
  }

  const repaired = buildParsedTable(artifact, 'llm_repair', headers, rows);
  if (response.data.notes) {
    repaired.issues = [`llm_repair:${response.data.notes}`];
  }
  const issues = validateParsedTable(repaired, artifact);
  return issues.length === 0 ? repaired : null;
}

async function selectParserDecision(artifact: TableArtifact): Promise<ParserDecision> {
  const fallback = ruleBasedDecision(artifact);
  if (!shouldUseLlmSelector(artifact, fallback)) {
    return fallback;
  }
  const response = await generateJsonWithFallback<SelectorResponse>({
    systemPrompt: TABLE_SELECTOR_SYSTEM_PROMPT,
    prompt: [
      `Source type: ${artifact.sourceType}`,
      `Preview:\n${artifact.preview}`,
    ].join('\n\n'),
    temperature: 0.1,
    maxTokens: 512,
  });

  if (!response.success || !response.data) {
    return fallback;
  }

  const parserId = isParserId(response.data.parser_id) ? response.data.parser_id : fallback.parserId;
  const fallbackParserIds = normalizeFallbackIds(response.data.fallback_parser_ids, parserId, fallback.fallbackParserIds);

  return {
    parserId,
    confidence: typeof response.data.confidence === 'number' ? response.data.confidence : fallback.confidence,
    hints: {
      headerRows: normalizePositiveInteger(response.data.header_rows),
      rowLabelCol: normalizeNonNegativeInteger(response.data.row_label_col),
      notes: response.data.notes || fallback.hints?.notes,
    },
    fallbackParserIds,
    provider: response.provider,
    model: response.model,
  };
}

function shouldUseLlmSelector(artifact: TableArtifact, fallback: ParserDecision): boolean {
  if (artifact.sourceType === 'backend_csv' || artifact.rawCsv) {
    return false;
  }

  if (fallback.parserId === 'markdown_table' || fallback.parserId === 'fixed_width_columns' || fallback.parserId === 'ledger_budget_table') {
    return false;
  }

  return true;
}

function ruleBasedDecision(artifact: TableArtifact): ParserDecision {
  let parserId: TableParserId = 'no_parse';
  let fallbackParserIds: TableParserId[] = ['no_parse'];

  if (artifact.rawCsv) {
    parserId = 'backend_csv_passthrough';
    fallbackParserIds = ['fixed_width_columns', 'ledger_budget_table', 'markdown_table', 'no_parse'];
  } else if (looksLikeMarkdownTable(artifact.rawText)) {
    parserId = 'markdown_table';
  } else if (looksLikeLedgerTable(artifact.rawText)) {
    parserId = 'ledger_budget_table';
    fallbackParserIds = ['fixed_width_columns', 'multi_header_matrix', 'no_parse'];
  } else if (looksLikeFixedWidthTable(artifact.rawText)) {
    parserId = 'fixed_width_columns';
    fallbackParserIds = ['ledger_budget_table', 'multi_header_matrix', 'no_parse'];
  } else if (looksLikeKeyValueTable(artifact.rawText)) {
    parserId = 'key_value_rows';
    fallbackParserIds = ['fixed_width_columns', 'no_parse'];
  }

  return {
    parserId,
    confidence: 0.45,
    hints: {
      headerRows: 1,
      rowLabelCol: 0,
      notes: 'rule-based fallback',
    },
    fallbackParserIds,
    provider: 'fallback',
    model: 'rule-based',
  };
}

const TABLE_PARSERS: TableParser[] = [
  {
    id: 'backend_csv_passthrough',
    canParse: (artifact) => Boolean(artifact.rawCsv || artifact.rawText.includes(',')),
    parse: (artifact) => parseCsvArtifact(artifact, artifact.rawCsv || artifact.rawText),
  },
  {
    id: 'markdown_table',
    canParse: (artifact) => looksLikeMarkdownTable(artifact.rawText),
    parse: (artifact, hints) => parseMarkdownArtifact(artifact, hints),
  },
  {
    id: 'fixed_width_columns',
    canParse: (artifact) => looksLikeFixedWidthTable(artifact.rawText),
    parse: (artifact, hints) => parseWhitespaceGrid(artifact, hints?.headerRows || inferHeaderRows(artifact.rawText), 'fixed_width_columns'),
  },
  {
    id: 'multi_header_matrix',
    canParse: (artifact) => looksLikeMarkdownTable(artifact.rawText) || looksLikeFixedWidthTable(artifact.rawText),
    parse: (artifact, hints) => parseWhitespaceGrid(artifact, hints?.headerRows || Math.max(2, inferHeaderRows(artifact.rawText)), 'multi_header_matrix'),
  },
  {
    id: 'ledger_budget_table',
    canParse: (artifact) => looksLikeLedgerTable(artifact.rawText),
    parse: (artifact, hints) => parseWhitespaceGrid(artifact, hints?.headerRows || inferLedgerHeaderRows(artifact.rawText), 'ledger_budget_table'),
  },
  {
    id: 'key_value_rows',
    canParse: (artifact) => looksLikeKeyValueTable(artifact.rawText),
    parse: (artifact) => parseKeyValueArtifact(artifact),
  },
];

function parseCsvArtifact(artifact: TableArtifact, rawCsv: string): ParsedTable | null {
  const lines = rawCsv.split('\n').map((line) => line.trim()).filter(Boolean);
  const csvLines = lines.filter((line) => !line.startsWith('# Page'));
  if (csvLines.length < 2) {
    return null;
  }

  const rows = csvLines.map(splitCsvLine).filter((row) => row.length >= 2);
  if (rows.length < 2) {
    return null;
  }

  return buildParsedTable(artifact, 'backend_csv_passthrough', rows[0], rows.slice(1));
}

function parseMarkdownArtifact(artifact: TableArtifact, hints?: ParserHints): ParsedTable | null {
  const lines = artifact.rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.includes('|'));
  if (tableLines.length < 2) {
    return null;
  }

  const rows = tableLines
    .map((line) => normalizeMarkdownCells(line))
    .filter((row) => row.length >= 2)
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (rows.length < 2) {
    return null;
  }

  const headerRows = Math.max(1, hints?.headerRows || 1);
  const headers = collapseHeaderRows(rows.slice(0, headerRows));
  const dataRows = rows.slice(headerRows);
  return buildParsedTable(artifact, 'markdown_table', headers, dataRows);
}

function parseWhitespaceGrid(
  artifact: TableArtifact,
  headerRows: number,
  parserId: Exclude<TableParserId, 'no_parse'>
): ParsedTable | null {
  const rows = artifact.rawText
    .split('\n')
    .map(normalizeArtifactLine)
    .filter(Boolean)
    .map(splitLayoutColumns)
    .filter((row) => row.length >= 2);

  if (rows.length < 2) {
    return null;
  }

  const normalizedHeaderRows = Math.max(1, Math.min(headerRows, rows.length - 1));
  const headers = collapseHeaderRows(rows.slice(0, normalizedHeaderRows));
  return buildParsedTable(artifact, parserId, headers, rows.slice(normalizedHeaderRows));
}

function parseKeyValueArtifact(artifact: TableArtifact): ParsedTable | null {
  const wideRows = artifact.rawText
    .split('\n')
    .map(normalizeArtifactLine)
    .filter(Boolean)
    .map(splitLayoutColumns)
    .filter((row) => row.length >= 3);

  if (wideRows.length >= 2 || looksLikeLedgerTable(artifact.rawText) || looksLikeFixedWidthTable(artifact.rawText)) {
    return null;
  }

  const rows = artifact.rawText
    .split('\n')
    .map(normalizeArtifactLine)
    .filter(Boolean)
    .map((line) => {
      const matched = line.includes('：')
        ? line.split('：')
        : line.includes(':')
        ? line.split(':')
        : splitLayoutColumns(line);
      return matched.map((cell) => cell.trim()).filter(Boolean).slice(0, 2);
    })
    .filter((row) => row.length === 2);

  if (rows.length < 3) {
    return null;
  }

  return buildParsedTable(artifact, 'key_value_rows', ['項目', '値'], rows);
}

function buildParsedTable(
  artifact: TableArtifact,
  parserId: Exclude<TableParserId, 'no_parse'>,
  headers: string[],
  rows: string[][]
): ParsedTable {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length));
  const normalizedHeaders = normalizeRow(headers, columnCount).map((cell, index) => cell || `Column ${index + 1}`);
  const normalizedRows = rows.map((row) => normalizeRow(row, columnCount));

  return {
    id: `${artifact.id}-${parserId}`,
    artifactId: artifact.id,
    parserId,
    headers: normalizedHeaders,
    rows: normalizedRows,
    csv: buildCsv(normalizedHeaders, normalizedRows),
    json: normalizedRows.map((row) =>
      Object.fromEntries(normalizedHeaders.map((header, index) => [header, row[index] || '']))
    ),
    issues: [],
  };
}

function validateParsedTable(table: ParsedTable, artifact: TableArtifact): string[] {
  const issues: string[] = [];

  if (table.headers.length < 2) {
    issues.push('not_enough_columns');
  }
  if (table.rows.length === 0) {
    issues.push('no_rows');
  }
  if (table.headers.every((header) => header.trim().length === 0)) {
    issues.push('empty_headers');
  }

  const sparseRows = table.rows.filter((row) => row.filter(Boolean).length <= 1).length;
  if (table.rows.length > 0 && sparseRows / table.rows.length > 0.5) {
    issues.push('too_sparse');
  }

  if (table.parserId === 'key_value_rows') {
    const wideRows = artifact.rawText
      .split('\n')
      .map(normalizeArtifactLine)
      .filter(Boolean)
      .map(splitLayoutColumns)
      .filter((row) => row.length >= 3).length;
    if (wideRows >= 2 || looksLikeLedgerTable(artifact.rawText)) {
      issues.push('mismatched_shape');
    }
  }

  table.issues = issues;
  return issues;
}

function collapseHeaderRows(rows: string[][]): string[] {
  const width = Math.max(...rows.map((row) => row.length));
  const collapsed: string[] = [];

  for (let index = 0; index < width; index += 1) {
    const parts = rows
      .map((row) => row[index] || '')
      .map((cell) => cell.trim())
      .filter(Boolean);
    collapsed.push(parts.join(' / '));
  }

  return collapsed;
}

function normalizeRow(row: string[], width: number): string[] {
  const normalized = [...row];
  while (normalized.length < width) {
    normalized.push('');
  }
  return normalized.slice(0, width);
}

function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')
  );
  return lines.join('\n');
}

function normalizeMarkdownCells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function normalizeArtifactLine(line: string): string {
  return line.replace(/\u3000/g, '  ').replace(/\t/g, '    ').trimEnd();
}

function splitLayoutColumns(line: string): string[] {
  return normalizeArtifactLine(line)
    .trim()
    .split(/\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
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

function looksLikeTable(block: string): boolean {
  return (
    looksLikeMarkdownTable(block) ||
    looksLikeLedgerTable(block) ||
    looksLikeFixedWidthTable(block) ||
    looksLikeKeyValueTable(block)
  );
}

function looksLikeMarkdownTable(text: string): boolean {
  const lines = text.split('\n').filter(Boolean);
  return lines.length >= 2 && lines.filter((line) => line.includes('|')).length >= 2;
}

function looksLikeFixedWidthTable(text: string): boolean {
  const rows = text
    .split('\n')
    .map(normalizeArtifactLine)
    .filter(Boolean)
    .map(splitLayoutColumns);
  const wideRows = rows.filter((row) => row.length >= 4).length;
  const mediumRows = rows.filter((row) => row.length >= 3).length;
  return (wideRows >= 2 || mediumRows >= 3) && !looksLikeMostlyKeyValue(rows);
}

function looksLikeKeyValueTable(text: string): boolean {
  if (looksLikeLedgerTable(text)) {
    return false;
  }

  const rows = text
    .split('\n')
    .map(normalizeArtifactLine)
    .filter(Boolean)
    .map((line) => {
      if (line.includes('：')) {
        return line.split('：').map((cell) => cell.trim()).filter(Boolean);
      }
      if (line.includes(':')) {
        return line.split(':').map((cell) => cell.trim()).filter(Boolean);
      }
      return splitLayoutColumns(line);
    })
    .filter((row) => row.length >= 2);

  if (rows.length < 3) {
    return false;
  }

  return rows.every((row) => row.length === 2);
}

function looksLikeLedgerTable(text: string): boolean {
  return /(最終予算額|決算額|当初予算額|執行率|対前年比|国庫|県債|一般財源|千円|百万円|評価|指標)/.test(text);
}

function inferHeaderRows(text: string): number {
  const rows = text
    .split('\n')
    .map(normalizeArtifactLine)
    .filter(Boolean)
    .map(splitLayoutColumns)
    .filter((row) => row.length >= 2);

  if (rows.length < 2) {
    return 1;
  }

  const firstTwo = rows.slice(0, 2);
  const secondLooksHeader = firstTwo[1]?.some((cell) => /(千円|実績|評価|指標|目標|前年比|年度)/.test(cell));
  return secondLooksHeader ? 2 : 1;
}

function inferLedgerHeaderRows(text: string): number {
  return /(評価|指標|最終予算額|決算額)/.test(text) ? 2 : 1;
}

function looksLikeMostlyKeyValue(rows: string[][]): boolean {
  const twoColumnRows = rows.filter((row) => row.length === 2).length;
  const wideRows = rows.filter((row) => row.length >= 3).length;
  return twoColumnRows >= 3 && wideRows === 0;
}

function isParserId(value: string | undefined): value is TableParserId {
  return Boolean(value && TABLE_PARSER_IDS.includes(value as TableParserId));
}

function normalizeFallbackIds(
  values: string[] | undefined,
  parserId: TableParserId,
  fallback: TableParserId[]
): TableParserId[] {
  const normalized = (values || []).filter(isParserId).filter((value) => value !== parserId);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizePositiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}
