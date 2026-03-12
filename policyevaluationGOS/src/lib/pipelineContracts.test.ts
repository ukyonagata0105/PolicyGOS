import { describe, expect, it } from 'vitest';

import {
  buildRepairDocumentPayload,
  decideDocumentRoute,
  createEmptyWorkspacePipelineState,
  createGeneratedUIBuildInput,
  deserializeRepairNormalizedRows,
  resolveWorkspaceDocumentDigest,
  toProjectExtractionArtifacts,
  toUIGenerationResult,
} from '@/lib/pipelineContracts';
import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type { ProjectExtractionResult } from '@/types';

describe('pipelineContracts', () => {
  it('creates stable empty workspace pipeline defaults', () => {
    expect(createEmptyWorkspacePipelineState()).toMatchInlineSnapshot(`
      {
        "candidateRows": [],
        "classificationConfidence": undefined,
        "documentDigest": null,
        "documentType": undefined,
        "error": null,
        "extractionError": null,
        "extractionModel": undefined,
        "extractionProvider": undefined,
        "extractionRawResponse": null,
        "ingestionPath": undefined,
        "normalizedRows": [],
        "ocrText": null,
        "originalNormalizedRows": [],
        "projectRecords": [],
        "rawCandidateRows": [],
        "rawCsv": null,
        "rawJson": null,
        "rawLayoutText": null,
        "repairError": null,
        "repairMetrics": null,
        "repairModel": undefined,
        "repairNotes": [],
        "repairProvider": undefined,
        "repairRawResponse": null,
        "repairStatus": "idle",
        "repairedNormalizedRows": [],
        "reviewItems": [],
        "routeDecision": null,
        "rowDecisions": [],
        "structuredData": null,
        "structuringText": null,
        "tableArtifacts": [],
        "tableResults": [],
      }
    `);
  });

  it('adapts repair payloads and repair rows at the contract boundary', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'contract.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '奥州市';
    document.structuredData = {
      title: '令和7年度行政評価',
      municipality: '奥州市',
      summary: '行政評価一覧です。',
      keyPoints: [],
      category: 'other',
    };
    document.candidateRows = [
      {
        id: 'candidate-1',
        sourceDocumentId: document.id,
        extractorStrategy: 'row-segmented',
        sourceReference: 'page-1-table-1:row-2',
        sectionPath: ['Ⅰ みんなで創る'],
        projectNumber: '1-1',
        projectNameCandidate: '市民活動事業',
        projectSummaryCandidate: '市民参画手続手法の適正化のための事業',
        rowFields: { 事業名: '市民活動事業' },
        confidence: 0.82,
        candidateKind: 'project',
      },
    ];
    document.rowDecisions = [
      {
        sourceReference: 'page-1-table-1:row-2',
        decision: 'project',
        sectionPath: ['Ⅰ みんなで創る'],
        projectName: '市民活動事業',
        projectSummary: '市民参画手続手法の適正化のための事業',
        supportingFields: ['事業名'],
        supportingTextSpans: ['市民活動事業'],
        decisionNotes: ['事業名列を採用'],
        qualityHints: [],
        confidence: 0.91,
        reviewFlags: [],
      },
    ];
    document.reviewItems = [
      {
        id: 'review-1',
        documentId: document.id,
        severity: 'medium',
        reason: '確認待ち',
        status: 'open',
      },
    ];

    const baselineRows = [
      {
        sourceReference: 'page-1-table-1:row-2',
        sectionPath: ['Ⅰ みんなで創る'],
        municipality: '奥州市',
        projectNumber: '1-1',
        projectName: '市民活動事業',
        projectSummary: '市民参画手続手法の適正化のための事業',
        confidence: 0.82,
        reviewFlags: ['成果指標未抽出'],
      },
    ];

    const payload = buildRepairDocumentPayload(document, baselineRows, 'gemini-key');
    const deserialized = deserializeRepairNormalizedRows([
      {
        source_reference: ' page-1-table-1:row-2 ',
        section_path: ['Ⅰ みんなで創る', ''],
        municipality: ' 奥州市 ',
        project_number: '1-1',
        project_name: ' 市民活動事業 ',
        project_summary: ' 市民参画手続手法の適正化のための事業 ',
        confidence: Number.NaN,
        review_flags: ['成果指標未抽出', ''],
      },
    ]);

    expect(payload).toMatchObject({
      document_id: document.id,
      candidate_rows: document.candidateRows,
      row_decisions: document.rowDecisions,
      review_items: document.reviewItems,
      gemini_api_key: 'gemini-key',
    });
    expect(payload.normalized_rows[0]).toMatchObject({
      source_reference: 'page-1-table-1:row-2',
      project_name: '市民活動事業',
      review_flags: ['成果指標未抽出'],
    });
    expect(deserialized).toEqual([
      {
        sourceReference: 'page-1-table-1:row-2',
        sectionPath: ['Ⅰ みんなで創る'],
        municipality: '奥州市',
        projectNumber: '1-1',
        projectName: '市民活動事業',
        projectSummary: '市民参画手続手法の適正化のための事業',
        department: undefined,
        budget: undefined,
        fiscalYear: undefined,
        status: undefined,
        activityIndicatorName: undefined,
        activityIndicatorUnit: undefined,
        activityPlannedValue: undefined,
        activityActualValue: undefined,
        outcomeIndicatorName: undefined,
        outcomeIndicatorUnit: undefined,
        outcomeTargetValue: undefined,
        outcomeActualValue: undefined,
        achievement: undefined,
        confidence: 0.6,
        reviewFlags: ['成果指標未抽出'],
      },
    ]);
  });

  it('normalizes extraction and generated-ui contracts through explicit adapters', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['pdf'], 'ui-contract.pdf', { type: 'application/pdf' }))
    );
    document.structuredData = {
      title: '政策評価',
      municipality: '花巻市',
      summary: '要約',
      keyPoints: [],
      category: 'other',
    };

    const extraction = toProjectExtractionArtifacts({
      success: true,
      projects: [],
    } satisfies ProjectExtractionResult);
    const input = createGeneratedUIBuildInput([document], {
      audience: 'staff',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    });
    const generation = toUIGenerationResult({
      ui: {
        id: 'ui-1',
        title: '政策評価',
        summary: '1件の文書を再編成しました。',
        schema: {
          layout: {
            density: 'comfortable',
            emphasis: 'summary',
            heroStyle: 'dashboard',
          },
          sections: [],
        },
        timestamp: '2026-03-11T00:00:00.000Z',
        provider: 'canonical-store',
        model: 'canonical-briefing-v1',
      },
      provider: 'canonical-store',
      model: 'canonical-briefing-v1',
    });

    expect(extraction).toEqual({
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
    });
    expect(resolveWorkspaceDocumentDigest(document)).toEqual({
      title: '政策評価',
      municipality: '花巻市',
      overview: '要約',
      category: 'other',
    });
    expect(input.sourceRegistry).toEqual([]);
    expect(input.documents[0]?.routeDecision).toBeNull();
    expect(generation).toMatchObject({
      success: true,
      provider: 'canonical-store',
      model: 'canonical-briefing-v1',
      ui: {
        id: 'ui-1',
        title: '政策評価',
      },
    });
  });

  it('routes clear tabular documents to the table path when viable candidate rows exist', () => {
    const decision = decideDocumentRoute({
      rawCsv: '番号,事業名,概要\n1-1,地域交通再編事業,交通網を再編する',
      tableResults: [
        {
          status: 'parsed',
          table: {
            id: 'table-1',
            artifactId: 'artifact-1',
            parserId: 'backend_csv_passthrough',
            headers: ['番号', '事業名', '概要'],
            rows: [['1-1', '地域交通再編事業', '交通網を再編する']],
            csv: '番号,事業名,概要',
            json: [{ 番号: '1-1', 事業名: '地域交通再編事業', 概要: '交通網を再編する' }],
            issues: [],
          },
          decision: {
            parserId: 'backend_csv_passthrough',
            confidence: 0.9,
            fallbackParserIds: ['no_parse'],
            provider: 'test',
            model: 'test',
          },
        },
      ],
      candidateRows: [
        {
          id: 'candidate-1',
          sourceDocumentId: 'doc-1',
          extractorStrategy: 'row-segmented',
          sourceReference: 'page-1-table-1:row-1',
          sectionPath: [],
          projectNumber: '1-1',
          projectNameCandidate: '地域交通再編事業',
          projectSummaryCandidate: '交通網を再編する事業です。',
          department: '都市政策課',
          rowFields: { 番号: '1-1', 事業名: '地域交通再編事業', 概要: '交通網を再編する事業です。', 担当: '都市政策課' },
          confidence: 0.82,
          candidateKind: 'project',
        },
      ],
    });

    expect(decision).toEqual({
      route: 'table',
      reason: 'viable_candidate_rows',
      confidence: 'strong',
      evidence: {
        rawCsvPresent: true,
        parsedTableCount: 1,
        tableArtifactCount: 1,
        candidateRowCount: 1,
        projectCandidateRowCount: 1,
        viableCandidateRowCount: 1,
      },
    });
  });

  it('routes clear non-tabular documents to the direct path when only weak table signals exist', () => {
    const decision = decideDocumentRoute({
      rawCsv: null,
      tableResults: [
        {
          status: 'parsed',
          table: {
            id: 'table-1',
            artifactId: 'artifact-1',
            parserId: 'key_value_rows',
            headers: ['項目', '値'],
            rows: [['計画名', '地域交通再編計画'], ['概要', '住民移動の利便性を改善する']],
            csv: '項目,値',
            json: [{ 項目: '計画名', 値: '地域交通再編計画' }],
            issues: [],
          },
          decision: {
            parserId: 'key_value_rows',
            confidence: 0.8,
            fallbackParserIds: ['no_parse'],
            provider: 'test',
            model: 'test',
          },
        },
      ],
      candidateRows: [
        {
          id: 'candidate-1',
          sourceDocumentId: 'doc-1',
          extractorStrategy: 'row-segmented',
          sourceReference: 'page-1-table-1:row-1',
          sectionPath: [],
          projectNameCandidate: '概要',
          projectSummaryCandidate: '短文',
          rowFields: { 項目: '概要', 値: '住民移動の利便性を改善する' },
          confidence: 0.45,
          candidateKind: 'project',
        },
      ],
    });

    expect(decision.route).toBe('direct');
    expect(decision.reason).toBe('parsed_tables_without_viable_rows');
    expect(decision.confidence).toBe('moderate');
    expect(decision.evidence.viableCandidateRowCount).toBe(0);
  });

  it('routes ambiguous csv-backed documents to the direct path with weak confidence', () => {
    const decision = decideDocumentRoute({
      rawCsv: '項目,値\n計画名,地域交通再編計画',
      tableResults: [],
      candidateRows: [
        {
          id: 'candidate-1',
          sourceDocumentId: 'doc-1',
          extractorStrategy: 'row-segmented',
          sourceReference: 'csv-1:row-1',
          sectionPath: [],
          projectNameCandidate: '計画名',
          projectSummaryCandidate: '短文',
          rowFields: { 項目: '計画名', 値: '地域交通再編計画' },
          confidence: 0.4,
          candidateKind: 'project',
        },
      ],
    });

    expect(decision).toMatchObject({
      route: 'direct',
      reason: 'raw_csv_without_viable_rows',
      confidence: 'weak',
    });
    expect(decision.evidence.rawCsvPresent).toBe(true);
    expect(decision.evidence.viableCandidateRowCount).toBe(0);
  });

  it('routes zero-table prose documents to the direct path with strong confidence', () => {
    const decision = decideDocumentRoute({
      rawCsv: null,
      tableResults: [],
      candidateRows: [],
    });

    expect(decision).toEqual({
      route: 'direct',
      reason: 'no_tabular_evidence',
      confidence: 'strong',
      evidence: {
        rawCsvPresent: false,
        parsedTableCount: 0,
        tableArtifactCount: 0,
        candidateRowCount: 0,
        projectCandidateRowCount: 0,
        viableCandidateRowCount: 0,
      },
    });
  });
});
