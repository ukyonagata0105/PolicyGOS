import type {
  DocumentRouteDecision,
  DocumentDigest,
  GeneratedUIBuildInput,
  GeneratedUIBuildOutput,
  IngestionStageArtifacts,
  NormalizedProjectRow,
  ProjectCandidateRow,
  ProjectExtractionArtifacts,
  ProjectExtractionResult,
  RepairDocumentPayload,
  RepairResponse,
  RepairResult,
  RepairRowPayload,
  RepairStageArtifacts,
  StructuredPolicy,
  TableStageArtifacts,
  UIGenerationResult,
  UserProfile,
  WorkspaceDocument,
} from '@/types';

export function createEmptyIngestionStageArtifacts(): IngestionStageArtifacts {
  return {
    ocrText: null,
    structuringText: null,
    rawLayoutText: null,
    rawJson: null,
    rawCsv: null,
    documentType: undefined,
    ingestionPath: undefined,
    classificationConfidence: undefined,
    error: null,
  };
}

export function createEmptyTableStageArtifacts(): TableStageArtifacts {
  return {
    tableArtifacts: [],
    tableResults: [],
  };
}

export function createEmptyProjectExtractionArtifacts(): ProjectExtractionArtifacts {
  return {
    documentDigest: null,
    candidateBundle: null,
    rawCandidateRows: [],
    candidateRows: [],
    routeDecision: null,
    rowDecisions: [],
    normalizedRows: [],
    projectRowsCsv: null,
    projects: [],
    reviewItems: [],
    provider: undefined,
    model: undefined,
    rawResponse: null,
    error: null,
  };
}

export function createEmptyRepairStageArtifacts(): RepairStageArtifacts {
  return {
    repairStatus: 'idle',
    repairProvider: undefined,
    repairModel: undefined,
    repairRawResponse: null,
    repairError: null,
    repairNotes: [],
    repairMetrics: null,
    originalNormalizedRows: [],
    repairedNormalizedRows: [],
    normalizedRows: [],
  };
}

export function createEmptyWorkspacePipelineState(): Pick<
  WorkspaceDocument,
  | 'ocrText'
  | 'structuringText'
  | 'rawLayoutText'
  | 'rawJson'
  | 'rawCsv'
  | 'structuredData'
  | 'documentDigest'
  | 'rawCandidateRows'
  | 'candidateRows'
  | 'routeDecision'
  | 'rowDecisions'
  | 'originalNormalizedRows'
  | 'repairedNormalizedRows'
  | 'normalizedRows'
  | 'repairStatus'
  | 'repairProvider'
  | 'repairModel'
  | 'repairRawResponse'
  | 'repairError'
  | 'repairNotes'
  | 'repairMetrics'
  | 'extractionProvider'
  | 'extractionModel'
  | 'extractionRawResponse'
  | 'extractionError'
  | 'projectRecords'
  | 'reviewItems'
  | 'tableArtifacts'
  | 'tableResults'
  | 'documentType'
  | 'ingestionPath'
  | 'classificationConfidence'
  | 'error'
> {
  const ingestion = createEmptyIngestionStageArtifacts();
  const extraction = createEmptyProjectExtractionArtifacts();
  const repair = createEmptyRepairStageArtifacts();
  const tables = createEmptyTableStageArtifacts();

  return {
    ...ingestion,
    structuredData: null,
    documentDigest: extraction.documentDigest,
    rawCandidateRows: extraction.rawCandidateRows,
    candidateRows: extraction.candidateRows,
    routeDecision: extraction.routeDecision,
    rowDecisions: extraction.rowDecisions,
    originalNormalizedRows: repair.originalNormalizedRows,
    repairedNormalizedRows: repair.repairedNormalizedRows,
    normalizedRows: repair.normalizedRows,
    repairStatus: repair.repairStatus,
    repairProvider: repair.repairProvider,
    repairModel: repair.repairModel,
    repairRawResponse: repair.repairRawResponse,
    repairError: repair.repairError,
    repairNotes: repair.repairNotes,
    repairMetrics: repair.repairMetrics,
    extractionProvider: extraction.provider,
    extractionModel: extraction.model,
    extractionRawResponse: extraction.rawResponse,
    extractionError: extraction.error,
    projectRecords: extraction.projects,
    reviewItems: extraction.reviewItems,
    ...tables,
  };
}

export function buildDocumentDigestFromStructuredPolicy(policy: StructuredPolicy): DocumentDigest {
  return {
    title: policy.title,
    municipality: policy.municipality,
    overview: policy.summary,
    category: policy.category,
  };
}

export function resolveWorkspaceDocumentDigest(
  document: Pick<WorkspaceDocument, 'documentDigest' | 'structuredData'>
): DocumentDigest | null {
  if (document.documentDigest) {
    return document.documentDigest;
  }

  if (!document.structuredData) {
    return null;
  }

  return buildDocumentDigestFromStructuredPolicy(document.structuredData);
}

export function toProjectExtractionArtifacts(result: ProjectExtractionResult): ProjectExtractionArtifacts {
  return {
    documentDigest: result.documentDigest || null,
    candidateBundle: result.candidateBundle || null,
    rawCandidateRows: result.rawCandidateRows || [],
    candidateRows: result.candidateRows || [],
    routeDecision: result.routeDecision || null,
    rowDecisions: result.rowDecisions || [],
    normalizedRows: result.normalizedRows || [],
    projectRowsCsv: result.projectRowsCsv || null,
    projects: result.projects || [],
    reviewItems: result.reviewItems || [],
    provider: result.provider,
    model: result.model,
    rawResponse: result.rawResponse || null,
    error: result.error || null,
  };
}

export function toProjectExtractionResult(artifacts: ProjectExtractionArtifacts): ProjectExtractionResult {
  return {
    success: true,
    documentDigest: artifacts.documentDigest || undefined,
    candidateBundle: artifacts.candidateBundle || undefined,
    rawCandidateRows: artifacts.rawCandidateRows,
    candidateRows: artifacts.candidateRows,
    routeDecision: artifacts.routeDecision || undefined,
    rowDecisions: artifacts.rowDecisions,
    normalizedRows: artifacts.normalizedRows,
    projectRowsCsv: artifacts.projectRowsCsv || undefined,
    projects: artifacts.projects,
    reviewItems: artifacts.reviewItems,
    provider: artifacts.provider,
    model: artifacts.model,
    rawResponse: artifacts.rawResponse || undefined,
    error: artifacts.error || undefined,
  };
}

export function createGeneratedUIBuildInput(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  sourceRegistry: GeneratedUIBuildInput['sourceRegistry'] = [],
  promptRequest?: GeneratedUIBuildInput['promptRequest']
): GeneratedUIBuildInput {
  return {
    documents,
    userProfile,
    sourceRegistry,
    promptRequest,
  };
}

type RouteDecisionSource = Pick<WorkspaceDocument, 'rawCsv' | 'tableResults' | 'candidateRows'>;

export function decideDocumentRoute(source: RouteDecisionSource): DocumentRouteDecision {
  const parsedTableCount = source.tableResults.filter((result) => result.status === 'parsed').length;
  const candidateRowCount = source.candidateRows.length;
  const projectCandidateRows = source.candidateRows.filter((row) => row.candidateKind === 'project');
  const viableCandidateRowCount = projectCandidateRows.filter(isViableProjectCandidateRow).length;
  const evidence = {
    rawCsvPresent: Boolean(source.rawCsv?.trim()),
    parsedTableCount,
    tableArtifactCount: source.tableResults.length,
    candidateRowCount,
    projectCandidateRowCount: projectCandidateRows.length,
    viableCandidateRowCount,
  };

  if (viableCandidateRowCount > 0) {
    return {
      route: 'table',
      reason: 'viable_candidate_rows',
      confidence:
        viableCandidateRowCount >= 2 || evidence.rawCsvPresent || parsedTableCount > 0 ? 'strong' : 'moderate',
      evidence,
    };
  }

  if (parsedTableCount > 0) {
    return {
      route: 'direct',
      reason: 'parsed_tables_without_viable_rows',
      confidence: evidence.rawCsvPresent ? 'weak' : 'moderate',
      evidence,
    };
  }

  if (evidence.rawCsvPresent) {
    return {
      route: 'direct',
      reason: 'raw_csv_without_viable_rows',
      confidence: 'weak',
      evidence,
    };
  }

  return {
    route: 'direct',
    reason: 'no_tabular_evidence',
    confidence: 'strong',
    evidence,
  };
}

export function toUIGenerationResult(output: GeneratedUIBuildOutput): UIGenerationResult {
  return {
    success: true,
    ui: output.ui,
    provider: output.provider,
    model: output.model,
    error: output.error,
  };
}

export function serializeNormalizedProjectRowForRepair(row: NormalizedProjectRow): RepairRowPayload {
  return {
    source_reference: row.sourceReference,
    section_path: row.sectionPath,
    municipality: row.municipality,
    project_number: row.projectNumber,
    project_name: row.projectName,
    project_summary: row.projectSummary,
    department: row.department,
    budget: row.budget,
    fiscal_year: row.fiscalYear,
    status: row.status,
    activity_indicator_name: row.activityIndicatorName,
    activity_indicator_unit: row.activityIndicatorUnit,
    activity_planned_value: row.activityPlannedValue,
    activity_actual_value: row.activityActualValue,
    outcome_indicator_name: row.outcomeIndicatorName,
    outcome_indicator_unit: row.outcomeIndicatorUnit,
    outcome_target_value: row.outcomeTargetValue,
    outcome_actual_value: row.outcomeActualValue,
    achievement: row.achievement,
    confidence: row.confidence,
    review_flags: row.reviewFlags,
  };
}

export function deserializeRepairNormalizedRows(rows: RepairResponse['normalized_rows']): NormalizedProjectRow[] {
  return (rows || [])
    .map((row) => ({
      sourceReference: normalizeRequiredString(row.source_reference),
      sectionPath: Array.isArray(row.section_path) ? row.section_path.filter(isNonEmptyString) : [],
      municipality: normalizeOptionalString(row.municipality),
      projectNumber: normalizeOptionalString(row.project_number),
      projectName: normalizeRequiredString(row.project_name),
      projectSummary: normalizeRequiredString(row.project_summary),
      department: normalizeOptionalString(row.department),
      budget: normalizeOptionalString(row.budget),
      fiscalYear: normalizeOptionalString(row.fiscal_year),
      status: normalizeOptionalString(row.status),
      activityIndicatorName: normalizeOptionalString(row.activity_indicator_name),
      activityIndicatorUnit: normalizeOptionalString(row.activity_indicator_unit),
      activityPlannedValue: normalizeOptionalString(row.activity_planned_value),
      activityActualValue: normalizeOptionalString(row.activity_actual_value),
      outcomeIndicatorName: normalizeOptionalString(row.outcome_indicator_name),
      outcomeIndicatorUnit: normalizeOptionalString(row.outcome_indicator_unit),
      outcomeTargetValue: normalizeOptionalString(row.outcome_target_value),
      outcomeActualValue: normalizeOptionalString(row.outcome_actual_value),
      achievement: normalizeOptionalString(row.achievement),
      confidence: Number.isFinite(row.confidence) ? row.confidence : 0.6,
      reviewFlags: Array.isArray(row.review_flags) ? row.review_flags.filter(isNonEmptyString) : [],
    }))
    .filter((row) => Boolean(row.sourceReference && row.projectName && row.projectSummary));
}

export function buildRepairDocumentPayload(
  document: WorkspaceDocument,
  baselineRows: NormalizedProjectRow[],
  geminiApiKey?: string
): RepairDocumentPayload {
  return {
    document_id: document.id,
    document_name: document.name,
    municipality_hint: document.collectionSource.municipality,
    title_hint: document.documentDigest?.title || document.structuredData?.title || document.name,
    overview_hint: document.documentDigest?.overview || document.structuredData?.summary || undefined,
    raw_csv: document.rawCsv || undefined,
    extraction_raw_response: document.extractionRawResponse || undefined,
    candidate_rows: document.candidateRows,
    row_decisions: document.rowDecisions,
    normalized_rows: baselineRows.map(serializeNormalizedProjectRowForRepair),
    review_items: document.reviewItems,
    gemini_api_key: normalizeOptionalString(geminiApiKey),
  };
}

export function toRepairResult(response: RepairResponse, normalizedRows: NormalizedProjectRow[]): RepairResult {
  return {
    success: response.success,
    provider: response.provider,
    model: response.model,
    normalizedRows,
    notes: response.notes || [],
    rawResponse: response.raw_response || null,
    error: response.error || null,
  };
}

function normalizeRequiredString(value: string | undefined): string {
  return normalizeOptionalString(value) || '';
}

function isViableProjectCandidateRow(row: ProjectCandidateRow): boolean {
  if (row.candidateKind !== 'project') {
    return false;
  }

  const projectName = normalizeOptionalString(row.projectNameCandidate);
  const projectSummary = normalizeOptionalString(row.projectSummaryCandidate);
  if (!projectName || !projectSummary || projectSummary.length < 6) {
    return false;
  }

  const supportingSignalCount = [
    row.projectNumber,
    row.activityIndicatorName,
    row.department,
    row.budget,
    row.status,
  ].filter((value) => Boolean(normalizeOptionalString(value))).length;

  return row.confidence >= 0.7 || supportingSignalCount >= 2 || Object.keys(row.rowFields).length >= 4;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
