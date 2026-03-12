import { describe, expect, it } from 'vitest';

import { createInitialWorkspaceState } from '@/lib/workspacePipelineController';
import {
  selectPreferredWorkspaceDocument,
  selectWorkspaceDocumentReviewDebug,
  selectWorkspacePresentationState,
} from '@/lib/workspaceStateAdapters';
import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';

function createDocument(name: string) {
  return createWorkspaceDocument(
    createPdfFile(new File([name], name, { type: 'application/pdf' }))
  );
}

describe('workspaceStateAdapters', () => {
  it('splits a document into display, pipeline, and review/debug slices', () => {
    const document = createDocument('policy.pdf');

    document.collectionSource.municipality = '花巻市';
    document.processing = {
      provider: 'gemini',
      status: 'completed',
      progress: 100,
      message: '処理完了',
    };
    document.structuredData = {
      title: '地域交通政策',
      municipality: '花巻市',
      summary: '交通弱者向けの移動支援を整理する。',
      keyPoints: [],
      category: 'infrastructure',
    };
    document.documentDigest = {
      title: '地域交通政策',
      municipality: '花巻市',
      overview: '交通弱者向けの移動支援を整理する。',
      category: 'infrastructure',
    };
    document.rawCandidateRows = [
      {
        id: 'raw-project',
        sourceDocumentId: document.id,
        extractorStrategy: 'sheet',
        sourceReference: 'A-1',
        sectionPath: ['交通'],
        projectNameCandidate: '地域交通再編事業',
        projectSummaryCandidate: '交通導線を再構成する',
        rowFields: {},
        confidence: 0.84,
        candidateKind: 'project',
      },
    ];
    document.candidateRows = [
      document.rawCandidateRows[0]!,
      {
        id: 'section-row',
        sourceDocumentId: document.id,
        extractorStrategy: 'sheet',
        sourceReference: 'S-1',
        sectionPath: ['交通', '公共交通'],
        projectNameCandidate: '',
        projectSummaryCandidate: '',
        rowFields: {},
        confidence: 0.52,
        candidateKind: 'section',
      },
    ];
    document.rowDecisions = [
      {
        sourceReference: 'A-1',
        decision: 'project',
        sectionPath: ['交通'],
        projectName: '地域交通再編事業',
        projectSummary: '交通導線を再構成する',
        supportingFields: [],
        supportingTextSpans: [],
        decisionNotes: ['採用'],
        qualityHints: ['列整列済み'],
        confidence: 0.84,
        reviewFlags: [],
      },
    ];
    document.originalNormalizedRows = [
      {
        sourceReference: 'A-1',
        sectionPath: ['交通'],
        projectName: '地域交通再編事業',
        projectSummary: '交通導線を再構成する',
        confidence: 0.84,
        reviewFlags: [],
      },
    ];
    document.repairedNormalizedRows = [
      {
        sourceReference: 'A-1',
        sectionPath: ['交通'],
        projectName: '地域交通再編事業',
        projectSummary: '交通導線を再構成する',
        confidence: 0.9,
        reviewFlags: [],
      },
    ];
    document.normalizedRows = document.repairedNormalizedRows;
    document.reviewItems = [
      {
        id: 'review-1',
        documentId: document.id,
        severity: 'medium',
        reason: '列名ゆれ',
        status: 'open',
      },
    ];
    document.projectRecords = [
      {
        id: 'project-1',
        sourceDocumentId: document.id,
        projectName: '地域交通再編事業',
        projectSummary: '交通導線を再構成する',
        sourceRefs: [{ documentId: document.id, documentName: document.name, sourceReference: 'A-1' }],
        indicators: [
          {
            id: 'activity-1',
            projectId: 'project-1',
            indicatorType: 'activity',
            name: '路線再編数',
            sourceRefs: [],
          },
        ],
        confidence: 0.9,
        reviewFlags: ['列名ゆれ'],
        publicationStatus: 'review',
        publicationNotes: ['確認後に公開'],
      },
    ];
    document.tableResults = [
      {
        status: 'unparsed',
        table: {
          id: 'table-1',
          artifactId: 'artifact-1',
          parserId: 'no_parse',
          preview: 'preview',
          reason: 'layout only',
          issues: [],
        },
        decision: {
          parserId: 'no_parse',
          confidence: 0.45,
          fallbackParserIds: [],
          provider: 'heuristic',
          model: 'n/a',
        },
      },
    ];
    document.extractionProvider = 'gemini';
    document.extractionModel = 'gemini-2.5-pro';
    document.extractionRawResponse = '{"ok":true}';
    document.repairStatus = 'adopted';
    document.repairProvider = 'gemini';
    document.repairModel = 'gemini-2.5-pro';
    document.repairNotes = ['repair adopted'];

    const reviewDebug = selectWorkspaceDocumentReviewDebug(document);

    expect(reviewDebug).toMatchObject({
      display: {
        id: document.id,
        municipality: '花巻市',
        projectCount: 1,
        openReviewCount: 1,
        repairStatus: 'adopted',
      },
      debugSummary: {
        rawProjectCandidateCount: 1,
        candidateProjectCount: 1,
        normalizedRowCount: 1,
        repairedRowCount: 1,
        sectionCount: 1,
      },
      pipeline: {
        extraction: {
          candidateBundle: expect.objectContaining({
            documentId: document.id,
            candidateRows: expect.arrayContaining([
              expect.objectContaining({ id: 'raw-project' }),
            ]),
          }),
          provider: 'gemini',
          model: 'gemini-2.5-pro',
          rawCandidateRows: expect.arrayContaining([
            expect.objectContaining({ id: 'raw-project' }),
          ]),
          projectRowsCsv: expect.stringContaining('source_reference,section_path,municipality'),
        },
        repair: {
          repairProvider: 'gemini',
          repairNotes: ['repair adopted'],
        },
      },
    });
    expect(reviewDebug.projectRowsCsv).toContain('地域交通再編事業');
  });

  it('keeps the selected-document fallback and explorer adapters stable', () => {
    const empty = createDocument('empty.pdf');
    const populated = createDocument('policy.pdf');

    populated.collectionSource.municipality = '盛岡市';
    populated.structuredData = {
      title: '防災計画',
      municipality: '盛岡市',
      summary: '避難体制を更新する。',
      keyPoints: [{ text: '避難所訓練を増やす', importance: 'high' }],
      category: 'public-safety',
    };
    populated.documentDigest = {
      title: '防災計画',
      municipality: '盛岡市',
      overview: '避難体制を更新する。',
      category: 'public-safety',
    };
    populated.candidateRows = [
      {
        id: 'candidate-1',
        sourceDocumentId: populated.id,
        extractorStrategy: 'sheet',
        sourceReference: 'R-1',
        sectionPath: ['防災', '避難'],
        projectNameCandidate: '避難支援強化事業',
        projectSummaryCandidate: '避難体制を更新する',
        rowFields: {},
        confidence: 0.77,
        candidateKind: 'project',
      },
    ];
    populated.projectRecords = [
      {
        id: 'project-1',
        sourceDocumentId: populated.id,
        projectNumber: '1-1',
        projectName: '避難支援強化事業',
        projectSummary: '避難体制を更新する',
        sourceRefs: [{ documentId: populated.id, documentName: populated.name, sourceReference: 'R-1' }],
        indicators: [
          {
            id: 'activity-1',
            projectId: 'project-1',
            indicatorType: 'activity',
            name: '訓練回数',
            sourceRefs: [],
          },
          {
            id: 'outcome-1',
            projectId: 'project-1',
            indicatorType: 'outcome',
            name: '避難完了率',
            sourceRefs: [],
          },
        ],
        confidence: 0.77,
        reviewFlags: ['指標要確認'],
        publicationStatus: 'review',
        publicationNotes: ['確認後公開'],
      },
    ];
    populated.reviewItems = [
      {
        id: 'review-1',
        documentId: populated.id,
        severity: 'high',
        reason: '指標要確認',
        status: 'open',
      },
    ];

    const workspace = {
      ...createInitialWorkspaceState(),
      documents: [empty, populated],
    };

    expect(selectPreferredWorkspaceDocument(workspace.documents, 'missing-id')?.id).toBe(populated.id);

    expect(selectWorkspacePresentationState(workspace, null)).toMatchObject({
      workspaceSummary: {
        documentCount: 2,
        projectCount: 1,
        openReviewCount: 1,
      },
      documentCards: [
        expect.objectContaining({ id: empty.id, projectCount: 0 }),
        expect.objectContaining({ id: populated.id, municipality: '盛岡市', projectCount: 1 }),
      ],
      selectedDocument: {
        display: expect.objectContaining({ id: populated.id }),
      },
      projectExplorerItems: [
        expect.objectContaining({
          id: 'project-1',
          municipality: '盛岡市',
          sectionPath: ['防災', '避難'],
          activityIndicatorCount: 1,
          outcomeIndicatorCount: 1,
          confidencePercent: 77,
        }),
      ],
    });
  });
});
