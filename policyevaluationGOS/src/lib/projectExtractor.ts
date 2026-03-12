import { generateJsonWithFallback } from '@/lib/llmProviders';
import { toProjectExtractionArtifacts, toProjectExtractionResult } from '@/lib/pipelineContracts';
import type {
  DocumentDigest,
  EvidenceRef,
  IndicatorRecord,
  NormalizedProjectRow,
  PolicyCategory,
  ProjectCandidateRowBundle,
  ProjectCandidateRow,
  ProjectExtractionResult,
  ProjectRowDecision,
  ProjectRecord,
  ReviewItem,
  TableParseResult,
  WorkspaceDocument,
} from '@/types';

interface ExtractionPayload {
  document_digest?: {
    title?: string;
    municipality?: string;
    overview?: string;
    category?: PolicyCategory;
  };
  row_decisions?: Array<{
    source_reference?: string;
    decision?: 'project' | 'continuation' | 'section' | 'note' | 'drop';
    section_path?: string[];
    municipality?: string;
    project_number?: string;
    project_name?: string;
    project_summary?: string;
    department?: string;
    budget?: string;
    fiscal_year?: string;
    status?: string;
    activity_indicator_name?: string;
    activity_indicator_unit?: string;
    activity_planned_value?: string;
    activity_actual_value?: string;
    outcome_indicator_name?: string;
    outcome_indicator_unit?: string;
    outcome_target_value?: string;
    outcome_actual_value?: string;
    achievement?: string;
    supporting_fields?: string[];
    supporting_text_spans?: string[];
    decision_notes?: string[];
    quality_hints?: string[];
    confidence?: number;
    review_flags?: string[];
  }>;
  normalized_rows?: Array<{
    source_reference?: string;
    section_path?: string[];
    municipality?: string;
    project_number?: string;
    project_name?: string;
    project_summary?: string;
    department?: string;
    budget?: string;
    fiscal_year?: string;
    status?: string;
    activity_indicator_name?: string;
    activity_indicator_unit?: string;
    activity_planned_value?: string;
    activity_actual_value?: string;
    outcome_indicator_name?: string;
    outcome_indicator_unit?: string;
    outcome_target_value?: string;
    outcome_actual_value?: string;
    achievement?: string;
    confidence?: number;
    review_flags?: string[];
  }>;
  projects?: Array<{
    project_number?: string;
    project_name?: string;
    project_summary?: string;
    department?: string;
    budget?: string;
    fiscal_year?: string;
    status?: string;
    source_reference?: string;
    confidence?: number;
    review_flags?: string[];
    activity_indicators?: RawIndicator[];
    outcome_indicators?: RawIndicator[];
  }>;
}

interface RawIndicator {
  name?: string;
  unit?: string;
  planned_value?: string;
  actual_value?: string;
  target_value?: string;
  achievement?: string;
}

const EXTRACTION_SYSTEM_PROMPT = `あなたは日本語の行政評価資料から事業レコードを抽出するアナリストです。
JSON だけを返してください。
{
  "document_digest": {
    "title": "string",
    "municipality": "string",
    "overview": "string",
    "category": "environment|welfare|education|infrastructure|healthcare|economy|public-safety|culture|agriculture|digital|other"
  },
  "row_decisions": [
    {
      "source_reference": "string",
      "decision": "project|continuation|section|note|drop",
      "section_path": ["string"],
      "municipality": "string",
      "project_number": "string",
      "project_name": "string",
      "project_summary": "string",
      "department": "string",
      "budget": "string",
      "fiscal_year": "string",
      "status": "string",
      "activity_indicator_name": "string",
      "activity_indicator_unit": "string",
      "activity_planned_value": "string",
      "activity_actual_value": "string",
      "outcome_indicator_name": "string",
      "outcome_indicator_unit": "string",
      "outcome_target_value": "string",
      "outcome_actual_value": "string",
      "achievement": "string",
      "supporting_fields": ["string"],
      "supporting_text_spans": ["string"],
      "decision_notes": ["string"],
      "quality_hints": ["string"],
      "confidence": 0.0,
      "review_flags": ["string"]
    }
  ],
  "normalized_rows": [
    {
      "source_reference": "string",
      "section_path": ["string"],
      "municipality": "string",
      "project_number": "string",
      "project_name": "string",
      "project_summary": "string",
      "department": "string",
      "budget": "string",
      "fiscal_year": "string",
      "status": "string",
      "activity_indicator_name": "string",
      "activity_indicator_unit": "string",
      "activity_planned_value": "string",
      "activity_actual_value": "string",
      "outcome_indicator_name": "string",
      "outcome_indicator_unit": "string",
      "outcome_target_value": "string",
      "outcome_actual_value": "string",
      "achievement": "string",
      "confidence": 0.0,
      "review_flags": ["string"]
    }
  ]
}
ルール:
- JSON 以外を返さない。
- row_decisions を必ず返す。
- row_decisions を最優先で埋める。normalized_rows は高信頼で組み立てられる行だけ返す。projects は返さなくてよい。
- decision は project|continuation|section|note|drop のいずれかにする。
- project_name と project_summary は必須。
- project_number は読める場合だけ入れる。
- normalized_rows は row_decisions と同じ source_reference を使う。
- source_reference は records の source_reference をそのまま使う。
- municipality は municipality_hint を優先し、本文由来の誤認で上書きしない。
- section や note を project として返さない。継続説明行は continuation にする。
- supporting_fields には利用した rowFields の key を入れる。
- quality_hints には missing_number, unit_unclear, ambiguous_category, cross_page_context_needed などの短い機械可読ヒントを入れる。
- project_name に 継続, 有無, 目標値, 実績値 のような管理語を入れない。
- confidence は 0 から 1 の範囲にする。
- review_flags には欠損や曖昧さだけを短い日本語で入れる。`;

const GEMINI_NORMALIZATION_CHUNK_SIZE = 16;
const GEMINI_PROJECT_ROW_LIMIT = 96;

type CandidateBundleSource = Pick<
  WorkspaceDocument,
  'id' | 'name' | 'collectionSource' | 'structuredData' | 'rawCsv' | 'rawLayoutText' | 'candidateRows'
>;

type SourceMunicipalitySource = Pick<WorkspaceDocument, 'collectionSource'>;

export async function extractProjectRecords(
  document: WorkspaceDocument
): Promise<ProjectExtractionResult> {
  const rawCandidateRows = buildRawCandidateRows(document);
  const candidateRows = normalizeCandidateRows(rawCandidateRows);
  const candidateBundle = buildCandidateRowBundle(document, candidateRows);
  const projectCandidateRows = selectProjectRowsForNormalization(candidateRows);
  const chunks = chunkCandidateRows(projectCandidateRows, GEMINI_NORMALIZATION_CHUNK_SIZE);
  const rawResponses: string[] = [];
  const rowDecisions: ProjectRowDecision[] = [];
  const normalizedRows: NormalizedProjectRow[] = [];
  const normalizedProjects: ProjectRecord[] = [];
  let documentDigest: DocumentDigest | undefined;
  let successfulChunkCount = 0;
  let lastProvider = 'fallback';
  let lastModel = 'none';
  let lastError: string | undefined;

  for (const chunk of chunks) {
    const bundle = buildCandidateRowBundle(document, candidateRows, chunk);
    const prompt = buildPrompt(bundle);
    const result = await generateJsonWithFallback<ExtractionPayload>({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      prompt,
      temperature: 0.1,
      maxTokens: 3072,
      requiredProvider: 'gemini',
    });

    if (result.rawText) {
      rawResponses.push(result.rawText);
    }
    lastProvider = result.provider;
    lastModel = result.model;
    lastError = result.error;

    if (!result.success || !result.data) {
      continue;
    }

    const normalized = normalizeExtractionPayload(document, result.data, result.model);
    if (!documentDigest) {
      documentDigest = normalized.documentDigest;
    }
    if (normalized.normalizedRows.length === 0 && normalized.projects.length === 0) {
      continue;
    }

    successfulChunkCount += 1;
    rowDecisions.push(...normalized.rowDecisions);
    normalizedRows.push(...normalized.normalizedRows);
    normalizedProjects.push(...normalized.projects);
  }

  const dedupedRowDecisions = dedupeRowDecisions(rowDecisions);
  const dedupedNormalizedRows = dedupeNormalizedRows(normalizedRows);
  const validatedRows =
    dedupedNormalizedRows.length > 0
      ? validateNormalizedRows(document, dedupedNormalizedRows, dedupedRowDecisions, candidateRows)
      : buildValidatedRowsFromDecisions(document, dedupedRowDecisions, candidateRows);
  const finalProjects =
    dedupeProjects(normalizedProjects).length > 0
      ? dedupeProjects(normalizedProjects)
      : buildProjectsFromNormalizedRows(document, validatedRows);
  const finalReviewItems = finalProjects.flatMap((project) => buildReviewItems(document, project, lastModel));

  if (successfulChunkCount > 0 && (validatedRows.length > 0 || finalProjects.length > 0)) {
    const artifacts = toProjectExtractionArtifacts({
      success: true,
      documentDigest:
        documentDigest || buildFallbackDocumentDigest(document, 'Gemini 正規化結果から再構造化した結果です。'),
      candidateBundle,
      rawCandidateRows,
      candidateRows,
      rowDecisions: dedupedRowDecisions,
      normalizedRows: validatedRows,
      projectRowsCsv: buildNormalizedProjectRowsCsv(validatedRows),
      projects: finalProjects,
      reviewItems: finalReviewItems,
      provider: lastProvider,
      model: lastModel,
      rawResponse: rawResponses.join('\n\n---chunk---\n\n'),
      error: lastError,
    });
    return toProjectExtractionResult(artifacts);
  }

  const fallback = buildHeuristicExtraction(document, candidateRows);
  const fallbackArtifacts = toProjectExtractionArtifacts({
    success: true,
    documentDigest: fallback.documentDigest,
    candidateBundle,
    rawCandidateRows,
    candidateRows,
    rowDecisions: [],
    normalizedRows: [],
    projectRowsCsv: buildCandidateProjectRowsCsv(candidateRows),
    projects: fallback.projects,
    reviewItems: fallback.reviewItems,
    rawResponse: rawResponses.join('\n\n---chunk---\n\n') || undefined,
    error: lastError,
    provider: 'heuristic',
    model: 'heuristic-project-extractor',
  });
  return toProjectExtractionResult(fallbackArtifacts);
}

function buildPrompt(bundle: ProjectCandidateRowBundle): string {
  const baseText = [
    `document_name: ${bundle.documentName}`,
    `municipality_hint: ${bundle.municipalityHint || ''}`,
    `title_hint: ${bundle.titleHint || ''}`,
    `overview_hint: ${bundle.overviewHint || ''}`,
    '',
    '[candidate_bundle]',
    JSON.stringify(bundle, null, 2),
  ];

  return baseText.join('\n');
}

function normalizeExtractionPayload(
  document: WorkspaceDocument,
  payload: ExtractionPayload,
  model: string
): {
  documentDigest: DocumentDigest;
  rowDecisions: ProjectRowDecision[];
  normalizedRows: NormalizedProjectRow[];
  projects: ProjectRecord[];
  reviewItems: ReviewItem[];
} {
  const sourceMunicipality = resolveSourceMunicipality(document);
  const documentDigest: DocumentDigest = {
    title: normalizeText(payload.document_digest?.title) || document.structuredData?.title || document.name,
    municipality: sourceMunicipality || normalizeText(payload.document_digest?.municipality) || document.structuredData?.municipality || '未抽出',
    overview:
      normalizeText(payload.document_digest?.overview) ||
      document.structuredData?.summary ||
      '事業一覧と評価指標を再構造化した結果です。',
    category: payload.document_digest?.category || document.structuredData?.category,
  };
  const rowDecisions = normalizeRowDecisions(payload.row_decisions, sourceMunicipality);
  const normalizedRows = normalizeProjectRows(payload.normalized_rows, sourceMunicipality);

  const projects = (payload.projects || [])
    .map((project, index) => normalizeProjectRecord(document, project, index))
    .filter((project): project is ProjectRecord => Boolean(project));

  const reviewItems = projects.flatMap((project) => buildReviewItems(document, project, model));

  return {
    documentDigest,
    rowDecisions,
    normalizedRows,
    projects,
    reviewItems,
  };
}

function normalizeRowDecisions(
  rows: ExtractionPayload['row_decisions'],
  sourceMunicipality: string
): ProjectRowDecision[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.reduce<ProjectRowDecision[]>((result, row) => {
    const sourceReference = normalizeText(row.source_reference);
    const decision = normalizeRowDecision(row.decision);
    if (!sourceReference || !decision) {
      return result;
    }

    result.push({
      sourceReference,
      decision,
      sectionPath: Array.isArray(row.section_path) ? row.section_path.map(normalizeText).filter(Boolean) : [],
      municipality: sourceMunicipality || normalizeText(row.municipality) || undefined,
      projectNumber: normalizeProjectNumber(row.project_number, row.project_name || '') || undefined,
      projectName: normalizeProjectName(row.project_name) || undefined,
      projectSummary: normalizeSummary(row.project_summary) || undefined,
      department: normalizeText(row.department) || undefined,
      budget: normalizeText(row.budget) || undefined,
      fiscalYear: normalizeText(row.fiscal_year) || undefined,
      status: normalizeText(row.status) || undefined,
      activityIndicatorName: normalizeIndicatorName(row.activity_indicator_name) || undefined,
      activityIndicatorUnit: normalizeText(row.activity_indicator_unit) || undefined,
      activityPlannedValue: normalizeText(row.activity_planned_value) || undefined,
      activityActualValue: normalizeText(row.activity_actual_value) || undefined,
      outcomeIndicatorName: normalizeIndicatorName(row.outcome_indicator_name) || undefined,
      outcomeIndicatorUnit: normalizeText(row.outcome_indicator_unit) || undefined,
      outcomeTargetValue: normalizeText(row.outcome_target_value) || undefined,
      outcomeActualValue: normalizeText(row.outcome_actual_value) || undefined,
      achievement: normalizeText(row.achievement) || undefined,
      supportingFields: Array.isArray(row.supporting_fields) ? row.supporting_fields.map(normalizeText).filter(Boolean) : [],
      supportingTextSpans: Array.isArray(row.supporting_text_spans)
        ? row.supporting_text_spans.map((value) => clampText(normalizeText(value), 160)).filter(Boolean)
        : [],
      decisionNotes: Array.isArray(row.decision_notes) ? row.decision_notes.map(normalizeText).filter(Boolean) : [],
      qualityHints: Array.isArray(row.quality_hints) ? row.quality_hints.map(normalizeText).filter(Boolean) : [],
      confidence: normalizeConfidence(row.confidence),
      reviewFlags: normalizeFlags(row.review_flags),
    });
    return result;
  }, []);
}

function normalizeProjectRows(
  rows: ExtractionPayload['normalized_rows'],
  sourceMunicipality: string
): NormalizedProjectRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.reduce<NormalizedProjectRow[]>((result, row) => {
    const projectName = normalizeProjectName(row.project_name);
    const projectSummary = normalizeSummary(row.project_summary);
    const sourceReference = normalizeText(row.source_reference);
    if (!projectName || !projectSummary || !sourceReference) {
      return result;
    }

    result.push({
      sourceReference,
      sectionPath: Array.isArray(row.section_path) ? row.section_path.map(normalizeText).filter(Boolean) : [],
      municipality: sourceMunicipality || normalizeText(row.municipality) || undefined,
      projectNumber: normalizeProjectNumber(row.project_number, projectName) || undefined,
      projectName,
      projectSummary,
      department: normalizeText(row.department) || undefined,
      budget: normalizeText(row.budget) || undefined,
      fiscalYear: normalizeText(row.fiscal_year) || undefined,
      status: normalizeText(row.status) || undefined,
      activityIndicatorName: normalizeIndicatorName(row.activity_indicator_name) || undefined,
      activityIndicatorUnit: normalizeText(row.activity_indicator_unit) || undefined,
      activityPlannedValue: normalizeText(row.activity_planned_value) || undefined,
      activityActualValue: normalizeText(row.activity_actual_value) || undefined,
      outcomeIndicatorName: normalizeIndicatorName(row.outcome_indicator_name) || undefined,
      outcomeIndicatorUnit: normalizeText(row.outcome_indicator_unit) || undefined,
      outcomeTargetValue: normalizeText(row.outcome_target_value) || undefined,
      outcomeActualValue: normalizeText(row.outcome_actual_value) || undefined,
      achievement: normalizeText(row.achievement) || undefined,
      confidence: normalizeConfidence(row.confidence),
      reviewFlags: normalizeFlags(row.review_flags),
    });
    return result;
  }, []);
}

function buildValidatedRowsFromDecisions(
  document: WorkspaceDocument,
  decisions: ProjectRowDecision[],
  candidateRows: ProjectCandidateRow[]
): NormalizedProjectRow[] {
  const candidatesByRef = new Map(candidateRows.map((row) => [row.sourceReference, row]));

  return decisions.reduce<NormalizedProjectRow[]>((result, decision) => {
    if (decision.decision !== 'project') {
      return result;
    }

    const candidate = candidatesByRef.get(decision.sourceReference);
    const projectName = decision.projectName || candidate?.projectNameCandidate || '';
    const projectSummary = decision.projectSummary || candidate?.projectSummaryCandidate || '';
    if (!projectName || !projectSummary) {
      return result;
    }

    result.push({
      sourceReference: decision.sourceReference,
      sectionPath: decision.sectionPath.length > 0 ? decision.sectionPath : candidate?.sectionPath || [],
      municipality: decision.municipality || resolveSourceMunicipality(document) || undefined,
      projectNumber: decision.projectNumber || candidate?.projectNumber || undefined,
      projectName,
      projectSummary,
      department: decision.department || candidate?.department || undefined,
      budget: decision.budget || candidate?.budget || undefined,
      fiscalYear: decision.fiscalYear || candidate?.fiscalYear || undefined,
      status: decision.status || candidate?.status || undefined,
      activityIndicatorName: decision.activityIndicatorName || candidate?.activityIndicatorName || undefined,
      activityIndicatorUnit: decision.activityIndicatorUnit || candidate?.indicatorUnit || undefined,
      activityPlannedValue: undefined,
      activityActualValue: decision.activityActualValue || candidate?.actualValue || undefined,
      outcomeIndicatorName: decision.outcomeIndicatorName || undefined,
      outcomeIndicatorUnit: decision.outcomeIndicatorUnit || undefined,
      outcomeTargetValue: decision.outcomeTargetValue || candidate?.targetValue || undefined,
      outcomeActualValue: decision.outcomeActualValue || undefined,
      achievement: decision.achievement || undefined,
      confidence: decision.confidence,
      reviewFlags: normalizeFlags([...decision.reviewFlags, ...decision.qualityHints]),
    });
    return result;
  }, []);
}

function validateNormalizedRows(
  document: WorkspaceDocument,
  rows: NormalizedProjectRow[],
  decisions: ProjectRowDecision[],
  candidateRows: ProjectCandidateRow[]
): NormalizedProjectRow[] {
  const decisionByRef = new Map(decisions.map((row) => [row.sourceReference, row]));
  const candidateByRef = new Map(candidateRows.map((row) => [row.sourceReference, row]));

  return rows.reduce<NormalizedProjectRow[]>((result, row) => {
    const candidate = candidateByRef.get(row.sourceReference);
    const decision = decisionByRef.get(row.sourceReference);
    if (decision && decision.decision !== 'project') {
      return result;
    }

    const projectName = row.projectName || decision?.projectName || candidate?.projectNameCandidate || '';
    const projectSummary = row.projectSummary || decision?.projectSummary || candidate?.projectSummaryCandidate || '';
    if (!projectName || !projectSummary) {
      return result;
    }

    result.push({
      ...row,
      municipality: row.municipality || decision?.municipality || resolveSourceMunicipality(document) || undefined,
      projectNumber: row.projectNumber || decision?.projectNumber || candidate?.projectNumber || undefined,
      sectionPath: row.sectionPath.length > 0 ? row.sectionPath : decision?.sectionPath || candidate?.sectionPath || [],
      projectName,
      projectSummary,
      department: row.department || decision?.department || candidate?.department || undefined,
      budget: row.budget || decision?.budget || candidate?.budget || undefined,
      fiscalYear: row.fiscalYear || decision?.fiscalYear || candidate?.fiscalYear || undefined,
      status: row.status || decision?.status || candidate?.status || undefined,
      activityIndicatorName: row.activityIndicatorName || decision?.activityIndicatorName || candidate?.activityIndicatorName || undefined,
      activityIndicatorUnit: row.activityIndicatorUnit || decision?.activityIndicatorUnit || candidate?.indicatorUnit || undefined,
      activityActualValue: row.activityActualValue || decision?.activityActualValue || candidate?.actualValue || undefined,
      outcomeTargetValue: row.outcomeTargetValue || decision?.outcomeTargetValue || candidate?.targetValue || undefined,
      reviewFlags: normalizeFlags([...(row.reviewFlags || []), ...(decision?.reviewFlags || []), ...(decision?.qualityHints || [])]),
      confidence: Math.max(row.confidence, decision?.confidence || 0),
    });
    return result;
  }, []);
}

function buildProjectsFromNormalizedRows(
  document: WorkspaceDocument,
  rows: NormalizedProjectRow[]
): ProjectRecord[] {
  return rows.reduce<ProjectRecord[]>((result, row, index) => {
    const sourceRef = buildEvidenceRef(document, row.sourceReference, row.projectSummary);
    const projectId = `${document.id}-normalized-${index + 1}`;
    const indicators: IndicatorRecord[] = [];

    if (row.activityIndicatorName) {
      indicators.push({
        id: `${projectId}-activity-1`,
        projectId,
        indicatorType: 'activity',
        name: row.activityIndicatorName,
        unit: row.activityIndicatorUnit,
        plannedValue: row.activityPlannedValue,
        actualValue: row.activityActualValue,
        sourceRefs: [sourceRef],
      });
    }

    if (row.outcomeIndicatorName) {
      indicators.push({
        id: `${projectId}-outcome-1`,
        projectId,
        indicatorType: 'outcome',
        name: row.outcomeIndicatorName,
        unit: row.outcomeIndicatorUnit,
        targetValue: row.outcomeTargetValue,
        actualValue: row.outcomeActualValue,
        achievement: row.achievement,
        sourceRefs: [sourceRef],
      });
    }

    const project = applyProjectQualityGate(document, {
      id: projectId,
      sourceDocumentId: document.id,
      projectNumber: row.projectNumber,
      projectName: row.projectName,
      projectSummary: row.projectSummary,
      department: row.department,
      budget: row.budget,
      fiscalYear: row.fiscalYear,
      status: row.status,
      sourceRefs: [sourceRef],
      indicators,
      confidence: row.confidence,
      reviewFlags: [...row.reviewFlags],
      publicationStatus: 'review',
      publicationNotes: [],
    });

    result.push(project);
    return result;
  }, []);
}

function dedupeNormalizedRows(rows: NormalizedProjectRow[]): NormalizedProjectRow[] {
  const bySourceRef = new Map<string, NormalizedProjectRow>();
  rows.forEach((row) => {
    bySourceRef.set(row.sourceReference, row);
  });
  return Array.from(bySourceRef.values());
}

function dedupeRowDecisions(rows: ProjectRowDecision[]): ProjectRowDecision[] {
  const bySourceRef = new Map<string, ProjectRowDecision>();
  rows.forEach((row) => {
    bySourceRef.set(row.sourceReference, row);
  });
  return Array.from(bySourceRef.values());
}

function dedupeProjects(projects: ProjectRecord[]): ProjectRecord[] {
  const bySourceRef = new Map<string, ProjectRecord>();
  projects.forEach((project) => {
    const key = project.sourceRefs[0]?.sourceReference || project.id;
    bySourceRef.set(key, project);
  });
  return Array.from(bySourceRef.values());
}

function buildFallbackDocumentDigest(document: WorkspaceDocument, overview: string): DocumentDigest {
  return {
    title: document.structuredData?.title || document.name,
    municipality: resolveSourceMunicipality(document) || document.structuredData?.municipality || '未抽出',
    overview,
    category: document.structuredData?.category,
  };
}

function normalizeProjectRecord(
  document: WorkspaceDocument,
  project: NonNullable<ExtractionPayload['projects']>[number],
  index: number
): ProjectRecord | null {
  const projectName = normalizeProjectName(project.project_name);
  const projectSummary = normalizeSummary(project.project_summary);

  if (!projectName || !projectSummary) {
    return null;
  }

  const sourceRef = buildEvidenceRef(
    document,
    normalizeText(project.source_reference) || `record-${index + 1}`,
    projectSummary
  );
  const projectId = `${document.id}-project-${index + 1}`;
  const reviewFlags = normalizeFlags(project.review_flags);
  const indicators = [
    ...normalizeIndicators(project.activity_indicators, projectId, 'activity', sourceRef),
    ...normalizeIndicators(project.outcome_indicators, projectId, 'outcome', sourceRef),
  ];

  if (indicators.length === 0) {
    reviewFlags.push('指標未抽出');
  }

  const baseProject: ProjectRecord = {
    id: projectId,
    sourceDocumentId: document.id,
    projectNumber: normalizeProjectNumber(project.project_number, projectName) || undefined,
    projectName,
    projectSummary,
    department: normalizeText(project.department) || undefined,
    budget: normalizeText(project.budget) || undefined,
    fiscalYear: normalizeText(project.fiscal_year) || undefined,
    status: normalizeText(project.status) || undefined,
    sourceRefs: [sourceRef],
    indicators,
    confidence: normalizeConfidence(project.confidence),
    reviewFlags: Array.from(new Set(reviewFlags)),
    publicationStatus: 'review',
    publicationNotes: [],
  };

  return applyProjectQualityGate(document, baseProject);
}

function normalizeIndicators(
  indicators: RawIndicator[] | undefined,
  projectId: string,
  indicatorType: IndicatorRecord['indicatorType'],
  sourceRef: EvidenceRef
): IndicatorRecord[] {
  if (!Array.isArray(indicators)) {
    return [];
  }

  return indicators.reduce<IndicatorRecord[]>((result, indicator, index) => {
      const name = normalizeText(indicator.name);
      if (!name) {
        return result;
      }

      result.push({
        id: `${projectId}-${indicatorType}-${index + 1}`,
        projectId,
        indicatorType,
        name,
        unit: normalizeText(indicator.unit) || undefined,
        plannedValue: normalizeText(indicator.planned_value) || undefined,
        actualValue: normalizeText(indicator.actual_value) || undefined,
        targetValue: normalizeText(indicator.target_value) || undefined,
        achievement: normalizeText(indicator.achievement) || undefined,
        sourceRefs: [sourceRef],
      });
      return result;
    }, []);
}

function buildReviewItems(
  document: WorkspaceDocument,
  project: ProjectRecord,
  model: string
): ReviewItem[] {
  return project.reviewFlags.map((reason, index) => ({
    id: `${project.id}-review-${index + 1}`,
    documentId: document.id,
    projectId: project.id,
    severity: /未抽出|欠損|曖昧/u.test(reason) || project.confidence < 0.6 ? 'high' : 'medium',
    reason,
    suggestedAction: `${model} 抽出結果と原資料の該当行を確認`,
    status: 'open',
  }));
}

function applyProjectQualityGate(document: WorkspaceDocument, project: ProjectRecord): ProjectRecord {
  const reviewFlags = [...project.reviewFlags];
  const publicationNotes: string[] = [];
  let confidence = project.confidence;

  if (!project.projectNumber) {
    reviewFlags.push('事業番号未抽出');
    confidence -= 0.04;
  }

  if (!project.sourceRefs.length || !project.sourceRefs[0]?.sourceReference) {
    reviewFlags.push('出典参照不足');
    publicationNotes.push('出典参照が不足しているため自動公開を保留');
    confidence -= 0.18;
  }

  if (looksBrokenText(project.projectName)) {
    reviewFlags.push('事業名要確認');
    publicationNotes.push('事業名が破損または管理値の可能性');
    confidence -= 0.22;
  }

  if (looksBrokenText(project.projectSummary)) {
    reviewFlags.push('概要要確認');
    confidence -= 0.12;
  }

  if (project.reviewFlags.includes('指標未抽出') || project.indicators.length === 0) {
    publicationNotes.push('指標が不足しているため要確認表示で公開');
    confidence -= 0.08;
  }

  const sourceMunicipality = resolveSourceMunicipality(document);
  const digestMunicipality = normalizeText(document.structuredData?.municipality);
  if (
    sourceMunicipality &&
    digestMunicipality &&
    sourceMunicipality !== digestMunicipality &&
    digestMunicipality !== '未登録'
  ) {
    reviewFlags.push('自治体名不一致');
    publicationNotes.push(`収集台帳は ${sourceMunicipality} だが抽出結果は ${digestMunicipality}`);
    confidence -= 0.1;
  }

  if (project.confidence < 0.6) {
    publicationNotes.push('抽出信頼度が低いためレビュー対象');
  }

  const dedupedFlags = Array.from(new Set(reviewFlags));
  const normalizedConfidence = Math.max(0.05, Math.min(0.98, confidence));
  const publicationStatus = determinePublicationStatus(project, dedupedFlags, normalizedConfidence);

  if (publicationStatus === 'blocked' && publicationNotes.length === 0) {
    publicationNotes.push('自動公開条件を満たさないため保留');
  }

  return {
    ...project,
    confidence: normalizedConfidence,
    reviewFlags: dedupedFlags,
    publicationStatus,
    publicationNotes,
  };
}

function determinePublicationStatus(
  project: ProjectRecord,
  reviewFlags: string[],
  confidence: number
): ProjectRecord['publicationStatus'] {
  const hardBlockReasons = [
    looksBrokenText(project.projectName),
    !project.sourceRefs.length,
    reviewFlags.includes('出典参照不足'),
    confidence < 0.45,
  ];
  if (hardBlockReasons.some(Boolean)) {
    return 'blocked';
  }

  if (confidence < 0.72 || reviewFlags.length > 0) {
    return 'review';
  }

  return 'ready';
}

function buildHeuristicExtraction(
  document: WorkspaceDocument,
  candidateRows: ProjectCandidateRow[]
): { documentDigest: DocumentDigest; projects: ProjectRecord[]; reviewItems: ReviewItem[] } {
  const projects = candidateRows
    .filter((row) => row.candidateKind === 'project')
    .slice(0, 60)
    .map((row, index) => {
    const sourceRef = buildEvidenceRef(document, row.sourceReference, row.projectSummaryCandidate);
    const projectId = `${document.id}-heuristic-${index + 1}`;
    const indicators = inferIndicatorsFromRow(row, projectId, sourceRef);
    const reviewFlags = indicators.length === 0 ? ['指標未抽出'] : [];

    const baseProject: ProjectRecord = {
      id: projectId,
      sourceDocumentId: document.id,
      projectNumber: normalizeProjectNumber(row.projectNumber, row.projectNameCandidate) || undefined,
      projectName: normalizeProjectName(row.projectNameCandidate),
      projectSummary: normalizeSummary(row.projectSummaryCandidate),
      department: normalizeText(row.department) || undefined,
      budget: normalizeText(row.budget) || undefined,
      fiscalYear: normalizeText(row.fiscalYear) || undefined,
      status: normalizeText(row.status) || undefined,
      sourceRefs: [sourceRef],
      indicators,
      confidence: indicators.length > 0 ? 0.68 : 0.54,
      reviewFlags,
      publicationStatus: 'review',
      publicationNotes: [],
    };

    return applyProjectQualityGate(document, baseProject);
  }).filter((project) => project.projectName && project.projectSummary);

  const reviewItems = projects.flatMap((project) =>
    project.reviewFlags.map((reason, index) => ({
      id: `${project.id}-review-${index + 1}`,
      documentId: document.id,
      projectId: project.id,
      severity: 'high' as const,
      reason,
      suggestedAction: 'raw CSV と layout text を確認',
      status: 'open' as const,
    }))
  );

  return {
    documentDigest: {
      title: document.structuredData?.title || document.name,
      municipality: resolveSourceMunicipality(document) || document.structuredData?.municipality || '未抽出',
      overview: document.structuredData?.summary || '事業候補行から再構造化した結果です。',
      category: document.structuredData?.category,
    },
    projects,
    reviewItems,
  };
}

function inferIndicatorsFromRow(
  row: ProjectCandidateRow,
  projectId: string,
  sourceRef: EvidenceRef
): IndicatorRecord[] {
  const inferredIndicators = buildIndicatorsFromRowFields(row.rowFields, projectId, sourceRef);
  if (inferredIndicators.length > 0) {
    return inferredIndicators;
  }

  const fields = Object.entries(row.rowFields);
  const indicatorName = fields.find(([key, value]) => /指標/u.test(key) && normalizeIndicatorName(value))?.[1];
  const actualValue = fields.find(([key]) => /実績|現状|現在/u.test(key))?.[1];
  const targetValue = fields.find(([key]) => /目標/u.test(key))?.[1];
  if (!indicatorName) {
    return [];
  }

  return [
    {
      id: `${projectId}-heuristic-outcome-1`,
      projectId,
      indicatorType: 'outcome',
      name: indicatorName,
      actualValue,
      targetValue,
      sourceRefs: [sourceRef],
    },
  ];
}

function buildRawCandidateRows(document: WorkspaceDocument): ProjectCandidateRow[] {
  const csvRows = document.rawCsv ? extractCandidatesFromRawCsv(document.rawCsv, document.id) : [];
  if (csvRows.length > 0) {
    return csvRows;
  }

  return document.tableResults
    .filter((result): result is Extract<TableParseResult, { status: 'parsed' }> => result.status === 'parsed')
    .flatMap((result) =>
      extractCandidatesFromParsedTable(document, result.table.headers, result.table.rows, result.table.id)
    );
}

function buildCandidateRows(document: WorkspaceDocument): ProjectCandidateRow[] {
  return normalizeCandidateRows(buildRawCandidateRows(document));
}

function normalizeCandidateRows(rows: ProjectCandidateRow[]): ProjectCandidateRow[] {
  const normalized: ProjectCandidateRow[] = [];

  rows.forEach((row) => {
    if (row.candidateKind === 'section') {
      normalized.push(row);
      return;
    }

    const previousProject = findPreviousProjectRow(normalized);
    if (previousProject && isContinuationRow(previousProject, row)) {
      const merged = mergeCandidateRows(previousProject, row);
      normalized[normalized.length - 1] = merged;
      return;
    }

    if (shouldDropCandidateRow(row)) {
      return;
    }

    normalized.push(row);
  });

  return normalized;
}

function buildCandidateRowBundle(
  document: CandidateBundleSource,
  candidateRows: ProjectCandidateRow[],
  selectedProjectRows?: ProjectCandidateRow[]
): ProjectCandidateRowBundle {
  return {
    documentId: document.id,
    documentName: document.name,
    municipalityHint: resolveSourceMunicipality(document) || normalizeText(document.structuredData?.municipality) || undefined,
    titleHint: normalizeText(document.structuredData?.title) || document.name,
    overviewHint: normalizeText(document.structuredData?.summary) || undefined,
    candidateRows: selectedProjectRows || selectProjectRowsForNormalization(candidateRows).slice(0, 80),
    fieldGlossary: buildFieldGlossary(candidateRows),
    neighborRows: buildNeighborRows(selectedProjectRows || selectProjectRowsForNormalization(candidateRows).slice(0, 80)),
    rawCsvPreview: document.rawCsv ? clampText(document.rawCsv, 3000) : undefined,
    layoutPreview: document.rawLayoutText ? clampText(document.rawLayoutText, 2000) : undefined,
  };
}

function selectProjectRowsForNormalization(candidateRows: ProjectCandidateRow[]): ProjectCandidateRow[] {
  return [...candidateRows]
    .filter((row) => row.candidateKind === 'project')
    .sort((left, right) => {
      const scoreDiff = getNormalizationPriority(right) - getNormalizationPriority(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const pageDiff = (left.page || 0) - (right.page || 0);
      if (pageDiff !== 0) {
        return pageDiff;
      }
      return (left.rowNumber || 0) - (right.rowNumber || 0);
    })
    .slice(0, GEMINI_PROJECT_ROW_LIMIT);
}

function getNormalizationPriority(row: ProjectCandidateRow): number {
  let score = Math.round(row.confidence * 100);
  if (row.projectNumber) {
    score += 8;
  }
  if (row.activityIndicatorName) {
    score += 6;
  }
  if (row.department) {
    score += 3;
  }
  if (row.budget) {
    score += 2;
  }
  return score;
}

function buildFieldGlossary(candidateRows: ProjectCandidateRow[]): Record<string, string> {
  const glossary: Record<string, string> = {};
  candidateRows.forEach((row) => {
    Object.keys(row.rowFields).forEach((key) => {
      if (glossary[key]) {
        return;
      }
      if (/事業名|施策名|取組名|名称/u.test(key)) {
        glossary[key] = 'project_name';
      } else if (/概要|内容|説明|目的|効果/u.test(key)) {
        glossary[key] = 'project_summary';
      } else if (/活動/u.test(key) && /指標/u.test(key)) {
        glossary[key] = 'activity_indicator';
      } else if (/成果/u.test(key) && /指標/u.test(key)) {
        glossary[key] = 'outcome_indicator';
      } else if (/担当|部|課|局/u.test(key)) {
        glossary[key] = 'department';
      } else if (/予算|決算|事業費/u.test(key)) {
        glossary[key] = 'budget';
      } else if (/年度/u.test(key)) {
        glossary[key] = 'fiscal_year';
      }
    });
  });
  return glossary;
}

function buildNeighborRows(candidateRows: ProjectCandidateRow[]): ProjectCandidateRowBundle['neighborRows'] {
  return candidateRows.map((row, index) => ({
    sourceReference: row.sourceReference,
    previousSourceReference: candidateRows[index - 1]?.sourceReference,
    previousProjectName: candidateRows[index - 1]?.projectNameCandidate || undefined,
    nextSourceReference: candidateRows[index + 1]?.sourceReference,
    nextProjectName: candidateRows[index + 1]?.projectNameCandidate || undefined,
  }));
}

function chunkCandidateRows(rows: ProjectCandidateRow[], chunkSize: number): ProjectCandidateRow[][] {
  const chunks: ProjectCandidateRow[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

function findPreviousProjectRow(rows: ProjectCandidateRow[]): ProjectCandidateRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index]?.candidateKind === 'project') {
      return rows[index] || null;
    }
  }
  return null;
}

function extractCandidatesFromParsedTable(
  document: WorkspaceDocument,
  headers: string[],
  rows: string[][],
  tableId: string
): ProjectCandidateRow[] {
  const normalizedHeaders = headers.length > 0 ? headers : buildAnonymousHeaders(rows);
  const nameIndex = inferColumnIndex(normalizedHeaders, /事業名|施策名|取組名|名称|事業/u);
  const summaryIndexes = normalizedHeaders
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index !== nameIndex && /概要|内容|説明|目的|効果/u.test(header))
    .map(({ index }) => index);
  const sectionContext = createEmptySectionContext();

  return rows.reduce<ProjectCandidateRow[]>((result, row, rowIndex) => {
      const normalizedRow = row.map((cell) => normalizeText(cell));
      if (normalizedRow.every((cell) => !cell)) {
        return result;
      }

      if (isSectionOnlyRow(normalizedHeaders, normalizedRow)) {
        updateSectionContext(sectionContext, normalizedHeaders, normalizedRow);
        const sectionPath = getSectionPath(sectionContext);
        if (sectionPath.length > 0) {
          result.push({
            id: `${document.id}-${tableId}-section-${rowIndex + 1}`,
            sourceDocumentId: document.id,
            extractorStrategy: 'row-segmented',
            page: extractPageFromTableId(tableId),
            tableId,
            rowNumber: rowIndex + 1,
            sourceReference: `${tableId}:row-${rowIndex + 1}`,
            sectionPath,
            projectNameCandidate: sectionPath.at(-1) || '',
            projectSummaryCandidate: '',
            rowFields: Object.fromEntries(
              normalizedHeaders.map((header, index) => [header || `col_${index + 1}`, normalizedRow[index] || ''])
            ),
            confidence: 0.92,
            candidateKind: 'section',
          });
        }
        return result;
      }

      const projectCells = findProjectCells(normalizedHeaders, normalizedRow, nameIndex);
      const projectName = normalizeProjectName(projectCells.name);
      if (!projectName) {
        return result;
      }

      const summaryFromHeaders = summaryIndexes
        .map((index) => normalizeText(normalizedRow[index]))
        .filter(Boolean)
        .join(' / ');

      const normalizedSummary = normalizeSummary(
        summaryFromHeaders ||
          projectCells.summary ||
          normalizedRow.find((cell) => normalizeSummary(cell) && normalizeText(cell) !== projectName) ||
          ''
      );
      if (!normalizedSummary) {
        return result;
      }

      const rowFields = Object.fromEntries(
        normalizedHeaders.map((header, index) => [header || `col_${index + 1}`, normalizedRow[index] || ''])
      );
      const inferredIndicators = buildIndicatorsFromRowFields(rowFields, `candidate-${rowIndex + 1}`, {
        documentId: document.id,
        documentName: document.name,
        sourceReference: `${tableId}:row-${rowIndex + 1}`,
      });
      const primaryIndicator = inferredIndicators[0];

      result.push({
        id: `${document.id}-${tableId}-project-${rowIndex + 1}`,
        sourceDocumentId: document.id,
        extractorStrategy: 'row-segmented',
        page: extractPageFromTableId(tableId),
        tableId,
        rowNumber: rowIndex + 1,
        sourceReference: `${tableId}:row-${rowIndex + 1}`,
        sectionPath: getSectionPath(sectionContext),
        projectNumber: findValue(normalizedHeaders, normalizedRow, /番号|No\.?/u) || undefined,
        projectNameCandidate: projectName,
        projectSummaryCandidate: normalizedSummary,
        activityIndicatorName: primaryIndicator?.name,
        indicatorUnit: primaryIndicator?.unit,
        actualValue: primaryIndicator?.actualValue,
        targetValue: primaryIndicator?.targetValue,
        department: findValue(normalizedHeaders, normalizedRow, /担当|部|課|局/u),
        budget: findValue(normalizedHeaders, normalizedRow, /予算|決算|事業費/u),
        status: findValue(normalizedHeaders, normalizedRow, /状況|進捗|継続/u),
        fiscalYear: findValue(normalizedHeaders, normalizedRow, /年度/u),
        rowFields,
        confidence: determineCandidateConfidence(normalizedHeaders, rowFields),
        candidateKind: 'project',
      });
      return result;
    }, []);
}

function extractCandidatesFromRawCsv(rawCsv: string, sourceDocumentId = 'document'): ProjectCandidateRow[] {
  const sections = rawCsv
    .split(/\n{2,}(?=# Page \d+ Table \d+)|\n\s*\n/g)
    .map((section) => section.trim())
    .filter(Boolean);
  const rows: ProjectCandidateRow[] = [];

  sections.forEach((section, sectionIndex) => {
    const lines = section
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return;
    }

    const markerMatch = lines[0]?.match(/^# Page (\d+) Table (\d+)/);
    const tableId = markerMatch
      ? `page-${markerMatch[1]}-table-${markerMatch[2]}`
      : `csv-${sectionIndex + 1}`;
    const csvStartIndex = markerMatch ? 1 : 0;
    const headerLine = lines[csvStartIndex];
    const bodyLines = lines.slice(csvStartIndex + 1);
    if (!headerLine || bodyLines.length === 0) {
      return;
    }

    const header = parseCsvLine(headerLine);
    const body = bodyLines.map(parseCsvLine);
    const pseudoDocument = {
      id: sourceDocumentId,
      name: sourceDocumentId,
    } as WorkspaceDocument;
    rows.push(...extractCandidatesFromParsedTable(pseudoDocument, header, body, tableId));
  });

  return rows;
}

function buildEvidenceRef(document: WorkspaceDocument, sourceReference: string, excerpt: string): EvidenceRef {
  const pageMatch = sourceReference.match(/page[-: ]?(\d+)/i);
  const rowMatch = sourceReference.match(/row[-: ]?(\d+)/i);
  const tableMatch = sourceReference.match(/([a-z0-9_-]+):row/i);

  return {
    documentId: document.id,
    documentName: document.name,
    page: pageMatch ? Number(pageMatch[1]) : undefined,
    rowNumber: rowMatch ? Number(rowMatch[1]) : undefined,
    tableId: tableMatch ? tableMatch[1] : undefined,
    sourceReference,
    excerpt: clampText(excerpt, 180),
  };
}

function buildAnonymousHeaders(rows: string[][]): string[] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, index) => `列${index + 1}`);
}

function createEmptySectionContext(): Record<'major' | 'base' | 'policy', string> {
  return { major: '', base: '', policy: '' };
}

function isSectionOnlyRow(headers: string[], row: string[]): boolean {
  const projectNameIndex = inferColumnIndex(headers, /事業名|施策名|取組名|名称|事業/u);
  const summaryIndex = headers.findIndex((header) => /概要|内容|説明|目的|効果/u.test(header));
  const hasProjectCell = Boolean(normalizeProjectName(row[projectNameIndex] || ''));
  const hasSummaryCell = summaryIndex >= 0 ? Boolean(normalizeSummary(row[summaryIndex] || '')) : false;
  if (hasProjectCell || hasSummaryCell) {
    return false;
  }

  const sectionIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /大\s*綱|基\s*本\s*施\s*策|施\s*策/u.test(header))
    .map(({ index }) => index);
  return sectionIndexes.some((index) => Boolean(row[index]));
}

function updateSectionContext(
  context: Record<'major' | 'base' | 'policy', string>,
  headers: string[],
  row: string[]
): void {
  headers.forEach((header, index) => {
    const value = normalizeText(row[index]);
    if (!value) {
      return;
    }
    if (/大\s*綱/u.test(header)) {
      context.major = value;
      context.base = '';
      context.policy = '';
      return;
    }
    if (/基\s*本\s*施\s*策/u.test(header)) {
      context.base = value;
      context.policy = '';
      return;
    }
    if (/施\s*策/u.test(header) && !/基\s*本/u.test(header)) {
      context.policy = value;
    }
  });
}

function getSectionPath(context: Record<'major' | 'base' | 'policy', string>): string[] {
  return [context.major, context.base, context.policy].filter(Boolean);
}

function extractPageFromTableId(tableId: string): number | undefined {
  const match = tableId.match(/page-(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function findProjectCells(headers: string[], row: string[], fallbackNameIndex: number): { name: string; summary: string } {
  const normalizedRow = row.map((cell) => normalizeText(cell));
  const explicitName = normalizeProjectName(normalizedRow[fallbackNameIndex] || '');
  if (explicitName) {
    const summary = normalizedRow
      .filter((cell, index) => index !== fallbackNameIndex && normalizeSummary(cell))
      .sort((left, right) => right.length - left.length)[0] || '';
    return { name: explicitName, summary };
  }

  const numberIndex = headers.findIndex((header) => /番号|No\.?/u.test(header));
  const nameCandidate = normalizedRow.find((cell, index) => {
    if (!cell || index === numberIndex) {
      return false;
    }
    return Boolean(normalizeProjectName(cell));
  }) || '';
  const summary = normalizedRow.find((cell) => cell !== nameCandidate && Boolean(normalizeSummary(cell))) || '';
  return { name: nameCandidate, summary };
}

function inferColumnIndex(headers: string[], pattern: RegExp): number {
  const exactIndex = headers.findIndex((header) => pattern.test(header));
  if (exactIndex >= 0) {
    return exactIndex;
  }

  return headers.findIndex((header) => /名称|名/u.test(header)) >= 0
    ? headers.findIndex((header) => /名称|名/u.test(header))
    : 0;
}

function findValue(headers: string[], row: string[], pattern: RegExp): string {
  const index = headers.findIndex((header) => pattern.test(header));
  return index >= 0 ? normalizeText(row[index]) : '';
}

function determineCandidateConfidence(headers: string[], rowFields: Record<string, string>): number {
  let confidence = 0.58;
  if (headers.some((header) => /事業名|施策名|取組名|名称|事業/u.test(header))) {
    confidence += 0.08;
  }
  if (Object.keys(rowFields).some((key) => /概要|内容|説明|目的|効果/u.test(key) && normalizeSummary(rowFields[key]))) {
    confidence += 0.08;
  }
  if (Object.keys(rowFields).some((key) => /活動|成果/u.test(key) && /指標/u.test(key) && normalizeText(rowFields[key]))) {
    confidence += 0.12;
  }
  if (Object.keys(rowFields).some((key) => /担当|部|課|局/u.test(key) && normalizeText(rowFields[key]))) {
    confidence += 0.06;
  }
  return Math.min(0.95, confidence);
}

function shouldDropCandidateRow(row: ProjectCandidateRow): boolean {
  if (row.candidateKind !== 'project') {
    return false;
  }

  const summaryText = normalizeText(row.projectSummaryCandidate);
  const explicitProjectCell = hasExplicitProjectCell(row);
  const signalScore = getCandidateSignalScore(row);

  if (!explicitProjectCell && looksLikeNoteRow(summaryText)) {
    return true;
  }

  if (!explicitProjectCell && signalScore < 2) {
    return true;
  }

  return false;
}

function isContinuationRow(previous: ProjectCandidateRow, current: ProjectCandidateRow): boolean {
  if (previous.candidateKind !== 'project' || current.candidateKind !== 'project') {
    return false;
  }

  const summaryText = normalizeText(current.projectSummaryCandidate);
  if (!summaryText || looksLikeNoteRow(summaryText)) {
    return false;
  }

  const explicitProjectCell = hasExplicitProjectCell(current);
  const hasEmptyProjectColumn = Object.entries(current.rowFields).some(([key, value]) => {
    if (!isProjectNameHeader(key)) {
      return false;
    }
    return !normalizeText(value);
  });

  if (explicitProjectCell) {
    return false;
  }

  if ((current.projectNumber || '').trim()) {
    return false;
  }

  if (JSON.stringify(previous.sectionPath) !== JSON.stringify(current.sectionPath)) {
    return false;
  }

  const currentSignalScore = getCandidateSignalScore(current);
  const currentIndicatorName = normalizeIndicatorName(current.activityIndicatorName);
  const previousIndicatorName = normalizeIndicatorName(previous.activityIndicatorName);
  if (currentIndicatorName && currentIndicatorName !== previousIndicatorName) {
    return false;
  }

  if (hasEmptyProjectColumn) {
    return true;
  }

  return currentSignalScore >= 2;
}

function mergeCandidateRows(previous: ProjectCandidateRow, current: ProjectCandidateRow): ProjectCandidateRow {
  const mergedSummary = mergeTextFragments(previous.projectSummaryCandidate, current.projectSummaryCandidate);
  const mergedFields = { ...previous.rowFields };

  Object.entries(current.rowFields).forEach(([key, value]) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue) {
      return;
    }

    if (!mergedFields[key]) {
      mergedFields[key] = normalizedValue;
      return;
    }

    if (mergedFields[key] !== normalizedValue && /概要|内容|説明|目的|効果/u.test(key)) {
      mergedFields[key] = mergeTextFragments(mergedFields[key], normalizedValue);
    }
  });

  return {
    ...previous,
    sourceReference: mergeSourceReferences(previous.sourceReference, current.sourceReference),
    rowNumber: previous.rowNumber,
    projectSummaryCandidate: mergedSummary,
    activityIndicatorName: previous.activityIndicatorName || current.activityIndicatorName,
    indicatorUnit: previous.indicatorUnit || current.indicatorUnit,
    actualValue: previous.actualValue || current.actualValue,
    targetValue: previous.targetValue || current.targetValue,
    department: previous.department || current.department,
    budget: previous.budget || current.budget,
    status: previous.status || current.status,
    fiscalYear: previous.fiscalYear || current.fiscalYear,
    rowFields: mergedFields,
    confidence: Math.min(0.97, Math.max(previous.confidence, current.confidence) + 0.03),
  };
}

function mergeSourceReferences(left: string, right: string): string {
  const refs = new Set(
    `${left}|${right}`
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return Array.from(refs).join(' + ');
}

function mergeTextFragments(left: string, right: string): string {
  const leftText = normalizeText(left);
  const rightText = normalizeText(right);
  if (!leftText) {
    return rightText;
  }
  if (!rightText || leftText.includes(rightText)) {
    return leftText;
  }
  if (rightText.includes(leftText)) {
    return rightText;
  }
  return clampText(`${leftText} ${rightText}`.trim(), 220);
}

function hasExplicitProjectCell(row: ProjectCandidateRow): boolean {
  return Object.entries(row.rowFields).some(([key, value]) => {
    if (!isProjectNameHeader(key)) {
      return false;
    }
    return normalizeProjectName(value) === row.projectNameCandidate;
  });
}

function getCandidateSignalScore(row: ProjectCandidateRow): number {
  let score = 0;
  if (hasExplicitProjectCell(row)) {
    score += 2;
  }
  if (normalizeSummary(row.projectSummaryCandidate)) {
    score += 1;
  }
  if (normalizeIndicatorName(row.activityIndicatorName)) {
    score += 1;
  }
  if (normalizeText(row.department) || normalizeText(row.budget) || normalizeText(row.status)) {
    score += 1;
  }
  return score;
}

function looksLikeNoteRow(value: string): boolean {
  return /^(?:※|注|備考|うち|再掲|内訳|合計|計|参考)/u.test(value);
}

function isProjectNameHeader(value: string): boolean {
  return /(事業名|施策名|取組名|名称)$/u.test(normalizeText(value));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
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

function escapeCsvCell(value: string | number): string {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function buildIndicatorsFromRowFields(
  rowFields: Record<string, string>,
  projectId: string,
  sourceRef: EvidenceRef
): IndicatorRecord[] {
  const activityIndicator = buildIndicatorFromFieldPrefix(rowFields, projectId, sourceRef, 'activity');
  const outcomeIndicator = buildIndicatorFromFieldPrefix(rowFields, projectId, sourceRef, 'outcome');
  return [activityIndicator, outcomeIndicator].filter((indicator): indicator is IndicatorRecord => Boolean(indicator));
}

function buildIndicatorFromFieldPrefix(
  rowFields: Record<string, string>,
  projectId: string,
  sourceRef: EvidenceRef,
  indicatorType: IndicatorRecord['indicatorType']
): IndicatorRecord | null {
  const prefix = indicatorType === 'activity' ? /活動/u : /成果/u;
  const entries = Object.entries(rowFields);
  const name = normalizeIndicatorName(
    entries.find(([key]) => prefix.test(key) && /指標.*名|指標名|名称/u.test(key))?.[1] ||
      entries.find(([key, value]) => prefix.test(key) && /指標/u.test(key) && normalizeIndicatorName(value))?.[1]
  );

  if (!name) {
    return null;
  }

  const unit = normalizeText(entries.find(([key]) => prefix.test(key) && /単位/u.test(key))?.[1]);
  const plannedValue = normalizeText(entries.find(([key]) => prefix.test(key) && /計画|当初/u.test(key))?.[1]);
  const actualValue = normalizeText(entries.find(([key]) => prefix.test(key) && /実績|現状|現在/u.test(key))?.[1]);
  const targetValue = normalizeText(entries.find(([key]) => prefix.test(key) && /目標/u.test(key))?.[1]);
  const achievement = normalizeText(entries.find(([key]) => prefix.test(key) && /達成/u.test(key))?.[1]);

  return {
    id: `${projectId}-${indicatorType}-heuristic-1`,
    projectId,
    indicatorType,
    name,
    unit: unit || undefined,
    plannedValue: plannedValue || undefined,
    actualValue: actualValue || undefined,
    targetValue: targetValue || undefined,
    achievement: achievement || undefined,
    sourceRefs: [sourceRef],
  };
}

function normalizeProjectName(value: unknown): string {
  const normalized = normalizeText(value).replace(/^(\d+[-－]\d+|\d+)\s+/u, '');
  if (!normalized || normalized.length < 3) {
    return '';
  }
  if (/^(継続|終了|見直し|有|無|目標値|実績値|達成度|評価指標|成果指標|指標)$/u.test(normalized)) {
    return '';
  }
  if (/^(大\s*綱|基\s*本\s*施\s*策|施\s*策)$/u.test(normalized)) {
    return '';
  }
  if (/^[-(]?\d[\d,.)% ]*$/.test(normalized) || /^(r\d+c\d+|col_\d+|row-\d+)$/iu.test(normalized)) {
    return '';
  }
  return clampText(normalized, 80);
}

function normalizeProjectNumber(value: unknown, projectName: string): string {
  const normalized = normalizeText(value);
  if (normalized && /^(?:\d+[-－]\d+|\d+)$/.test(normalized)) {
    return normalized.replace('－', '-');
  }

  const match = projectName.match(/^(\d+[-－]\d+|\d+)\b/);
  return match ? match[1].replace('－', '-') : '';
}

function normalizeSummary(value: unknown): string {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  if (!normalized || normalized.length < 6 || /^(継続|終了|見直し|有|無)$/u.test(normalized)) {
    return '';
  }
  return clampText(normalized, 220);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, ' ')
        .trim()
    : '';
}

function normalizeFlags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeText).filter(Boolean);
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.72;
  }
  return Math.max(0.1, Math.min(1, value));
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}…`;
}

function buildCandidateProjectRowsCsv(candidateRows: ProjectCandidateRow[]): string {
  const projectRows = candidateRows.filter((row) => row.candidateKind === 'project');
  if (projectRows.length === 0) {
    return '';
  }

  const columns = [
    'document_id',
    'page',
    'table_id',
    'row_number',
    'section_path',
    'project_number',
    'project_name',
    'project_summary',
    'activity_indicator_name',
    'indicator_unit',
    'actual_value',
    'target_value',
    'department',
    'budget',
    'status',
    'fiscal_year',
    'source_reference',
    'confidence',
  ];

  const lines = [
    columns.join(','),
    ...projectRows.map((row) =>
      [
        row.sourceDocumentId,
        row.page ?? '',
        row.tableId ?? '',
        row.rowNumber ?? '',
        row.sectionPath.join(' > '),
        row.projectNumber ?? '',
        row.projectNameCandidate,
        row.projectSummaryCandidate,
        row.activityIndicatorName ?? '',
        row.indicatorUnit ?? '',
        row.actualValue ?? '',
        row.targetValue ?? '',
        row.department ?? '',
        row.budget ?? '',
        row.status ?? '',
        row.fiscalYear ?? '',
        row.sourceReference,
        row.confidence.toFixed(2),
      ].map(escapeCsvCell).join(',')
    ),
  ];

  return lines.join('\n');
}

function buildNormalizedProjectRowsCsv(rows: NormalizedProjectRow[]): string {
  if (rows.length === 0) {
    return '';
  }

  const columns = [
    'source_reference',
    'section_path',
    'municipality',
    'project_number',
    'project_name',
    'project_summary',
    'department',
    'budget',
    'fiscal_year',
    'status',
    'activity_indicator_name',
    'activity_indicator_unit',
    'activity_planned_value',
    'activity_actual_value',
    'outcome_indicator_name',
    'outcome_indicator_unit',
    'outcome_target_value',
    'outcome_actual_value',
    'achievement',
    'confidence',
    'review_flags',
  ];

  const lines = [
    columns.join(','),
    ...rows.map((row) =>
      [
        row.sourceReference,
        row.sectionPath.join(' > '),
        row.municipality ?? '',
        row.projectNumber ?? '',
        row.projectName,
        row.projectSummary,
        row.department ?? '',
        row.budget ?? '',
        row.fiscalYear ?? '',
        row.status ?? '',
        row.activityIndicatorName ?? '',
        row.activityIndicatorUnit ?? '',
        row.activityPlannedValue ?? '',
        row.activityActualValue ?? '',
        row.outcomeIndicatorName ?? '',
        row.outcomeIndicatorUnit ?? '',
        row.outcomeTargetValue ?? '',
        row.outcomeActualValue ?? '',
        row.achievement ?? '',
        row.confidence.toFixed(2),
        row.reviewFlags.join(' / '),
      ].map(escapeCsvCell).join(',')
    ),
  ];

  return lines.join('\n');
}

function normalizeRowDecision(value: unknown): ProjectRowDecision['decision'] | null {
  const normalized = normalizeText(value);
  if (normalized === 'project' || normalized === 'continuation' || normalized === 'section' || normalized === 'note' || normalized === 'drop') {
    return normalized;
  }
  return null;
}

function normalizeIndicatorName(value: unknown): string {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length < 2) {
    return '';
  }
  if (/^(活動|成果)?指標(名)?$/u.test(normalized) || looksBrokenText(normalized)) {
    return '';
  }
  return clampText(normalized, 80);
}

function resolveSourceMunicipality(document: SourceMunicipalitySource): string {
  const municipality = normalizeText(document.collectionSource?.municipality);
  return municipality && municipality !== '未登録' ? municipality : '';
}

export function deriveCandidateBundle(document: CandidateBundleSource): ProjectCandidateRowBundle | null {
  return buildCandidateRowBundle(document, document.candidateRows);
}

export function deriveProjectRowsCsv(
  document: Pick<WorkspaceDocument, 'candidateRows' | 'normalizedRows'>
): string | null {
  const normalizedRowsCsv = buildNormalizedProjectRowsCsv(document.normalizedRows);
  if (normalizedRowsCsv) {
    return normalizedRowsCsv;
  }

  const candidateRowsCsv = buildCandidateProjectRowsCsv(document.candidateRows);
  return candidateRowsCsv || null;
}

function looksBrokenText(value: string): boolean {
  return (
    /^[-(]?\d[\d,.)% ]*$/u.test(value) ||
    /^(r\d+c\d+|col_\d+|row-\d+)$/iu.test(value) ||
    /[\uFFFD]/u.test(value) ||
    /Ã|Â|¢|â/u.test(value)
  );
}

export const projectExtractorInternals = {
  buildRawCandidateRows,
  buildCandidateRows,
  buildCandidateProjectRowsCsv,
  buildCandidateRowBundle,
  buildNormalizedProjectRowsCsv,
  deriveCandidateBundle,
  deriveProjectRowsCsv,
  buildProjectsFromNormalizedRows,
  buildIndicatorsFromRowFields,
  buildValidatedRowsFromDecisions,
  extractCandidatesFromRawCsv,
  normalizeExtractionPayload,
  normalizeCandidateRows,
  normalizeProjectName,
  normalizeProjectNumber,
  normalizeRowDecisions,
  normalizeSummary,
  validateNormalizedRows,
  applyProjectQualityGate,
};
