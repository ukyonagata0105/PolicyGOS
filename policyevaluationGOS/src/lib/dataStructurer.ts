/**
 * Data structurer service.
 * Uses pluggable LLM providers with a deterministic heuristic fallback.
 */

import { generateJsonWithFallback } from '@/lib/llmProviders';
import type {
  DataStructuringOptions,
  DataStructuringResult,
  PolicyCategory,
  StructuredPolicy,
} from '@/types';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';

const POLICY_EXTRACTION_SYSTEM_PROMPT = `あなたは日本語の政策文書を構造化するアナリストです。
以下の JSON だけを返してください:
{
  "title": "string",
  "municipality": "string",
  "summary": "string",
  "keyPoints": [{ "text": "string", "importance": "high|medium|low" }],
  "category": "environment|welfare|education|infrastructure|healthcare|economy|public-safety|culture|agriculture|digital|other",
  "budget": { "amount": 0, "fiscalYear": "string", "description": "string" },
  "implementationPeriod": { "startDate": "string", "endDate": "string", "duration": "string" },
  "targetPopulation": "string",
  "departments": ["string"],
  "tags": ["string"]
}
Rules:
- JSON 以外を返さない。
- 抽出した文言は日本語を維持する。
- summary は1-3文の簡潔な日本語にする。
- 値がない項目は省略してよいが、必須文字列は "未抽出" を使ってよい。`;

export async function structurePolicyData(
  ocrText: string,
  options: DataStructuringOptions = {}
): Promise<DataStructuringResult> {
  if (!ocrText || ocrText.trim().length === 0) {
    return {
      success: false,
      error: 'OCR text is empty',
    };
  }

  const prompt = buildExtractionPrompt(limitInput(ocrText));
  const result = await generateJsonWithFallback<Partial<StructuredPolicy>>({
    systemPrompt: POLICY_EXTRACTION_SYSTEM_PROMPT,
    prompt,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 4096,
    requiredProvider: 'gemini',
  });

  if (result.success && result.data) {
    return {
      success: true,
      policy: normalizeStructuredPolicy(result.data, result.model),
      rawResponse: result.rawText,
      provider: result.provider,
      model: result.model,
    };
  }

  const heuristicPolicy = heuristicStructurePolicyData(ocrText);
  return {
    success: true,
    policy: heuristicPolicy,
    error: result.error,
    provider: 'heuristic',
    model: 'heuristic-fallback',
  };
}

function buildExtractionPrompt(ocrText: string): string {
  return `以下の文書テキストから政策情報を抽出し、日本語の構造化 JSON を返してください。\n\n${ocrText}`;
}

function limitInput(ocrText: string): string {
  const maxLength = 18000;
  return ocrText.length > maxLength
    ? `${ocrText.slice(0, maxLength)}\n\n[Text truncated for analysis]`
    : ocrText;
}

function normalizeStructuredPolicy(input: Partial<StructuredPolicy>, model: string): StructuredPolicy {
  return {
    title: normalizeString(input.title, 'N/A'),
    municipality: normalizeString(input.municipality, guessMunicipalityFromText(input.summary || '') || 'N/A'),
    summary: normalizeString(input.summary, ''),
    keyPoints: normalizeKeyPoints(input.keyPoints),
    category: normalizeCategory(input.category),
    budget: normalizeBudget(input.budget),
    implementationPeriod: normalizeImplementationPeriod(input.implementationPeriod),
    targetPopulation: normalizeOptionalString(input.targetPopulation),
    departments: normalizeStringArray(input.departments),
    tags: normalizeStringArray(input.tags),
    extractedAt: new Date().toISOString(),
    model,
  };
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return strings.length > 0 ? strings : undefined;
}

function normalizeBudget(value: unknown): StructuredPolicy['budget'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const amount = typeof record.amount === 'number' ? record.amount : undefined;
  const fiscalYear = normalizeOptionalString(record.fiscalYear);
  const description = normalizeOptionalString(record.description);

  if (!amount && !fiscalYear && !description) {
    return undefined;
  }

  return {
    amount,
    fiscalYear,
    description,
  };
}

function normalizeImplementationPeriod(value: unknown): StructuredPolicy['implementationPeriod'] {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const startDate = normalizeOptionalString(record.startDate);
  const endDate = normalizeOptionalString(record.endDate);
  const duration = normalizeOptionalString(record.duration);

  if (!startDate && !endDate && !duration) {
    return undefined;
  }

  return {
    startDate,
    endDate,
    duration,
  };
}

function normalizeKeyPoints(value: unknown): StructuredPolicy['keyPoints'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const point = entry as Record<string, unknown>;
      const importance = point.importance;
      const normalizedImportance: 'high' | 'medium' | 'low' | undefined =
        importance === 'high' || importance === 'medium' || importance === 'low'
          ? importance
          : undefined;
      return {
        text: normalizeString(point.text, ''),
        importance: normalizedImportance,
      };
    })
    .filter((entry) => entry.text.length > 0)
    .slice(0, 8);
}

function normalizeCategory(value: unknown): PolicyCategory {
  const categories: PolicyCategory[] = [
    'environment',
    'welfare',
    'education',
    'infrastructure',
    'healthcare',
    'economy',
    'public-safety',
    'culture',
    'agriculture',
    'digital',
    'other',
  ];

  return typeof value === 'string' && categories.includes(value as PolicyCategory)
    ? (value as PolicyCategory)
    : 'other';
}

export function heuristicStructurePolicyData(ocrText: string): StructuredPolicy {
  const lines = ocrText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSyntheticContextLine(line));
  const title = lines.find((line) => line.length > 5 && line.length < 80) || 'N/A';
  const municipality = guessMunicipalityFromText(ocrText) || 'N/A';
  const summaryLines = lines.filter((line) => line !== title).slice(0, 3);
  const bulletLines = lines
    .filter((line) => /^([0-9]+[.)、]|[・●■◆◯○\-*])/.test(line))
    .slice(0, 5);
  const keyPointSource = bulletLines.length > 0 ? bulletLines : summaryLines;
  const budgetMatch = ocrText.match(/([0-9][0-9,]{2,})\s*円/);
  const fiscalYearMatch = ocrText.match(/令和?\s*[0-9]+\s*年度|平成\s*[0-9]+\s*年度|20[0-9]{2}\s*年度/u);
  const departments = Array.from(
    new Set(
      lines
        .filter((line) => /(部|課|局|室)$/.test(line) || /(部|課|局|室)\s/.test(line))
        .slice(0, 5)
    )
  );

  return {
    title,
    municipality,
    summary: truncateSummary(summaryLines.join(' ')),
    keyPoints: keyPointSource.map((line, index) => ({
      text: truncateKeyPoint(line.replace(/^([0-9]+[.)、]|[・●■◆◯○\-*])\s*/, '')),
      importance: index === 0 ? 'high' : index < 3 ? 'medium' : 'low',
    })),
    category: inferCategory(ocrText),
    budget: budgetMatch
      ? {
        amount: Number(budgetMatch[1].replace(/,/g, '')),
        fiscalYear: fiscalYearMatch?.[0],
      }
      : undefined,
    departments: departments.length > 0 ? departments : undefined,
    tags: buildHeuristicTags(ocrText),
    extractedAt: new Date().toISOString(),
    model: 'heuristic-fallback',
  };
}

function isSyntheticContextLine(line: string): boolean {
  return (
    line.startsWith('[Parsed tables]') ||
    line.startsWith('Table ') ||
    line.startsWith('Headers:') ||
    line.startsWith('Rows:') ||
    /^Document \d+:/.test(line)
  );
}

function truncateSummary(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length <= 180) {
    return trimmed;
  }
  return `${trimmed.slice(0, 180).trim()}…`;
}

function truncateKeyPoint(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 90) {
    return trimmed;
  }
  return `${trimmed.slice(0, 90).trim()}…`;
}

function guessMunicipalityFromText(text: string): string | null {
  const match = text.match(/([一-龯ぁ-んァ-ヴー]+(?:都|道|府|県|市|区|町|村))/u);
  return match?.[1] ?? null;
}

function inferCategory(text: string): PolicyCategory {
  const categoryKeywords: Array<[PolicyCategory, RegExp]> = [
    ['welfare', /(福祉|高齢|子育て|介護|支援)/u],
    ['education', /(教育|学校|学習|奨学|児童)/u],
    ['environment', /(環境|脱炭素|気候|再エネ|循環)/u],
    ['infrastructure', /(道路|橋梁|公共施設|下水|インフラ)/u],
    ['healthcare', /(医療|健康|保健|病院|診療)/u],
    ['economy', /(経済|産業|雇用|企業|商工)/u],
    ['public-safety', /(防災|安全|消防|避難|減災)/u],
    ['culture', /(文化|観光|スポーツ|芸術|歴史)/u],
    ['agriculture', /(農業|林業|水産|農村|畜産)/u],
    ['digital', /(デジタル|DX|ICT|システム|オンライン)/u],
  ];

  const matched = categoryKeywords.find(([, pattern]) => pattern.test(text));
  return matched?.[0] ?? 'other';
}

function buildHeuristicTags(text: string): string[] | undefined {
  const tags = new Set<string>();

  if (/比較|横断/u.test(text)) {
    tags.add('比較');
  }
  if (/KPI|指標/u.test(text)) {
    tags.add('KPI');
  }
  if (/予算/u.test(text)) {
    tags.add('予算');
  }

  const municipality = guessMunicipalityFromText(text);
  if (municipality) {
    tags.add(municipality);
  }

  return tags.size > 0 ? Array.from(tags) : undefined;
}

export async function checkServiceAvailability(): Promise<boolean> {
  const result = await generateJsonWithFallback<{ ok: boolean }>({
    systemPrompt: 'Return {"ok": true} in JSON.',
    prompt: 'Check service availability.',
    temperature: 0,
    maxTokens: 16,
  });

  return result.success;
}

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}

export function createCustomStructuringPrompt(customInstructions: string, ocrText: string): string {
  return `${POLICY_EXTRACTION_SYSTEM_PROMPT}\n\n${customInstructions}\n\n${ocrText}`;
}
