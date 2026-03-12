import { describe, expect, it } from 'vitest';

import { projectExtractorInternals } from '@/lib/projectExtractor';
import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type { ProjectRecord } from '@/types';

describe('projectExtractor internals', () => {
  it('builds candidate rows from policy-evaluation style raw csv', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'iwate.pdf', { type: 'application/pdf' }))
    );
    document.rawCsv = [
      '番号,事業名,事業概要,活動内容指標名,活動内容指標単位,活動内容指標当初計画値,活動内容指標実績値,成果指標名,成果指標目標値,成果指標実績値',
      '1-7,被災地こころのケア対策事業,こころのケア体制を維持する,岩手県こころのケアセンター運営箇所,箇所,5,5,こころのケアケース検討数,364件,521件',
    ].join('\n');

    const rows = projectExtractorInternals.buildCandidateRows(document);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.projectNumber).toBe('1-7');
    expect(rows[0]?.projectNameCandidate).toBe('被災地こころのケア対策事業');
    expect(rows[0]?.rowFields['活動内容指標名']).toBe('岩手県こころのケアセンター運営箇所');
  });

  it('skips page markers and separates section rows from project rows', () => {
    const rawCsv = [
      '# Page 1 Table 1',
      '"大 綱","基 本 施 策","施 策","事業名","事業概要","活動指標","指標単位","R6 実績値","R6 目標値","担当部","担当課"',
      '"Ⅰ みんなで創る生きがいあふれるまちづくり","","","","","","","","","",""',
      '"","➊ 市民参画と協働によるまちづくりの推進","","","","","","","","",""',
      '"","","① 開かれた市政の推進","","","","","","","",""',
      '"","","","市民活動事業","市民参画手続手法の適正化のための事業","自治基本条例推進委員会開催件数","回","2","2","協働まちづくり部","地域づくり推進課"',
    ].join('\n');

    const rows = projectExtractorInternals.extractCandidatesFromRawCsv(rawCsv, 'oshu-doc');
    const sections = rows.filter((row) => row.candidateKind === 'section');
    const projects = rows.filter((row) => row.candidateKind === 'project');

    expect(sections).toHaveLength(3);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.projectNameCandidate).toBe('市民活動事業');
    expect(projects[0]?.sectionPath).toEqual([
      'Ⅰ みんなで創る生きがいあふれるまちづくり',
      '➊ 市民参画と協働によるまちづくりの推進',
      '① 開かれた市政の推進',
    ]);
  });

  it('merges continuation rows into the previous project row and drops note rows', () => {
    const rawCsv = [
      '# Page 1 Table 1',
      '"大 綱","基 本 施 策","施 策","事業名","事業概要","活動指標","指標単位","R6 実績値","R6 目標値","担当課"',
      '"Ⅰ みんなで創る","","","","","","","","",""',
      '"","","① 開かれた市政の推進","市民活動事業","市民参画手続手法の適正化のための事業","自治基本条例推進委員会開催件数","回","2","2","地域づくり推進課"',
      '"","","","","関係団体との対話機会を増やすため、周知と意見交換も実施した","","","","",""',
      '"","","","","※再掲事業","","","","",""',
    ].join('\n');

    const rawRows = projectExtractorInternals.extractCandidatesFromRawCsv(rawCsv, 'oshu-doc');
    const normalizedRows = projectExtractorInternals.normalizeCandidateRows(rawRows);
    const projects = normalizedRows.filter((row) => row.candidateKind === 'project');

    expect(rawRows.filter((row) => row.candidateKind === 'project')).toHaveLength(2);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.projectSummaryCandidate).toContain('市民参画手続手法の適正化のための事業');
    expect(projects[0]?.projectSummaryCandidate).toContain('関係団体との対話機会を増やすため');
    expect(projects[0]?.sourceReference).toContain('row-2');
    expect(projects[0]?.sourceReference).toContain('row-3');
  });

  it('builds candidate project_rows.csv from project candidates only', () => {
    const csv = projectExtractorInternals.buildCandidateProjectRowsCsv([
      {
        id: 'section-1',
        sourceDocumentId: 'doc-1',
        extractorStrategy: 'row-segmented',
        sourceReference: 'page-1-table-1:row-1',
        sectionPath: ['Ⅰ みんなで創る'],
        projectNameCandidate: 'Ⅰ みんなで創る',
        projectSummaryCandidate: '',
        rowFields: { '大 綱': 'Ⅰ みんなで創る' },
        confidence: 0.9,
        candidateKind: 'section',
      },
      {
        id: 'project-1',
        sourceDocumentId: 'doc-1',
        extractorStrategy: 'row-segmented',
        page: 1,
        tableId: 'page-1-table-1',
        rowNumber: 4,
        sourceReference: 'page-1-table-1:row-4',
        sectionPath: ['Ⅰ みんなで創る'],
        projectNumber: '1-1',
        projectNameCandidate: '市民活動事業',
        projectSummaryCandidate: '市民参画手続手法の適正化のための事業',
        activityIndicatorName: '自治基本条例推進委員会開催件数',
        indicatorUnit: '回',
        actualValue: '2',
        targetValue: '2',
        department: '協働まちづくり部',
        rowFields: {},
        confidence: 0.82,
        candidateKind: 'project',
      },
    ]);

    expect(csv).toContain('document_id,page,table_id,row_number,section_path');
    expect(csv).toContain('市民活動事業');
    expect(csv).not.toContain('section-1');
  });

  it('builds a Gemini normalization bundle with municipality hint and project candidates', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'oshu.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '奥州市';
    document.structuredData = {
      title: '令和7年度行政評価',
      municipality: '分析により市',
      summary: '行政評価一覧です。',
      keyPoints: [],
      category: 'other',
    };

    const candidateRows = projectExtractorInternals.extractCandidatesFromRawCsv(
      [
        '# Page 1 Table 1',
        '"大 綱","基 本 施 策","施 策","事業名","事業概要"',
        '"Ⅰ みんなで創る","","","",""',
        '"","","① 開かれた市政の推進","市民活動事業","市民参画手続手法の適正化のための事業"',
      ].join('\n'),
      document.id
    );

    const bundle = projectExtractorInternals.buildCandidateRowBundle(document, candidateRows);

    expect(bundle.municipalityHint).toBe('奥州市');
    expect(bundle.candidateRows).toHaveLength(1);
    expect(bundle.candidateRows[0]?.projectNameCandidate).toBe('市民活動事業');
    expect(bundle.fieldGlossary?.['事業名']).toBe('project_name');
    expect(bundle.neighborRows?.[0]?.sourceReference).toBe('page-1-table-1:row-2');
  });

  it('derives a candidate bundle with metadata even when candidate rows are empty', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'empty.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '奥州市';
    document.structuredData = {
      title: '令和7年度行政評価',
      municipality: '分析により市',
      summary: '候補行がなくてもデバッグ用メタデータは残す。',
      keyPoints: [],
      category: 'other',
    };
    document.rawCsv = ['番号,事業名', ''].join('\n');
    document.rawLayoutText = 'page 1 layout preview';
    document.candidateRows = [];

    const bundle = projectExtractorInternals.deriveCandidateBundle(document);

    expect(bundle).toMatchObject({
      documentId: document.id,
      documentName: 'empty.pdf',
      municipalityHint: '奥州市',
      titleHint: '令和7年度行政評価',
      overviewHint: '候補行がなくてもデバッグ用メタデータは残す。',
      candidateRows: [],
      fieldGlossary: {},
      neighborRows: [],
      rawCsvPreview: '番号,事業名\n',
      layoutPreview: 'page 1 layout preview',
    });
  });

  it('builds raw and normalized candidate rows separately for row-oriented csv', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'oshu.pdf', { type: 'application/pdf' }))
    );
    document.rawCsv = [
      '# Page 1 Table 1',
      '"大 綱","基 本 施 策","施 策","事業名","事業概要","活動指標","指標単位","R6 実績値","R6 目標値"',
      '"Ⅰ みんなで創る","","","","","","","",""',
      '"","","① 開かれた市政の推進","市民活動事業","市民参画手続手法の適正化のための事業","自治基本条例推進委員会開催件数","回","2","2"',
      '"","","","","関係団体との対話機会を増やすため、周知と意見交換も実施した","","","",""',
      '"","","","","※再掲事業","","","",""',
    ].join('\n');

    const rawRows = projectExtractorInternals.buildRawCandidateRows(document);
    const normalizedRows = projectExtractorInternals.buildCandidateRows(document);

    expect(rawRows.filter((row) => row.candidateKind === 'project')).toHaveLength(2);
    expect(normalizedRows.filter((row) => row.candidateKind === 'project')).toHaveLength(1);
  });

  it('builds normalized project_rows.csv from Gemini-normalized rows', () => {
    const csv = projectExtractorInternals.buildNormalizedProjectRowsCsv([
      {
        sourceReference: 'page-1-table-1:row-4',
        sectionPath: ['Ⅰ みんなで創る', '① 開かれた市政の推進'],
        municipality: '奥州市',
        projectNumber: '1-1',
        projectName: '市民活動事業',
        projectSummary: '市民参画手続手法の適正化のための事業',
        activityIndicatorName: '自治基本条例推進委員会開催件数',
        activityIndicatorUnit: '回',
        activityActualValue: '2',
        confidence: 0.88,
        reviewFlags: ['成果指標未抽出'],
      },
    ]);

    expect(csv).toContain('source_reference,section_path,municipality');
    expect(csv).toContain('奥州市');
    expect(csv).toContain('成果指標未抽出');
  });

  it('builds validated rows from Gemini row decisions', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'oshu.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '奥州市';

    const candidateRows = projectExtractorInternals.extractCandidatesFromRawCsv(
      [
        '# Page 1 Table 1',
        '"大 綱","基 本 施 策","施 策","事業名","事業概要","活動指標","指標単位","R6 実績値","R6 目標値"',
        '"Ⅰ みんなで創る","","","","","","","",""',
        '"","","① 開かれた市政の推進","市民活動事業","市民参画手続手法の適正化のための事業","自治基本条例推進委員会開催件数","回","2","2"',
      ].join('\n'),
      document.id
    ).filter((row) => row.candidateKind === 'project');

    const rowDecisions = projectExtractorInternals.normalizeRowDecisions([
      {
        source_reference: 'page-1-table-1:row-2',
        decision: 'project',
        section_path: ['Ⅰ みんなで創る', '① 開かれた市政の推進'],
        municipality: '奥州市',
        project_name: '市民活動事業',
        project_summary: '市民参画手続手法の適正化のための事業',
        activity_indicator_name: '自治基本条例推進委員会開催件数',
        activity_actual_value: '2',
        quality_hints: ['missing_number'],
        decision_notes: ['事業名列と概要列を採用'],
        supporting_fields: ['事業名', '事業概要', '活動指標'],
        confidence: 0.9,
      },
    ], '奥州市');

    const validatedRows = projectExtractorInternals.buildValidatedRowsFromDecisions(document, rowDecisions, candidateRows);

    expect(validatedRows).toHaveLength(1);
    expect(validatedRows[0]?.projectName).toBe('市民活動事業');
    expect(validatedRows[0]?.reviewFlags).toContain('missing_number');
    expect(validatedRows[0]?.activityActualValue).toBe('2');
  });

  it('builds activity and outcome indicators from row fields', () => {
    const indicators = projectExtractorInternals.buildIndicatorsFromRowFields(
      {
        活動内容指標名: '岩手県こころのケアセンター運営箇所',
        活動内容指標単位: '箇所',
        活動内容指標当初計画値: '5',
        活動内容指標実績値: '5',
        成果指標名: 'こころのケアケース検討数',
        成果指標目標値: '364件',
        成果指標実績値: '521件',
      },
      'project-1',
      {
        documentId: 'doc-1',
        documentName: 'iwate.pdf',
        sourceReference: 'csv-1:row-1',
      }
    );

    expect(indicators).toHaveLength(2);
    expect(indicators.find((indicator) => indicator.indicatorType === 'activity')?.name).toBe(
      '岩手県こころのケアセンター運営箇所'
    );
    expect(indicators.find((indicator) => indicator.indicatorType === 'outcome')?.actualValue).toBe('521件');
  });

  it('blocks broken records and demotes low-confidence records to review', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['pdf'], 'demo.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '岩手県';
    document.structuredData = {
      title: '政策評価',
      municipality: '分析により県',
      summary: 'summary',
      keyPoints: [],
      category: 'healthcare',
    };

    const blocked = projectExtractorInternals.applyProjectQualityGate(document, {
      id: 'project-1',
      sourceDocumentId: document.id,
      projectName: 'r1c1',
      projectSummary: 'こころのケア体制を維持する',
      sourceRefs: [],
      indicators: [],
      confidence: 0.5,
      reviewFlags: [],
      publicationStatus: 'review',
      publicationNotes: [],
    } satisfies ProjectRecord);

    const review = projectExtractorInternals.applyProjectQualityGate(document, {
      id: 'project-2',
      sourceDocumentId: document.id,
      projectNumber: '1-7',
      projectName: '被災地こころのケア対策事業',
      projectSummary: 'こころのケア体制を維持する',
      sourceRefs: [{ documentId: document.id, documentName: document.name, sourceReference: 'csv-1:row-1' }],
      indicators: [],
      confidence: 0.7,
      reviewFlags: ['指標未抽出'],
      publicationStatus: 'review',
      publicationNotes: [],
    } satisfies ProjectRecord);

    expect(blocked.publicationStatus).toBe('blocked');
    expect(blocked.reviewFlags).toContain('事業名要確認');
    expect(review.publicationStatus).toBe('review');
    expect(review.reviewFlags).toContain('自治体名不一致');
  });

  it('keeps the current transform behavior from candidate rows to publishable project records', () => {
    const document = createWorkspaceDocument(
      createPdfFile(new File(['csv'], 'oshu.pdf', { type: 'application/pdf' }))
    );
    document.collectionSource.municipality = '奥州市';
    document.structuredData = {
      title: '令和7年度行政評価',
      municipality: '別自治体',
      summary: '行政評価一覧です。',
      keyPoints: [],
      category: 'other',
    };

    const candidateRows = projectExtractorInternals.extractCandidatesFromRawCsv(
      [
        '# Page 1 Table 1',
        '"大 綱","基 本 施 策","施 策","事業名","事業概要","活動指標","指標単位","R6 実績値","R6 目標値","担当課","予算"',
        '"Ⅰ みんなで創る","","","","","","","","","",""',
        '"","","① 開かれた市政の推進","市民活動事業","市民参画手続手法の適正化のための事業","自治基本条例推進委員会開催件数","回","2","2","地域づくり推進課","1200万円"',
      ].join('\n'),
      document.id
    ).filter((row) => row.candidateKind === 'project');

    const decisions = projectExtractorInternals.normalizeRowDecisions(
      [
        {
          source_reference: 'page-1-table-1:row-2',
          decision: 'project',
          section_path: ['Ⅰ みんなで創る', '① 開かれた市政の推進'],
          municipality: '別自治体',
          project_name: '市民活動事業',
          project_summary: '市民参画手続手法の適正化のための事業',
          activity_indicator_name: '自治基本条例推進委員会開催件数',
          activity_indicator_unit: '回',
          activity_actual_value: '2',
          review_flags: ['指標未抽出'],
          quality_hints: ['missing_number'],
          confidence: 0.91,
        },
      ],
      '奥州市'
    );

    const validatedRows = projectExtractorInternals.buildValidatedRowsFromDecisions(document, decisions, candidateRows);
    const projects = projectExtractorInternals.buildProjectsFromNormalizedRows(document, validatedRows);

    expect({
      validatedRows,
      projects: projects.map((project) => ({
        projectNumber: project.projectNumber,
        projectName: project.projectName,
        municipalityMismatchFlag: project.reviewFlags.includes('自治体名不一致'),
        reviewFlags: project.reviewFlags,
        publicationStatus: project.publicationStatus,
        publicationNotes: project.publicationNotes,
        indicators: project.indicators.map((indicator) => ({
          indicatorType: indicator.indicatorType,
          name: indicator.name,
          unit: indicator.unit,
          actualValue: indicator.actualValue,
        })),
      })),
    }).toMatchInlineSnapshot(`
      {
        "projects": [
          {
            "indicators": [
              {
                "actualValue": "2",
                "indicatorType": "activity",
                "name": "自治基本条例推進委員会開催件数",
                "unit": "回",
              },
            ],
            "municipalityMismatchFlag": true,
            "projectName": "市民活動事業",
            "projectNumber": undefined,
            "publicationNotes": [
              "指標が不足しているため要確認表示で公開",
              "収集台帳は 奥州市 だが抽出結果は 別自治体",
            ],
            "publicationStatus": "review",
            "reviewFlags": [
              "指標未抽出",
              "missing_number",
              "事業番号未抽出",
              "自治体名不一致",
            ],
          },
        ],
        "validatedRows": [
          {
            "achievement": undefined,
            "activityActualValue": "2",
            "activityIndicatorName": "自治基本条例推進委員会開催件数",
            "activityIndicatorUnit": "回",
            "activityPlannedValue": undefined,
            "budget": "1200万円",
            "confidence": 0.91,
            "department": "地域づくり推進課",
            "fiscalYear": undefined,
            "municipality": "奥州市",
            "outcomeActualValue": undefined,
            "outcomeIndicatorName": undefined,
            "outcomeIndicatorUnit": undefined,
            "outcomeTargetValue": undefined,
            "projectName": "市民活動事業",
            "projectNumber": undefined,
            "projectSummary": "市民参画手続手法の適正化のための事業",
            "reviewFlags": [
              "指標未抽出",
              "missing_number",
            ],
            "sectionPath": [
              "Ⅰ みんなで創る",
              "① 開かれた市政の推進",
            ],
            "sourceReference": "page-1-table-1:row-2",
            "status": undefined,
          },
        ],
      }
    `);
  });
});
