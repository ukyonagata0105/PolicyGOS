import { getStoredGeminiApiKey } from '@/lib/appSettings';
import { getOCRBackendClient } from '@/lib/ocrBackendClient';
import {
  buildRepairDocumentPayload,
  deserializeRepairNormalizedRows,
  toRepairResult,
} from '@/lib/pipelineContracts';
import { projectExtractorInternals } from '@/lib/projectExtractor';
import type {
  IndicatorRecord,
  NormalizedProjectRow,
  RepairMetrics,
  RepairResult,
  ReviewItem,
  WorkspaceDocument,
} from '@/types';

function pickIndicator(projectId: string, indicators: IndicatorRecord[], indicatorType: 'activity' | 'outcome') {
  return indicators.find((indicator) => indicator.projectId === projectId && indicator.indicatorType === indicatorType);
}

function buildBaselineRowsFromProjects(document: WorkspaceDocument): NormalizedProjectRow[] {
  return document.projectRecords.map((project) => {
    const activity = pickIndicator(project.id, project.indicators, 'activity');
    const outcome = pickIndicator(project.id, project.indicators, 'outcome');
    return {
      sourceReference: project.sourceRefs[0]?.sourceReference || `${project.id}-baseline`,
      sectionPath: [],
      municipality: document.collectionSource.municipality,
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      projectSummary: project.projectSummary,
      department: project.department,
      budget: project.budget,
      fiscalYear: project.fiscalYear,
      status: project.status,
      activityIndicatorName: activity?.name,
      activityIndicatorUnit: activity?.unit,
      activityPlannedValue: activity?.plannedValue,
      activityActualValue: activity?.actualValue,
      outcomeIndicatorName: outcome?.name,
      outcomeIndicatorUnit: outcome?.unit,
      outcomeTargetValue: outcome?.targetValue,
      outcomeActualValue: outcome?.actualValue,
      achievement: outcome?.achievement,
      confidence: project.confidence,
      reviewFlags: project.reviewFlags,
    };
  });
}

function getRepairBaselineRows(document: WorkspaceDocument): NormalizedProjectRow[] {
  if (document.originalNormalizedRows.length > 0) {
    return document.originalNormalizedRows;
  }
  return buildBaselineRowsFromProjects(document);
}

function pickRepairedValue<T>(originalValue: T, repairedValue: T, isEmpty: (value: T) => boolean): T {
  return isEmpty(repairedValue) ? originalValue : repairedValue;
}

function isEmptyString(value: string | undefined) {
  return !value?.trim();
}

function isEmptyArray<T>(value: T[] | undefined) {
  return !value || value.length === 0;
}

function mergeRow(originalRow: NormalizedProjectRow, repairedRow?: NormalizedProjectRow): NormalizedProjectRow {
  if (!repairedRow) {
    return originalRow;
  }

  return {
    sourceReference: originalRow.sourceReference,
    sectionPath: pickRepairedValue(originalRow.sectionPath, repairedRow.sectionPath, isEmptyArray),
    municipality: pickRepairedValue(originalRow.municipality, repairedRow.municipality, isEmptyString),
    projectNumber: pickRepairedValue(originalRow.projectNumber, repairedRow.projectNumber, isEmptyString),
    projectName: pickRepairedValue(originalRow.projectName, repairedRow.projectName, isEmptyString),
    projectSummary: pickRepairedValue(originalRow.projectSummary, repairedRow.projectSummary, isEmptyString),
    department: pickRepairedValue(originalRow.department, repairedRow.department, isEmptyString),
    budget: pickRepairedValue(originalRow.budget, repairedRow.budget, isEmptyString),
    fiscalYear: pickRepairedValue(originalRow.fiscalYear, repairedRow.fiscalYear, isEmptyString),
    status: pickRepairedValue(originalRow.status, repairedRow.status, isEmptyString),
    activityIndicatorName: pickRepairedValue(
      originalRow.activityIndicatorName,
      repairedRow.activityIndicatorName,
      isEmptyString
    ),
    activityIndicatorUnit: pickRepairedValue(
      originalRow.activityIndicatorUnit,
      repairedRow.activityIndicatorUnit,
      isEmptyString
    ),
    activityPlannedValue: pickRepairedValue(
      originalRow.activityPlannedValue,
      repairedRow.activityPlannedValue,
      isEmptyString
    ),
    activityActualValue: pickRepairedValue(
      originalRow.activityActualValue,
      repairedRow.activityActualValue,
      isEmptyString
    ),
    outcomeIndicatorName: pickRepairedValue(
      originalRow.outcomeIndicatorName,
      repairedRow.outcomeIndicatorName,
      isEmptyString
    ),
    outcomeIndicatorUnit: pickRepairedValue(
      originalRow.outcomeIndicatorUnit,
      repairedRow.outcomeIndicatorUnit,
      isEmptyString
    ),
    outcomeTargetValue: pickRepairedValue(
      originalRow.outcomeTargetValue,
      repairedRow.outcomeTargetValue,
      isEmptyString
    ),
    outcomeActualValue: pickRepairedValue(
      originalRow.outcomeActualValue,
      repairedRow.outcomeActualValue,
      isEmptyString
    ),
    achievement: pickRepairedValue(originalRow.achievement, repairedRow.achievement, isEmptyString),
    confidence: Number.isFinite(repairedRow.confidence) ? repairedRow.confidence : originalRow.confidence,
    // When the repaired row is present, trust its remaining flags, including the explicit empty list case.
    reviewFlags: repairedRow.reviewFlags,
  };
}

function mergeNormalizedRows(
  originalRows: NormalizedProjectRow[],
  repairedRows: NormalizedProjectRow[]
): NormalizedProjectRow[] {
  const repairedBySource = new Map(repairedRows.map((row) => [row.sourceReference, row] as const));
  return originalRows.map((originalRow) => mergeRow(originalRow, repairedBySource.get(originalRow.sourceReference)));
}

function buildReviewItemsFromProjects(document: WorkspaceDocument, provider: string): ReviewItem[] {
  return document.projectRecords.flatMap((project) =>
    project.reviewFlags.map((flag, index) => ({
      id: `${project.id}-repair-review-${index + 1}`,
      documentId: document.id,
      projectId: project.id,
      severity: /未抽出|不一致/u.test(flag) ? 'medium' : 'low',
      reason: flag,
      suggestedAction: `${provider} 修復結果を確認してください`,
      status: 'open' as const,
    }))
  );
}

function computeRepairMetrics(
  originalRows: NormalizedProjectRow[],
  repairedRows: NormalizedProjectRow[],
  originalProjectCount: number,
  repairedProjectCount: number,
  adoptedProjectCount: number,
  adoptedRowCount: number
): RepairMetrics {
  const originalFlags = countFlags(originalRows);
  const repairedFlags = countFlags(repairedRows);
  const improvedFlags = Object.keys(originalFlags).filter(
    (flag) => (repairedFlags[flag] || 0) < (originalFlags[flag] || 0)
  );
  const worsenedFlags = Object.keys(repairedFlags).filter(
    (flag) => (repairedFlags[flag] || 0) > (originalFlags[flag] || 0)
  );

  return {
    originalNormalizedRowCount: originalRows.length,
    repairedNormalizedRowCount: repairedRows.length,
    adoptedNormalizedRowCount: adoptedRowCount,
    originalProjectCount,
    repairedProjectCount,
    adoptedProjectCount,
    improvedFlags,
    worsenedFlags,
  };
}

function countFlags(rows: NormalizedProjectRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((result, row) => {
    row.reviewFlags.forEach((flag) => {
      result[flag] = (result[flag] || 0) + 1;
    });
    return result;
  }, {});
}

function scoreRows(rows: NormalizedProjectRow[]): number {
  return rows.reduce((score, row) => {
    let next = score + 10;
    if (row.projectNumber) {
      next += 4;
    }
    if (row.activityIndicatorName) {
      next += 2;
    }
    if (row.outcomeIndicatorName) {
      next += 2;
    }
    if (!row.projectSummary.trim()) {
      next -= 6;
    }
    if (!row.activityIndicatorName && !row.outcomeIndicatorName) {
      next -= 6;
    }
    if (
      row.sectionPath.at(-1)?.trim() === row.projectName.trim() ||
      /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ➊➋➌➍➎①②③④⑤⑥⑦⑧⑨⑩]/u.test(row.projectName)
    ) {
      next -= 10;
    }
    next -= row.reviewFlags.length * 2;
    if (row.reviewFlags.some((flag) => /自治体名不一致|broken|section/u.test(flag))) {
      next -= 6;
    }
    return next;
  }, 0);
}

function shouldAdoptRepair(originalRows: NormalizedProjectRow[], repairedRows: NormalizedProjectRow[]): boolean {
  if (repairedRows.length === 0) {
    return false;
  }
  const originalScore = scoreRows(originalRows);
  const repairedScore = scoreRows(repairedRows);
  if (repairedScore > originalScore) {
    return true;
  }
  if (repairedScore < originalScore) {
    return false;
  }
  return Object.keys(countFlags(repairedRows)).length < Object.keys(countFlags(originalRows)).length;
}

export async function runRepairPipeline(document: WorkspaceDocument): Promise<{
  repair: RepairResult;
  adoptedRows: NormalizedProjectRow[];
  adopted: boolean;
  adoptedNotes: string[];
  adoptedMetrics: RepairMetrics;
}> {
  const baselineRows = getRepairBaselineRows(document);
  const client = getOCRBackendClient();
  const response = await client.repairExtractedRows(
    buildRepairDocumentPayload(document, baselineRows, getStoredGeminiApiKey() || undefined)
  );
  const rawRepairedRows = deserializeRepairNormalizedRows(response.normalized_rows);
  const repairedRows = mergeNormalizedRows(baselineRows, rawRepairedRows);
  const repair: RepairResult = toRepairResult(response, repairedRows);

  if (!response.success) {
    return {
      repair,
      adoptedRows: baselineRows,
      adopted: false,
      adoptedNotes: response.error ? [response.error] : [],
      adoptedMetrics: computeRepairMetrics(
        baselineRows,
        repairedRows,
        document.projectRecords.length,
        0,
        document.projectRecords.length,
        baselineRows.length
      ),
    };
  }

  const repairedProjects = projectExtractorInternals.buildProjectsFromNormalizedRows(document, repairedRows);
  const adopted = shouldAdoptRepair(baselineRows, repairedRows);
  const adoptedRows = adopted ? repairedRows : baselineRows;
  const adoptedProjectCount = adopted ? repairedProjects.length : document.projectRecords.length;

  return {
      repair,
      adoptedRows,
      adopted,
    adoptedNotes: adopted
      ? ['opencode 修復結果を採用しました']
      : ['修復結果は元の抽出結果を上回らなかったため採用しませんでした'],
    adoptedMetrics: computeRepairMetrics(
      baselineRows,
      repairedRows,
      document.projectRecords.length,
      repairedProjects.length,
      adoptedProjectCount,
      adoptedRows.length
    ),
  };
}

export const repairPipelineInternals = {
  mergeNormalizedRows,
  scoreRows,
  shouldAdoptRepair,
};

export function adoptRepairedRows(document: WorkspaceDocument, repair: RepairResult, adoptedRows: NormalizedProjectRow[]) {
  const adoptedProjects = projectExtractorInternals.buildProjectsFromNormalizedRows(document, adoptedRows);
  const nextDocument: WorkspaceDocument = {
    ...document,
    repairedNormalizedRows: repair.normalizedRows,
    normalizedRows: adoptedRows,
    projectRecords: adoptedProjects,
    reviewItems: buildReviewItemsFromProjects(
      {
        ...document,
        projectRecords: adoptedProjects,
      },
      repair.provider
    ),
  };

  return nextDocument;
}
