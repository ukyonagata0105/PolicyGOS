import { deriveCandidateBundle, deriveProjectRowsCsv } from '@/lib/projectExtractor';
import { resolveWorkspaceDocumentDigest } from '@/lib/pipelineContracts';
import { buildPolicyCorpus, buildWorkspaceSummary } from '@/lib/workspace';
import type {
  WorkspaceDocument,
  WorkspaceDocumentDebugSummary,
  WorkspaceDocumentDisplayState,
  WorkspaceDocumentPipelineSlices,
  WorkspaceDocumentReviewDebugState,
  WorkspacePresentationState,
  WorkspaceProjectExplorerItem,
  WorkspaceState,
} from '@/types';

export function selectWorkspaceDocumentPipeline(
  document: WorkspaceDocument
): WorkspaceDocumentPipelineSlices {
  const candidateBundle = deriveCandidateBundle(document);
  const projectRowsCsv = deriveProjectRowsCsv(document);

  return {
    ingestion: {
      ocrText: document.ocrText,
      structuringText: document.structuringText,
      rawLayoutText: document.rawLayoutText,
      rawJson: document.rawJson,
      rawCsv: document.rawCsv,
      documentType: document.documentType,
      ingestionPath: document.ingestionPath,
      classificationConfidence: document.classificationConfidence,
      error: document.error,
    },
    tables: {
      tableArtifacts: document.tableArtifacts,
      tableResults: document.tableResults,
    },
    extraction: {
      documentDigest: document.documentDigest,
      candidateBundle,
      rawCandidateRows: document.rawCandidateRows,
      candidateRows: document.candidateRows,
      routeDecision: document.routeDecision,
      rowDecisions: document.rowDecisions,
      normalizedRows: document.normalizedRows,
      projectRowsCsv,
      projects: document.projectRecords,
      reviewItems: document.reviewItems,
      provider: document.extractionProvider,
      model: document.extractionModel,
      rawResponse: document.extractionRawResponse,
      error: document.extractionError,
    },
    repair: {
      repairStatus: document.repairStatus,
      repairProvider: document.repairProvider,
      repairModel: document.repairModel,
      repairRawResponse: document.repairRawResponse,
      repairError: document.repairError,
      repairNotes: document.repairNotes,
      repairMetrics: document.repairMetrics,
      originalNormalizedRows: document.originalNormalizedRows,
      repairedNormalizedRows: document.repairedNormalizedRows,
      normalizedRows: document.normalizedRows,
    },
  };
}

export function selectWorkspaceDocumentDisplay(
  document: WorkspaceDocument
): WorkspaceDocumentDisplayState {
  const digest = resolveWorkspaceDocumentDigest(document);

  return {
    id: document.id,
    name: document.name,
    municipality: digest?.municipality || document.collectionSource.municipality || '未抽出',
    projectCount: document.projectRecords.length,
    openReviewCount: document.reviewItems.filter((item) => item.status === 'open').length,
    repairStatus: document.repairStatus,
    repairProvider: document.repairProvider,
    ingestionPath: document.ingestionPath,
    documentType: document.documentType,
    processing: document.processing,
    error: document.error,
  };
}

export function selectWorkspaceDocumentDebugSummary(
  document: WorkspaceDocument
): WorkspaceDocumentDebugSummary {
  return {
    rawProjectCandidateCount: document.rawCandidateRows.filter((row) => row.candidateKind === 'project').length,
    candidateProjectCount: document.candidateRows.filter((row) => row.candidateKind === 'project').length,
    normalizedRowCount: document.normalizedRows.length,
    repairedRowCount: document.repairedNormalizedRows.length,
    sectionCount: document.candidateRows.filter((row) => row.candidateKind === 'section').length,
  };
}

export function selectWorkspaceDocumentReviewDebug(
  document: WorkspaceDocument
): WorkspaceDocumentReviewDebugState {
  const pipeline = selectWorkspaceDocumentPipeline(document);

  return {
    display: selectWorkspaceDocumentDisplay(document),
    structuredData: document.structuredData,
    ocrText: document.ocrText,
    reviewItems: document.reviewItems,
    debugSummary: selectWorkspaceDocumentDebugSummary(document),
    projectRowsCsv: pipeline.extraction.projectRowsCsv,
    pipeline,
  };
}

export function selectPreferredWorkspaceDocument(
  documents: WorkspaceDocument[],
  selectedDocumentId: string | null
): WorkspaceDocument | null {
  return (
    documents.find((document) => document.id === selectedDocumentId) ||
    documents.find((document) => document.projectRecords.length > 0 || document.structuredData) ||
    documents[0] ||
    null
  );
}

export function selectWorkspaceProjectExplorerItems(
  workspace: WorkspaceState
): WorkspaceProjectExplorerItem[] {
  const corpus = buildPolicyCorpus(workspace.documents, workspace.sourceRegistry);
  const documentsById = new Map(workspace.documents.map((document) => [document.id, document]));

  return corpus.projects.map((project) => {
    const sourceDocument = documentsById.get(project.sourceDocumentId);
    const sourceReference = project.sourceRefs[0]?.sourceReference;
    const candidateRow = sourceDocument?.candidateRows.find((row) => row.sourceReference === sourceReference);

    return {
      id: project.id,
      sourceDocumentId: project.sourceDocumentId,
      sourceDocumentName: sourceDocument?.name || '未抽出',
      municipality:
        corpus.documents.find((document) => document.id === project.sourceDocumentId)?.municipality || '未抽出',
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      projectSummary: project.projectSummary,
      sectionPath: candidateRow?.sectionPath || [],
      activityIndicatorCount: project.indicators.filter((indicator) => indicator.indicatorType === 'activity').length,
      outcomeIndicatorCount: project.indicators.filter((indicator) => indicator.indicatorType === 'outcome').length,
      confidencePercent: Math.round(project.confidence * 100),
      publicationStatus: project.publicationStatus,
      reviewFlags: project.reviewFlags,
      publicationNotes: project.publicationNotes,
    };
  });
}

export function selectWorkspacePresentationState(
  workspace: WorkspaceState,
  selectedDocumentId: string | null
): WorkspacePresentationState {
  const hasSummaryContent = workspace.documents.some(
    (document) => document.projectRecords.length > 0 || document.structuredData
  );
  const selectedDocument = selectPreferredWorkspaceDocument(workspace.documents, selectedDocumentId);

  return {
    workspaceSummary: hasSummaryContent ? buildWorkspaceSummary(workspace.documents) : null,
    corpus: buildPolicyCorpus(workspace.documents, workspace.sourceRegistry),
    documentCards: workspace.documents.map(selectWorkspaceDocumentDisplay),
    selectedDocument: selectedDocument ? selectWorkspaceDocumentReviewDebug(selectedDocument) : null,
    projectExplorerItems: selectWorkspaceProjectExplorerItems(workspace),
  };
}
