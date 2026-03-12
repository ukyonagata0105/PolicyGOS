import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type { GeneratedUI, UserProfile, WorkspaceDocument } from '@/types';

export const generatedUICompatibilityProfile: UserProfile = {
  audience: 'resident',
  readingPreference: 'summary',
  displayConstraint: 'desktop',
};

export function createGeneratedUICompatibilityFixture(): GeneratedUI {
  return {
    id: 'generated-ui-compat',
    title: '地域交通再編計画ビュー',
    summary: '現行 GeneratedUI consumer assumptions を固定するための互換フィクスチャです。',
    timestamp: '2026-03-12T09:30:00.000Z',
    provider: 'canonical-store',
    model: 'heuristic-project-view',
    schema: {
      layout: {
        density: 'compact',
        emphasis: 'summary',
        heroStyle: 'dashboard',
      },
      sections: [
        {
          id: 'overview',
          kind: 'hero',
          title: '地域交通再編計画',
          description: '住民向けに主要指標と公開可否を整理した briefing です。',
          accent: 'sky',
          items: [
            { label: '文書数', value: '1件', emphasis: 'strong' },
            { label: '事業数', value: '1件', emphasis: 'strong' },
            { label: '公開可', value: '1件' },
          ],
          paragraphs: ['v1 fallback path でも同じ schema shape を返す前提です。'],
        },
        {
          id: 'documents',
          kind: 'documents',
          title: '収集台帳',
          description: '現在の renderer consumer が table section を期待することを示します。',
          accent: 'slate',
          table: {
            columns: ['文書', '自治体', '状態'],
            rows: [['region-policy.pdf', '岩手県', 'completed']],
          },
        },
        {
          id: 'projects',
          kind: 'data-table',
          title: '案件一覧',
          description: 'rowSectionIds と rowLinkColumnIndex を使う detail link 互換ケースです。',
          accent: 'emerald',
          table: {
            columns: ['案件', '公開状態'],
            rows: [['地域交通再編事業', 'ready']],
            rowSectionIds: ['detail-project-1'],
            rowLinkColumnIndex: 0,
          },
        },
        {
          id: 'detail-project-1',
          kind: 'text',
          title: '案件詳細: 地域交通再編事業',
          description: 'detail section は renderer の target/back-link semantics を使います。',
          accent: 'amber',
          paragraphs: ['事業概要: 地域交通ネットワークの再編', '指標: 交通空白地の解消率'],
        },
      ],
    },
  };
}

export function createGeneratedUIConsumerDocument(name = 'region-policy.pdf'): WorkspaceDocument {
  const file = new File(['pdf'], name, { type: 'application/pdf' });
  const document = createWorkspaceDocument(createPdfFile(file));

  document.uploadedAt = new Date('2026-03-12T09:00:00.000Z');
  document.collectionSource.municipality = '岩手県';
  document.processing.status = 'completed';
  document.processing.progress = 100;
  document.processing.message = '完了';
  document.documentDigest = {
    title: '地域交通再編計画',
    municipality: '岩手県',
    overview: '住民移動の利便性を改善する計画です。',
    category: 'infrastructure',
  };
  document.structuredData = {
    title: '地域交通再編計画',
    municipality: '岩手県',
    summary: '住民移動の利便性を改善する計画です。',
    keyPoints: [],
    category: 'infrastructure',
  };
  document.normalizedRows = [
    {
      sourceReference: 'page-1-table-1:row-1',
      sectionPath: ['交通政策'],
      municipality: '岩手県',
      projectNumber: '1-1',
      projectName: '地域交通再編事業',
      projectSummary: '地域交通ネットワークを再編する。',
      budget: '1200万円',
      confidence: 0.91,
      reviewFlags: [],
    },
  ];
  document.originalNormalizedRows = document.normalizedRows;
  document.projectRecords = [
    {
      id: 'project-1',
      sourceDocumentId: document.id,
      projectNumber: '1-1',
      projectName: '地域交通再編事業',
      projectSummary: '地域交通ネットワークを再編する。',
      budget: '1200万円',
      sourceRefs: [
        {
          documentId: document.id,
          documentName: document.name,
          sourceReference: 'page-1-table-1:row-1',
        },
      ],
      indicators: [
        {
          id: 'indicator-1',
          projectId: 'project-1',
          indicatorType: 'outcome',
          name: '交通空白地の解消率',
          actualValue: '65%',
          targetValue: '80%',
          sourceRefs: [],
        },
      ],
      confidence: 0.91,
      reviewFlags: [],
      publicationStatus: 'ready',
      publicationNotes: [],
    },
  ];

  return document;
}
