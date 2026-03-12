import { describe, expect, it } from 'vitest';

import { buildPolicyCorpus, buildWorkspaceSummary, createPdfFile, createWorkspaceDocument } from '@/lib/workspace';

describe('workspace helpers', () => {
  it('creates workspace documents in queued state', () => {
    const file = new File(['policy'], 'policy.pdf', { type: 'application/pdf' });
    const pdf = createPdfFile(file);
    const document = createWorkspaceDocument(pdf);

    expect(document.processing.status).toBe('queued');
    expect(document.ocrText).toBeNull();
    expect(document.structuredData).toBeNull();
  });

  it('builds a multi-document summary from structured policies', () => {
    const first = createWorkspaceDocument(createPdfFile(new File(['a'], 'a.pdf', { type: 'application/pdf' })));
    const second = createWorkspaceDocument(createPdfFile(new File(['b'], 'b.pdf', { type: 'application/pdf' })));

    first.structuredData = {
      title: '子育て支援計画',
      municipality: '盛岡市',
      summary: '子育て世帯への支援策をまとめた計画です。',
      keyPoints: [{ text: '保育支援を拡充する', importance: 'high' }],
      category: 'welfare',
    };
    second.structuredData = {
      title: '地域交通政策',
      municipality: '盛岡市',
      summary: '地域交通の維持に向けた施策です。',
      keyPoints: [{ text: '交通弱者の移動手段を確保する', importance: 'medium' }],
      category: 'infrastructure',
    };
    first.documentDigest = {
      title: '子育て支援計画',
      municipality: '盛岡市',
      overview: '子育て世帯への支援策をまとめた計画です。',
      category: 'welfare',
    };
    second.documentDigest = {
      title: '地域交通政策',
      municipality: '盛岡市',
      overview: '地域交通の維持に向けた施策です。',
      category: 'infrastructure',
    };
    first.projectRecords = [
      {
        id: 'p1',
        sourceDocumentId: first.id,
        projectName: '保育支援事業',
        projectSummary: '保育支援を拡充する',
        sourceRefs: [],
        indicators: [],
        confidence: 0.8,
        reviewFlags: [],
        publicationStatus: 'ready',
        publicationNotes: [],
      },
    ];
    second.projectRecords = [
      {
        id: 'p2',
        sourceDocumentId: second.id,
        projectName: '地域交通維持事業',
        projectSummary: '交通弱者の移動手段を確保する',
        sourceRefs: [],
        indicators: [],
        confidence: 0.75,
        reviewFlags: ['指標未抽出'],
        publicationStatus: 'review',
        publicationNotes: ['指標が不足しているため要確認表示で公開'],
      },
    ];
    second.reviewItems = [
      {
        id: 'r1',
        documentId: second.id,
        projectId: 'p2',
        severity: 'high',
        reason: '指標未抽出',
        status: 'open',
      },
    ];

    const summary = buildWorkspaceSummary([first, second]);

    expect(summary.documentCount).toBe(2);
    expect(summary.projectCount).toBe(2);
    expect(summary.openReviewCount).toBe(1);
    expect(summary.municipalities).toEqual(['盛岡市']);
    expect(summary.keyPoints).toHaveLength(2);
    expect(summary.combinedSummary).toContain('子育て世帯');
    expect(summary.combinedSummary).toContain('地域交通');
  });

  it('builds a corpus from workspace documents', () => {
    const document = createWorkspaceDocument(createPdfFile(new File(['a'], 'a.pdf', { type: 'application/pdf' })));
    document.collectionSource.municipality = '岩手県';
    document.documentDigest = {
      title: 'こころの健康づくり',
      municipality: '岩手県',
      overview: '事業一覧を再構造化した結果です。',
      category: 'healthcare',
    };
    document.projectRecords = [
      {
        id: 'project-1',
        sourceDocumentId: document.id,
        projectNumber: '1-7',
        projectName: '被災地こころのケア対策事業',
        projectSummary: 'こころのケア体制を維持する。',
        sourceRefs: [],
        indicators: [],
        confidence: 0.9,
        reviewFlags: [],
        publicationStatus: 'ready',
        publicationNotes: [],
      },
    ];

    const corpus = buildPolicyCorpus([document]);

    expect(corpus.sources).toHaveLength(1);
    expect(corpus.documents[0]?.municipality).toBe('岩手県');
    expect(corpus.projects[0]?.projectName).toBe('被災地こころのケア対策事業');
    expect(corpus.publicationSummary.ready).toBe(1);
  });

  it('keeps the current aggregation shape for mixed digest fallbacks and publication counts', () => {
    const first = createWorkspaceDocument(createPdfFile(new File(['a'], 'alpha.pdf', { type: 'application/pdf' })));
    const second = createWorkspaceDocument(createPdfFile(new File(['b'], 'beta.pdf', { type: 'application/pdf' })));

    first.documentDigest = {
      title: '[debug] raw parse output',
      municipality: 'N/A',
      overview: ' '.repeat(0),
      category: 'digital',
    };
    first.structuredData = {
      title: '地域DX計画',
      municipality: '遠野市',
      summary: '窓口のオンライン化とデータ連携を進める。',
      keyPoints: [
        { text: 'オンライン申請の導線を統一する', importance: 'high' },
        { text: 'オンライン申請の導線を統一する', importance: 'medium' },
      ],
      category: 'digital',
    };
    first.projectRecords = [
      {
        id: 'ready-project',
        sourceDocumentId: first.id,
        projectName: '電子申請整備事業',
        projectSummary: '申請導線を統一する。',
        sourceRefs: [],
        indicators: [],
        confidence: 0.82,
        reviewFlags: [],
        publicationStatus: 'ready',
        publicationNotes: [],
      },
    ];
    first.reviewItems = [
      {
        id: 'closed-review',
        documentId: first.id,
        projectId: 'ready-project',
        severity: 'medium',
        reason: '確認済み',
        status: 'resolved',
      },
    ];

    second.documentDigest = {
      title: '地域防災計画',
      municipality: '遠野市',
      overview: ' '.repeat(700),
      category: 'public-safety',
    };
    second.structuredData = {
      title: '地域防災計画',
      municipality: 'N/A',
      summary: '避難支援体制を更新する。',
      keyPoints: [{ text: '避難所の開設訓練を増やす', importance: 'high' }],
      category: 'public-safety',
    };
    second.projectRecords = [
      {
        id: 'review-project',
        sourceDocumentId: second.id,
        projectName: '避難支援強化事業',
        projectSummary: '避難支援体制を更新する。',
        sourceRefs: [],
        indicators: [],
        confidence: 0.61,
        reviewFlags: ['指標未抽出'],
        publicationStatus: 'review',
        publicationNotes: ['要確認表示'],
      },
      {
        id: 'blocked-project',
        sourceDocumentId: second.id,
        projectName: '通信設備再整備',
        projectSummary: '防災無線を更新する。',
        sourceRefs: [],
        indicators: [],
        confidence: 0.4,
        reviewFlags: ['出典参照不足'],
        publicationStatus: 'blocked',
        publicationNotes: ['自動公開を保留'],
      },
    ];
    second.reviewItems = [
      {
        id: 'open-review',
        documentId: second.id,
        projectId: 'review-project',
        severity: 'high',
        reason: '指標未抽出',
        status: 'open',
      },
    ];

    const summary = buildWorkspaceSummary([first, second]);
    const corpus = buildPolicyCorpus([first, second], [first.collectionSource]);

    expect({
      title: summary.title,
      municipalities: summary.municipalities,
      categories: summary.categories,
      documentCount: summary.documentCount,
      projectCount: summary.projectCount,
      openReviewCount: summary.openReviewCount,
      keyPoints: summary.keyPoints,
      combinedSummary: summary.combinedSummary,
      publicationSummary: corpus.publicationSummary,
      sourceCount: corpus.sources.length,
      documents: corpus.documents.map((document) => ({
        title: document.title,
        municipality: document.municipality,
        projectCount: document.projectCount,
        reviewCount: document.reviewCount,
      })),
    }).toMatchInlineSnapshot(`
      {
        "categories": [
          "digital",
          "public-safety",
        ],
        "combinedSummary": "窓口のオンライン化とデータ連携を進める。 避難支援体制を更新する。",
        "documentCount": 2,
        "documents": [
          {
            "municipality": "N/A",
            "projectCount": 1,
            "reviewCount": 0,
            "title": "[debug] raw parse output",
          },
          {
            "municipality": "遠野市",
            "projectCount": 2,
            "reviewCount": 1,
            "title": "地域防災計画",
          },
        ],
        "keyPoints": [
          {
            "importance": "high",
            "text": "オンライン申請の導線を統一する",
          },
          {
            "importance": "high",
            "text": "避難所の開設訓練を増やす",
          },
        ],
        "municipalities": [
          "遠野市",
        ],
        "openReviewCount": 1,
        "projectCount": 3,
        "publicationSummary": {
          "blocked": 1,
          "ready": 1,
          "review": 1,
        },
        "sourceCount": 2,
        "title": "地域DX計画 ほか 2 件",
      }
    `);
  });
});
