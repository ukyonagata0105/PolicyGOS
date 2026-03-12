import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildFallbackView, generateWorkspaceView } from '@/lib/uiGenerator';
import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type { CollectionSource, EvidenceRef, ProjectRecord, UserProfile, WorkspaceDocument } from '@/types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('uiGenerator v1 characterization', () => {
  it('keeps the zero-project fallback path as the current report-style shell', async () => {
    const profile: UserProfile = {
      audience: 'staff',
      readingPreference: 'detail',
      displayConstraint: 'presentation',
    };
    const document = createDocumentFixture({
      name: 'fallback.pdf',
      title: '公共交通再編計画',
      municipality: '岩手県',
      summary: '広域交通の再編と利便性向上を目的とした計画です。',
      processingMessage: '未着手',
      projects: [],
    });
    const sourceRegistry: CollectionSource[] = [
      {
        id: 'registry-iwate',
        municipality: '岩手県',
        label: '岩手県 政策評価 viewer',
        sourceUrl: 'https://example.test/iwate',
        discoveryStrategy: 'viewer-kintone',
        status: 'review',
        notes: 'seed source',
      },
    ];

    const result = await generateWorkspaceView([document], profile, { sourceRegistry });

    expect({
      resultProvider: result.provider,
      resultModel: result.model,
      uiProvider: result.ui?.provider,
      uiModel: result.ui?.model,
      title: result.ui?.title,
      summary: result.ui?.summary,
      layout: result.ui?.schema.layout,
      sections: result.ui?.schema.sections.map((section) => ({
        id: section.id,
        kind: section.kind,
        title: section.title,
        accent: section.accent,
        description: section.description,
        items: section.items,
        paragraphs: section.paragraphs,
        table: section.table,
      })),
    }).toMatchInlineSnapshot(`
      {
        "layout": {
          "density": "comfortable",
          "emphasis": "detail",
          "heroStyle": "presentation",
        },
        "resultModel": "canonical-briefing-v1",
        "resultProvider": "fallback",
        "sections": [
          {
            "accent": "amber",
            "description": "岩手県の政策文書を業務判断向けに再構成しました。意思決定に必要な論点を先頭に配置しています。",
            "id": "overview",
            "items": [
              {
                "emphasis": "strong",
                "label": "文書数",
                "value": "1件",
              },
              {
                "emphasis": "strong",
                "label": "事業数",
                "value": "0件",
              },
              {
                "label": "公開可",
                "value": "0件",
              },
              {
                "label": "要確認",
                "value": "0件",
              },
              {
                "label": "公開保留",
                "value": "0件",
              },
            ],
            "kind": "hero",
            "paragraphs": [
              "事業レコードがまだないため、収集状況の最小表示に切り替えました。",
            ],
            "table": undefined,
            "title": "公共交通再編計画",
          },
          {
            "accent": "slate",
            "description": "自治体ごとの取得元と収集方式です。",
            "id": "collection-registry",
            "items": undefined,
            "kind": "documents",
            "paragraphs": undefined,
            "table": {
              "columns": [
                "自治体",
                "取得元",
                "方式",
                "状態",
              ],
              "rows": [
                [
                  "岩手県",
                  "https://example.test/iwate",
                  "viewer-kintone",
                  "review",
                ],
                [
                  "岩手県",
                  "手動アップロード",
                  "manual-upload",
                  "manual",
                ],
              ],
            },
            "title": "収集台帳",
          },
          {
            "accent": "slate",
            "description": "収集済み文書と抽出状況です。",
            "id": "document-comparison",
            "items": undefined,
            "kind": "documents",
            "paragraphs": undefined,
            "table": {
              "columns": [
                "文書",
                "自治体",
                "事業",
                "要確認",
                "処理状況",
              ],
              "rows": [
                [
                  "fallback.pdf",
                  "岩手県",
                  "0件",
                  "0件",
                  "未着手",
                ],
              ],
            },
            "title": "文書一覧",
          },
          {
            "accent": "emerald",
            "description": "事業名をクリックすると指標と出典メモを確認できます。",
            "id": "project-explorer",
            "items": undefined,
            "kind": "data-table",
            "paragraphs": undefined,
            "table": {
              "columns": [
                "事業",
                "自治体",
                "活動指標",
                "成果指標",
                "公開状態",
                "要確認",
              ],
              "rowLinkColumnIndex": 0,
              "rowSectionIds": [],
              "rows": [],
            },
            "title": "事業一覧",
          },
        ],
        "summary": "0件の事業を、収集台帳・事業一覧・説明ビューとして再編成しました。",
        "title": "公共交通再編計画",
        "uiModel": "heuristic-project-view",
        "uiProvider": "canonical-store",
      }
    `);
  });

  it('keeps the project-present canonical path ordering, titles, and detail topology', async () => {
    const profile: UserProfile = {
      audience: 'legislator',
      readingPreference: 'comparison',
      displayConstraint: 'desktop',
    };
    const document = createDocumentFixture({
      name: 'policy.pdf',
      title: '地域交通再編計画',
      municipality: '岩手県',
      summary: '広域交通の再編と利便性向上を目的とした計画です。',
      processingMessage: '完了',
      projects: [
        createProjectFixture('project-ready', {
          projectNumber: '1-1',
          projectName: '地域交通再編事業',
          projectSummary: '地域交通ネットワークを再編する。',
          confidence: 0.91,
          publicationStatus: 'ready',
          indicators: [
            {
              id: 'indicator-1',
              projectId: 'project-ready',
              indicatorType: 'activity',
              name: '説明会開催件数',
              unit: '回',
              plannedValue: '4',
              actualValue: '5',
              sourceRefs: [],
            },
            {
              id: 'indicator-2',
              projectId: 'project-ready',
              indicatorType: 'outcome',
              name: '交通空白地の解消率',
              actualValue: '65%',
              targetValue: '80%',
              sourceRefs: [],
            },
          ],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-1' }],
        }),
        createProjectFixture('project-review', {
          projectName: '予約型交通導入事業',
          projectSummary: 'デマンド交通の実証を進める。',
          confidence: 0.68,
          reviewFlags: ['指標未抽出'],
          publicationStatus: 'review',
          publicationNotes: ['要確認表示'],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-2' }],
        }),
        createProjectFixture('project-blocked', {
          projectName: 'AI配車最適化事業',
          projectSummary: '個票単位の秘匿情報を含むため公開保留。',
          confidence: 0.74,
          reviewFlags: ['匿名化確認待ち'],
          publicationStatus: 'blocked',
          publicationNotes: ['匿名化後に再判定'],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-3' }],
        }),
      ],
    });
    document.reviewItems = [
      {
        id: 'review-1',
        documentId: document.id,
        projectId: 'project-review',
        severity: 'high',
        reason: '指標未抽出',
        status: 'open',
      },
      {
        id: 'review-2',
        documentId: document.id,
        projectId: 'project-blocked',
        severity: 'medium',
        reason: '匿名化確認待ち',
        status: 'open',
      },
    ];

    const result = await generateWorkspaceView([document], profile, { model: 'v1-freeze-model' });

    expect({
      resultProvider: result.provider,
      resultModel: result.model,
      uiProvider: result.ui?.provider,
      uiModel: result.ui?.model,
      layout: result.ui?.schema.layout,
      summary: result.ui?.summary,
      sectionOrder: result.ui?.schema.sections.map((section) => section.id),
      sections: result.ui?.schema.sections.map((section) => ({
        id: section.id,
        kind: section.kind,
        title: section.title,
        accent: section.accent,
        description: section.description,
        items: section.items,
        table: section.table,
      })),
    }).toMatchInlineSnapshot(`
      {
        "layout": {
          "density": "comfortable",
          "emphasis": "comparison",
          "heroStyle": "dashboard",
        },
        "resultModel": "v1-freeze-model",
        "resultProvider": "canonical-store",
        "sectionOrder": [
          "overview",
          "collection-registry",
          "document-comparison",
          "project-explorer",
          "detail-project-ready",
          "detail-project-review",
          "detail-project-blocked",
        ],
        "sections": [
          {
            "accent": "sky",
            "description": "岩手県の政策文書を審議向けに整理しました。比較しやすさと論点の見通しを重視しています。",
            "id": "overview",
            "items": [
              {
                "emphasis": "strong",
                "label": "文書数",
                "value": "1件",
              },
              {
                "emphasis": "strong",
                "label": "事業数",
                "value": "3件",
              },
              {
                "label": "公開可",
                "value": "1件",
              },
              {
                "label": "要確認",
                "value": "1件",
              },
              {
                "label": "公開保留",
                "value": "1件",
              },
            ],
            "kind": "hero",
            "table": undefined,
            "title": "地域交通再編計画",
          },
          {
            "accent": "slate",
            "description": "自治体ごとの取得元と収集方式です。",
            "id": "collection-registry",
            "items": undefined,
            "kind": "documents",
            "table": {
              "columns": [
                "自治体",
                "取得元",
                "方式",
                "状態",
              ],
              "rows": [
                [
                  "岩手県",
                  "手動アップロード",
                  "manual-upload",
                  "manual",
                ],
              ],
            },
            "title": "収集台帳",
          },
          {
            "accent": "slate",
            "description": "収集済み文書と抽出状況です。",
            "id": "document-comparison",
            "items": undefined,
            "kind": "documents",
            "table": {
              "columns": [
                "文書",
                "自治体",
                "事業",
                "要確認",
                "処理状況",
              ],
              "rows": [
                [
                  "policy.pdf",
                  "岩手県",
                  "3件",
                  "2件",
                  "完了",
                ],
              ],
            },
            "title": "文書一覧",
          },
          {
            "accent": "emerald",
            "description": "事業名をクリックすると指標と出典メモを確認できます。",
            "id": "project-explorer",
            "items": undefined,
            "kind": "data-table",
            "table": {
              "columns": [
                "事業",
                "自治体",
                "活動指標",
                "成果指標",
                "公開状態",
                "要確認",
              ],
              "rowLinkColumnIndex": 0,
              "rowSectionIds": [
                "detail-project-ready",
                "detail-project-review",
                "detail-project-blocked",
              ],
              "rows": [
                [
                  "1-1 地域交通再編事業",
                  "岩手県",
                  "1件",
                  "1件",
                  "公開可",
                  "なし",
                ],
                [
                  "予約型交通導入事業",
                  "岩手県",
                  "0件",
                  "0件",
                  "要確認",
                  "指標未抽出",
                ],
                [
                  "AI配車最適化事業",
                  "岩手県",
                  "0件",
                  "0件",
                  "公開保留",
                  "匿名化確認待ち",
                ],
              ],
            },
            "title": "審議対象の事業一覧",
          },
          {
            "accent": "slate",
            "description": "出典メモ付きの事業詳細です。",
            "id": "detail-project-ready",
            "items": [
              {
                "label": "事業番号",
                "value": "1-1",
              },
              {
                "emphasis": "strong",
                "label": "事業名",
                "value": "地域交通再編事業",
              },
              {
                "label": "自治体",
                "value": "岩手県",
              },
              {
                "label": "文書",
                "value": "policy.pdf",
              },
              {
                "label": "概要",
                "value": "地域交通ネットワークを再編する。",
              },
              {
                "label": "信頼度",
                "value": "91%",
              },
              {
                "label": "公開状態",
                "value": "公開可",
              },
              {
                "label": "活動指標 1",
                "value": "説明会開催件数 (回) 計画 4 / 実績 5",
              },
              {
                "label": "成果指標 1",
                "value": "交通空白地の解消率 実績 65% / 目標 80%",
              },
              {
                "label": "出典メモ",
                "value": "page-1-table-1:row-1",
              },
            ],
            "kind": "documents",
            "table": undefined,
            "title": "案件詳細: 地域交通再編事業",
          },
          {
            "accent": "amber",
            "description": "要確認: 指標未抽出",
            "id": "detail-project-review",
            "items": [
              {
                "emphasis": "strong",
                "label": "事業名",
                "value": "予約型交通導入事業",
              },
              {
                "label": "自治体",
                "value": "岩手県",
              },
              {
                "label": "文書",
                "value": "policy.pdf",
              },
              {
                "label": "概要",
                "value": "デマンド交通の実証を進める。",
              },
              {
                "label": "信頼度",
                "value": "68%",
              },
              {
                "label": "公開状態",
                "value": "要確認",
              },
              {
                "label": "出典メモ",
                "value": "page-1-table-1:row-2",
              },
            ],
            "kind": "documents",
            "table": undefined,
            "title": "案件詳細: 予約型交通導入事業",
          },
          {
            "accent": "amber",
            "description": "要確認: 匿名化確認待ち",
            "id": "detail-project-blocked",
            "items": [
              {
                "emphasis": "strong",
                "label": "事業名",
                "value": "AI配車最適化事業",
              },
              {
                "label": "自治体",
                "value": "岩手県",
              },
              {
                "label": "文書",
                "value": "policy.pdf",
              },
              {
                "label": "概要",
                "value": "個票単位の秘匿情報を含むため公開保留。",
              },
              {
                "label": "信頼度",
                "value": "74%",
              },
              {
                "label": "公開状態",
                "value": "公開保留",
              },
              {
                "label": "出典メモ",
                "value": "page-1-table-1:row-3",
              },
            ],
            "kind": "documents",
            "table": undefined,
            "title": "案件詳細: AI配車最適化事業",
          },
        ],
        "summary": "3件の事業を、収集台帳・事業一覧・説明ビューとして再編成しました。",
        "uiModel": "v1-freeze-model",
        "uiProvider": "canonical-store",
      }
    `);
  });

  it('emits a briefing-first direct-document view with reachable provenance instead of admin-first sections', async () => {
    const profile: UserProfile = {
      audience: 'researcher',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const document = createDocumentFixture({
      name: 'direct-briefing.pdf',
      title: '地域交通再編計画',
      municipality: '岩手県',
      summary: '広域交通の再編と利便性向上を目的とした計画です。',
      processingMessage: '要約準備完了',
      projects: [],
    });
    document.rawLayoutText = '人口減少に伴う路線縮小への対応を進め、主要拠点へのアクセス維持を図る。住民説明会と代替交通の段階導入を行う。';
    document.ingestionPath = 'pdf_text_fast_path';
    document.routeDecision = {
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
    };
    document.collectionSource.sourceUrl = 'https://example.test/direct-briefing';

    const result = await generateWorkspaceView([document], profile, {
      sourceRegistry: [
        {
          id: 'registry-iwate',
          municipality: '岩手県',
          label: '岩手県 政策評価 viewer',
          sourceUrl: 'https://example.test/iwate',
          discoveryStrategy: 'viewer-kintone',
          status: 'review',
          notes: 'seed source',
        },
      ],
      model: 'direct-briefing-model',
    });

    expect(result.provider).toBe('canonical-store');
    expect(result.model).toBe('direct-briefing-model');
    expect(result.ui?.provider).toBe('canonical-store');
    expect(result.ui?.model).toBe('direct-briefing-model');
    expect(result.ui?.summary).toBe('1件の文書を、論点サマリー・文書ブリーフ・出典トレースとして再編成しました。');
    expect(result.ui?.prompt).toContain('対象ユーザー: researcher');
    expect(result.ui?.prompt).toContain('文書1: direct-briefing.pdf');
    expect(result.ui?.schema.layout).toEqual({
      density: 'comfortable',
      emphasis: 'summary',
      heroStyle: 'editorial',
    });
    expect(result.ui?.schema.sections.map((section) => section.id)).toEqual([
      'overview',
      'briefing-points',
      'document-briefs',
      'provenance-trace',
    ]);

    const overview = result.ui?.schema.sections.find((section) => section.id === 'overview');
    const briefingPoints = result.ui?.schema.sections.find((section) => section.id === 'briefing-points');
    const briefs = result.ui?.schema.sections.find((section) => section.id === 'document-briefs');
    const provenance = result.ui?.schema.sections.find((section) => section.id === 'provenance-trace');

    expect(overview).toMatchObject({
      kind: 'hero',
      title: '地域交通再編計画',
      description: '岩手県の政策文書を分析用途向けに再構成しました。文書横断の比較と出典確認を重視しています。',
      items: [
        { label: '文書数', value: '1件', emphasis: 'strong' },
        { label: '自治体', value: '岩手県', emphasis: 'strong' },
        { label: '主要論点', value: '1件' },
        { label: '参照元', value: '2件' },
      ],
    });
    expect(overview?.paragraphs).toContain('政策評価の台帳ではなく、文書の要点と参照経路を先に読める briefing に再編成しました。');
    expect(briefingPoints).toMatchObject({
      kind: 'key-points',
      title: '主要論点',
      items: [{ label: '重要', value: '地域交通再編計画の論点', emphasis: 'strong' }],
    });
    expect(briefs).toMatchObject({
      kind: 'text',
      title: '文書ブリーフ',
    });
    expect(briefs?.paragraphs?.[0]).toContain('本文補足: 人口減少に伴う路線縮小への対応を進め');
    expect(provenance?.table).toEqual({
      columns: ['区分', '名称', '取得元', '参照情報'],
      rows: [
        ['文書', 'direct-briefing.pdf', 'https://example.test/direct-briefing', 'pdf_text_fast_path / direct/no_tabular_evidence/strong'],
        ['台帳', '岩手県 / 岩手県 政策評価 viewer', 'https://example.test/iwate', 'viewer-kintone / review'],
      ],
    });
  });

  it('keeps table-derived project rows, publication summary, and seeded registry rows together', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const document = createDocumentFixture({
      name: 'table-route.pdf',
      title: '地域交通再編計画',
      municipality: '岩手県',
      summary: '広域交通の再編と利便性向上を目的とした計画です。',
      processingMessage: '完了',
      projects: [
        createProjectFixture('project-ready', {
          projectNumber: '1-1',
          projectName: '地域交通再編事業',
          projectSummary: '地域交通ネットワークを再編する。',
          confidence: 0.91,
          publicationStatus: 'ready',
          indicators: [
            {
              id: 'indicator-1',
              projectId: 'project-ready',
              indicatorType: 'activity',
              name: '説明会開催件数',
              unit: '回',
              plannedValue: '4',
              actualValue: '5',
              sourceRefs: [],
            },
          ],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-1' }],
        }),
        createProjectFixture('project-review', {
          projectName: '予約型交通導入事業',
          projectSummary: 'デマンド交通の実証を進める。',
          confidence: 0.68,
          reviewFlags: ['指標未抽出'],
          publicationStatus: 'review',
          publicationNotes: ['要確認表示'],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-2' }],
        }),
        createProjectFixture('project-blocked', {
          projectName: 'AI配車最適化事業',
          projectSummary: '個票単位の秘匿情報を含むため公開保留。',
          confidence: 0.74,
          reviewFlags: ['匿名化確認待ち'],
          publicationStatus: 'blocked',
          publicationNotes: ['匿名化後に再判定'],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-3' }],
        }),
      ],
    });
    const sourceRegistry: CollectionSource[] = [
      {
        id: 'registry-iwate',
        municipality: '岩手県',
        label: '岩手県 政策評価 viewer',
        sourceUrl: 'https://example.test/iwate',
        discoveryStrategy: 'viewer-kintone',
        status: 'review',
        notes: 'seed source',
      },
    ];
    document.routeDecision = {
      route: 'table',
      reason: 'viable_candidate_rows',
      confidence: 'strong',
      evidence: {
        rawCsvPresent: true,
        parsedTableCount: 1,
        tableArtifactCount: 1,
        candidateRowCount: 3,
        projectCandidateRowCount: 3,
        viableCandidateRowCount: 3,
      },
    };

    const result = await generateWorkspaceView([document], profile, { sourceRegistry, model: 'v1-freeze-model' });
    const sections = result.ui?.schema.sections || [];
    const overview = sections.find((section) => section.id === 'overview');
    const registry = sections.find((section) => section.id === 'collection-registry');
    const projectExplorer = sections.find((section) => section.id === 'project-explorer');

    expect(result.ui?.summary).toBe('3件の事業を、収集台帳・事業一覧・説明ビューとして再編成しました。');
    expect(overview?.items).toEqual([
      { label: '文書数', value: '1件', emphasis: 'strong' },
      { label: '事業数', value: '3件', emphasis: 'strong' },
      { label: '公開可', value: '1件' },
      { label: '要確認', value: '1件' },
      { label: '公開保留', value: '1件' },
    ]);
    expect(registry?.table?.rows).toEqual([
      ['岩手県', 'https://example.test/iwate', 'viewer-kintone', 'review'],
      ['岩手県', '手動アップロード', 'manual-upload', 'manual'],
    ]);
    expect(projectExplorer?.table).toEqual({
      columns: ['事業', '自治体', '活動指標', '成果指標', '公開状態', '要確認'],
      rowLinkColumnIndex: 0,
      rowSectionIds: ['detail-project-ready', 'detail-project-review', 'detail-project-blocked'],
      rows: [
        ['1-1 地域交通再編事業', '岩手県', '1件', '0件', '公開可', 'なし'],
        ['予約型交通導入事業', '岩手県', '0件', '0件', '要確認', '指標未抽出'],
        ['AI配車最適化事業', '岩手県', '0件', '0件', '公開保留', '匿名化確認待ち'],
      ],
    });
  });

  it('keeps the direct fallback helper semantics for mixed publication states', () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'mobile',
    };
    const document = createDocumentFixture({
      name: 'policy.pdf',
      title: '地域交通再編計画',
      municipality: '岩手県',
      summary: '広域交通の再編と利便性向上を目的とした計画です。',
      processingMessage: '完了',
      projects: [
        createProjectFixture('project-ready', {
          projectNumber: '1-1',
          projectName: '地域交通再編事業',
          projectSummary: '地域交通ネットワークを再編する。',
          confidence: 0.91,
          publicationStatus: 'ready',
          indicators: [
            {
              id: 'indicator-1',
              projectId: 'project-ready',
              indicatorType: 'activity',
              name: '説明会開催件数',
              unit: '回',
              plannedValue: '4',
              actualValue: '5',
              sourceRefs: [],
            },
            {
              id: 'indicator-2',
              projectId: 'project-ready',
              indicatorType: 'outcome',
              name: '交通空白地の解消率',
              actualValue: '65%',
              targetValue: '80%',
              sourceRefs: [],
            },
          ],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-1' }],
        }),
        createProjectFixture('project-review', {
          projectName: '予約型交通導入事業',
          projectSummary: 'デマンド交通の実証を進める。',
          confidence: 0.68,
          reviewFlags: ['指標未抽出'],
          publicationStatus: 'review',
          publicationNotes: ['要確認表示'],
          sourceRefs: [{ sourceReference: 'page-1-table-1:row-2' }],
        }),
      ],
    });
    document.reviewItems = [
      {
        id: 'review-1',
        documentId: document.id,
        projectId: 'project-review',
        severity: 'high',
        reason: '指標未抽出',
        status: 'open',
      },
    ];

    const generated = buildFallbackView([document], profile, 'fallback reason');

    expect({
      title: generated.title,
      summary: generated.summary,
      provider: generated.provider,
      model: generated.model,
      layout: generated.schema.layout,
      sections: generated.schema.sections.map((section) => ({
        kind: section.kind,
        title: section.title,
        description: section.description,
        accent: section.accent,
        table: section.table,
        items: section.items,
        paragraphs: section.paragraphs,
      })),
    }).toMatchInlineSnapshot(`
      {
        "layout": {
          "density": "compact",
          "emphasis": "summary",
          "heroStyle": "dashboard",
        },
        "model": "heuristic-project-view",
        "provider": "canonical-store",
        "sections": [
          {
            "accent": "sky",
            "description": "岩手県の政策文書を住民向けに読みやすく再編集しました。重要事項から順に確認できます。",
            "items": [
              {
                "emphasis": "strong",
                "label": "文書数",
                "value": "1件",
              },
              {
                "emphasis": "strong",
                "label": "事業数",
                "value": "2件",
              },
              {
                "label": "公開可",
                "value": "1件",
              },
              {
                "label": "要確認",
                "value": "1件",
              },
              {
                "label": "公開保留",
                "value": "0件",
              },
            ],
            "kind": "hero",
            "paragraphs": [
              "fallback reason",
            ],
            "table": undefined,
            "title": "地域交通再編計画",
          },
          {
            "accent": "slate",
            "description": "自治体ごとの取得元と収集方式です。",
            "items": undefined,
            "kind": "documents",
            "paragraphs": undefined,
            "table": {
              "columns": [
                "自治体",
                "取得元",
                "方式",
                "状態",
              ],
              "rows": [
                [
                  "岩手県",
                  "手動アップロード",
                  "manual-upload",
                  "manual",
                ],
              ],
            },
            "title": "収集台帳",
          },
          {
            "accent": "slate",
            "description": "収集済み文書と抽出状況です。",
            "items": undefined,
            "kind": "documents",
            "paragraphs": undefined,
            "table": {
              "columns": [
                "文書",
                "自治体",
                "事業",
                "要確認",
                "処理状況",
              ],
              "rows": [
                [
                  "policy.pdf",
                  "岩手県",
                  "2件",
                  "1件",
                  "完了",
                ],
              ],
            },
            "title": "文書一覧",
          },
          {
            "accent": "emerald",
            "description": "事業名をクリックすると指標と出典メモを確認できます。",
            "items": undefined,
            "kind": "data-table",
            "paragraphs": undefined,
            "table": {
              "columns": [
                "事業",
                "自治体",
                "活動指標",
                "成果指標",
                "公開状態",
                "要確認",
              ],
              "rowLinkColumnIndex": 0,
              "rowSectionIds": [
                "detail-project-ready",
                "detail-project-review",
              ],
              "rows": [
                [
                  "1-1 地域交通再編事業",
                  "岩手県",
                  "1件",
                  "1件",
                  "公開可",
                  "なし",
                ],
                [
                  "予約型交通導入事業",
                  "岩手県",
                  "0件",
                  "0件",
                  "要確認",
                  "指標未抽出",
                ],
              ],
            },
            "title": "事業一覧",
          },
          {
            "accent": "slate",
            "description": "出典メモ付きの事業詳細です。",
            "items": [
              {
                "label": "事業番号",
                "value": "1-1",
              },
              {
                "emphasis": "strong",
                "label": "事業名",
                "value": "地域交通再編事業",
              },
              {
                "label": "自治体",
                "value": "岩手県",
              },
              {
                "label": "文書",
                "value": "policy.pdf",
              },
              {
                "label": "概要",
                "value": "地域交通ネットワークを再編する。",
              },
              {
                "label": "信頼度",
                "value": "91%",
              },
              {
                "label": "公開状態",
                "value": "公開可",
              },
              {
                "label": "活動指標 1",
                "value": "説明会開催件数 (回) 計画 4 / 実績 5",
              },
              {
                "label": "成果指標 1",
                "value": "交通空白地の解消率 実績 65% / 目標 80%",
              },
              {
                "label": "出典メモ",
                "value": "page-1-table-1:row-1",
              },
            ],
            "kind": "documents",
            "paragraphs": undefined,
            "table": undefined,
            "title": "案件詳細: 地域交通再編事業",
          },
          {
            "accent": "amber",
            "description": "要確認: 指標未抽出",
            "items": [
              {
                "emphasis": "strong",
                "label": "事業名",
                "value": "予約型交通導入事業",
              },
              {
                "label": "自治体",
                "value": "岩手県",
              },
              {
                "label": "文書",
                "value": "policy.pdf",
              },
              {
                "label": "概要",
                "value": "デマンド交通の実証を進める。",
              },
              {
                "label": "信頼度",
                "value": "68%",
              },
              {
                "label": "公開状態",
                "value": "要確認",
              },
              {
                "label": "出典メモ",
                "value": "page-1-table-1:row-2",
              },
            ],
            "kind": "documents",
            "paragraphs": undefined,
            "table": undefined,
            "title": "案件詳細: 予約型交通導入事業",
          },
        ],
        "summary": "2件の事業を、収集台帳・事業一覧・説明ビューとして再編成しました。",
        "title": "地域交通再編計画",
      }
    `);
  });
});

function createDocumentFixture({
  name,
  title,
  municipality,
  summary,
  processingMessage,
  projects,
}: {
  name: string;
  title: string;
  municipality: string;
  summary: string;
  processingMessage: string;
  projects: ProjectRecord[];
}): WorkspaceDocument {
  const document = createWorkspaceDocument(createPdfFile(new File(['policy'], name, { type: 'application/pdf' })));

  document.collectionSource.municipality = municipality;
  document.processing.message = processingMessage;
  document.structuredData = {
    title,
    municipality,
    summary,
    keyPoints: [{ text: `${title}の論点`, importance: 'high' }],
    category: 'infrastructure',
  };
  document.documentDigest = {
    title,
    municipality,
    overview: summary,
    category: 'infrastructure',
  };
  document.projectRecords = projects.map((project) => ({
    ...project,
    sourceDocumentId: document.id,
    sourceRefs: project.sourceRefs.map((sourceRef) => ({
      ...sourceRef,
      documentId: document.id,
      documentName: document.name,
    })),
  }));

  return document;
}

function createProjectFixture(
  id: string,
  overrides: Partial<Omit<ProjectRecord, 'sourceRefs'>> & { sourceRefs?: Array<Partial<EvidenceRef>> }
): ProjectRecord {
  return {
    id,
    sourceDocumentId: 'placeholder-document-id',
    projectName: '仮事業',
    projectSummary: '仮要約',
    indicators: [],
    confidence: 0.8,
    reviewFlags: [],
    publicationStatus: 'ready',
    publicationNotes: [],
    ...overrides,
    sourceRefs: (overrides.sourceRefs || []).map((sourceRef) => ({
      ...sourceRef,
      documentId: sourceRef.documentId || 'placeholder-document-id',
      documentName: sourceRef.documentName || 'placeholder.pdf',
    })),
  };
}
