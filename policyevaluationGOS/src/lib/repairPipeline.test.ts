import { describe, expect, it } from 'vitest';

import { adoptRepairedRows, repairPipelineInternals } from '@/lib/repairPipeline';
import { deriveProjectRowsCsv } from '@/lib/projectExtractor';
import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type { NormalizedProjectRow } from '@/types';

function createRow(overrides: Partial<NormalizedProjectRow> = {}): NormalizedProjectRow {
  return {
    sourceReference: 'page-1-table-1:row-1',
    sectionPath: ['Ⅰ 基本施策'],
    municipality: '奥州市',
    projectNumber: undefined,
    projectName: '市民活動事業',
    projectSummary: '元の説明',
    department: '協働まちづくり部',
    budget: '100',
    fiscalYear: '令和7年度',
    status: '',
    activityIndicatorName: '会議開催件数',
    activityIndicatorUnit: '件',
    activityPlannedValue: '4',
    activityActualValue: '5',
    outcomeIndicatorName: undefined,
    outcomeIndicatorUnit: undefined,
    outcomeTargetValue: undefined,
    outcomeActualValue: undefined,
    achievement: undefined,
    confidence: 0.6,
    reviewFlags: ['事業番号未抽出'],
    ...overrides,
  };
}

describe('repairPipelineInternals.mergeNormalizedRows', () => {
  it('overlays repaired values and preserves missing rows from baseline', () => {
    const originalRows = [
      createRow(),
      createRow({
        sourceReference: 'page-1-table-1:row-2',
        projectName: '地方創生包括連携推進事業',
      }),
    ];
    const repairedRows = [
      createRow({
        projectSummary: '修復済み説明',
        reviewFlags: [],
      }),
    ];

    const merged = repairPipelineInternals.mergeNormalizedRows(originalRows, repairedRows);

    expect(merged).toHaveLength(2);
    expect(merged[0].projectSummary).toBe('修復済み説明');
    expect(merged[0].reviewFlags).toEqual([]);
    expect(merged[1].projectName).toBe('地方創生包括連携推進事業');
    expect(merged[1].reviewFlags).toEqual(['事業番号未抽出']);
  });
});

describe('repairPipelineInternals.shouldAdoptRepair', () => {
  it('adopts repaired rows when merged rows clear review flags without dropping baseline rows', () => {
    const originalRows = [
      createRow(),
      createRow({
        sourceReference: 'page-1-table-1:row-2',
        projectName: '地方創生包括連携推進事業',
      }),
    ];
    const repairedRows = repairPipelineInternals.mergeNormalizedRows(originalRows, [
      createRow({
        reviewFlags: [],
      }),
    ]);

    expect(repairPipelineInternals.shouldAdoptRepair(originalRows, repairedRows)).toBe(true);
  });

  it('keeps the baseline when a repair introduces section-like names and worse scores', () => {
    const originalRows = [
      createRow({
        projectNumber: '1-1',
        reviewFlags: [],
        confidence: 0.84,
      }),
    ];
    const repairedRows = repairPipelineInternals.mergeNormalizedRows(originalRows, [
      createRow({
        projectNumber: undefined,
        projectName: '① 協働の推進',
        activityIndicatorName: undefined,
        reviewFlags: ['section_like_name'],
        confidence: 0.84,
      }),
    ]);

    expect(repairPipelineInternals.shouldAdoptRepair(originalRows, repairedRows)).toBe(false);
  });

  it('adopts repaired rows into project records, csv output, and repair review items', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['pdf'], 'repair.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '奥州市';
    document.projectRecords = [
      {
        id: 'project-1',
        sourceDocumentId: document.id,
        projectName: '市民活動事業',
        projectSummary: '元の説明',
        sourceRefs: [
          {
            documentId: document.id,
            documentName: document.name,
            sourceReference: 'page-1-table-1:row-1',
          },
        ],
        indicators: [],
        confidence: 0.6,
        reviewFlags: ['事業番号未抽出'],
        publicationStatus: 'review',
        publicationNotes: [],
      },
    ];

    const adopted = adoptRepairedRows(
      document,
      {
        success: true,
        provider: 'opencode-repair',
        model: 'repair-model-v1',
        normalizedRows: [
          createRow({
            projectNumber: '1-1',
            projectSummary: '修復後の説明',
            reviewFlags: ['自治体名不一致'],
            confidence: 0.83,
          }),
        ],
        notes: ['note'],
        rawResponse: null,
        error: null,
      },
      [
        createRow({
          projectNumber: '1-1',
          projectSummary: '修復後の説明',
          reviewFlags: ['自治体名不一致'],
          confidence: 0.83,
        }),
      ]
    );

    expect({
      repairedNormalizedRows: adopted.repairedNormalizedRows,
      normalizedRows: adopted.normalizedRows,
      derivedProjectRowsCsvLines: deriveProjectRowsCsv(adopted)?.split('\n'),
      hasStoredProjectRowsCsv: Object.prototype.hasOwnProperty.call(adopted, 'projectRowsCsv'),
      projectRecords: adopted.projectRecords.map((project) => ({
        projectNumber: project.projectNumber,
        projectSummary: project.projectSummary,
        publicationStatus: project.publicationStatus,
        reviewFlags: project.reviewFlags,
      })),
      reviewItems: adopted.reviewItems.map((item) => ({
        severity: item.severity,
        reason: item.reason,
        suggestedAction: item.suggestedAction,
      })),
    }).toMatchInlineSnapshot(`
      {
        "derivedProjectRowsCsvLines": [
          "source_reference,section_path,municipality,project_number,project_name,project_summary,department,budget,fiscal_year,status,activity_indicator_name,activity_indicator_unit,activity_planned_value,activity_actual_value,outcome_indicator_name,outcome_indicator_unit,outcome_target_value,outcome_actual_value,achievement,confidence,review_flags",
          "page-1-table-1:row-1,Ⅰ 基本施策,奥州市,1-1,市民活動事業,修復後の説明,協働まちづくり部,100,令和7年度,,会議開催件数,件,4,5,,,,,,0.83,自治体名不一致",
        ],
        "hasStoredProjectRowsCsv": false,
        "normalizedRows": [
          {
            "achievement": undefined,
            "activityActualValue": "5",
            "activityIndicatorName": "会議開催件数",
            "activityIndicatorUnit": "件",
            "activityPlannedValue": "4",
            "budget": "100",
            "confidence": 0.83,
            "department": "協働まちづくり部",
            "fiscalYear": "令和7年度",
            "municipality": "奥州市",
            "outcomeActualValue": undefined,
            "outcomeIndicatorName": undefined,
            "outcomeIndicatorUnit": undefined,
            "outcomeTargetValue": undefined,
            "projectName": "市民活動事業",
            "projectNumber": "1-1",
            "projectSummary": "修復後の説明",
            "reviewFlags": [
              "自治体名不一致",
            ],
            "sectionPath": [
              "Ⅰ 基本施策",
            ],
            "sourceReference": "page-1-table-1:row-1",
            "status": "",
          },
        ],
        "projectRecords": [
          {
            "projectNumber": "1-1",
            "projectSummary": "修復後の説明",
            "publicationStatus": "review",
            "reviewFlags": [
              "自治体名不一致",
            ],
          },
        ],
        "repairedNormalizedRows": [
          {
            "achievement": undefined,
            "activityActualValue": "5",
            "activityIndicatorName": "会議開催件数",
            "activityIndicatorUnit": "件",
            "activityPlannedValue": "4",
            "budget": "100",
            "confidence": 0.83,
            "department": "協働まちづくり部",
            "fiscalYear": "令和7年度",
            "municipality": "奥州市",
            "outcomeActualValue": undefined,
            "outcomeIndicatorName": undefined,
            "outcomeIndicatorUnit": undefined,
            "outcomeTargetValue": undefined,
            "projectName": "市民活動事業",
            "projectNumber": "1-1",
            "projectSummary": "修復後の説明",
            "reviewFlags": [
              "自治体名不一致",
            ],
            "sectionPath": [
              "Ⅰ 基本施策",
            ],
            "sourceReference": "page-1-table-1:row-1",
            "status": "",
          },
        ],
        "reviewItems": [
          {
            "reason": "自治体名不一致",
            "severity": "medium",
            "suggestedAction": "opencode-repair 修復結果を確認してください",
          },
        ],
      }
    `);
  });
});
