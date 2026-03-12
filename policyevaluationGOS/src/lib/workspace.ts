import {
  createEmptyWorkspacePipelineState,
  resolveWorkspaceDocumentDigest,
} from '@/lib/pipelineContracts';
import type {
  CollectionSource,
  PdfFile,
  PolicyCategory,
  PolicyKeyPoint,
  PolicyCorpus,
  PromptGenerationRequest,
  StructuredPolicy,
  TableParseResult,
  UserProfile,
  WorkspaceDocument,
  WorkspaceSummary,
} from '@/types';

const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  environment: '環境',
  welfare: '福祉',
  education: '教育',
  infrastructure: 'インフラ',
  healthcare: '医療・保健',
  economy: '経済',
  'public-safety': '防災・安全',
  culture: '文化・観光',
  agriculture: '農業',
  digital: 'デジタル',
  other: 'その他',
};

export function getPolicyCategoryLabel(category: PolicyCategory): string {
  return CATEGORY_LABELS[category];
}

export function createPdfFile(file: File): PdfFile {
  return {
    file,
    id: `${getFileFingerprint(file)}-${crypto.randomUUID()}`,
    name: file.name,
    size: file.size,
    uploadedAt: new Date(),
  };
}

export function createWorkspaceDocument(pdf: PdfFile): WorkspaceDocument {
  return {
    ...pdf,
    collectionSource: {
      id: `${pdf.id}-manual`,
      municipality: '未登録',
      label: pdf.name,
      sourceUrl: '',
      discoveryStrategy: 'manual-upload',
      status: 'manual',
      notes: '手動アップロード',
    },
    processing: {
      provider: 'pending',
      status: 'queued',
      progress: 0,
      message: '処理待ち',
    },
    ...createEmptyWorkspacePipelineState(),
  };
}

export function collectStructuredPolicies(documents: WorkspaceDocument[]): StructuredPolicy[] {
  return documents
    .map((document) => document.structuredData)
    .filter((policy): policy is StructuredPolicy => Boolean(policy));
}

export function collectProjectRecords(documents: WorkspaceDocument[]) {
  return documents.flatMap((document) => document.projectRecords);
}

export function collectReviewItems(documents: WorkspaceDocument[]) {
  return documents.flatMap((document) => document.reviewItems);
}

export function buildPolicyCorpus(documents: WorkspaceDocument[], seedSources: CollectionSource[] = []): PolicyCorpus {
  const projects = collectProjectRecords(documents);
  const reviewItems = collectReviewItems(documents);
  const sources = dedupeSources([...seedSources, ...documents.map((document) => document.collectionSource)]);
  const publicationSummary = projects.reduce(
    (summary, project) => {
      summary[project.publicationStatus] += 1;
      return summary;
    },
    { ready: 0, review: 0, blocked: 0 }
  );

  return {
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    sources,
    documents: documents.map((document) => ({
      id: document.id,
      name: document.name,
      municipality: resolveWorkspaceDocumentDigest(document)?.municipality || '未抽出',
      title: resolveWorkspaceDocumentDigest(document)?.title || document.name,
      strategy: document.collectionSource.discoveryStrategy,
      status: document.collectionSource.status,
      projectCount: document.projectRecords.length,
      reviewCount: document.reviewItems.filter((item) => item.status === 'open').length,
      ingestionPath: document.ingestionPath,
    })),
    projects,
    reviewItems,
    publicationSummary,
  };
}

export function createDefaultSourceRegistry() {
  return [
    {
      id: 'iwate-pref-kintone',
      municipality: '岩手県',
      label: '岩手県 政策評価 viewer',
      sourceUrl:
        'https://3886ab23.viewer.kintoneapp.com/public/dd4535c7a974b6b0feab424ee362b09549ddf73c6a60a6451cbedd82e58bb693',
      discoveryStrategy: 'viewer-kintone' as const,
      status: 'review' as const,
      notes: 'viewer/kintone 型。収集アダプタ実装対象。',
    },
    {
      id: 'hanamaki-r7-listing',
      municipality: '花巻市',
      label: '令和7年度 行政評価一覧',
      sourceUrl:
        'https://www.city.hanamaki.iwate.jp/shisei/shisei/gyoseihyoka/1024588/1024589/index.html',
      discoveryStrategy: 'listing-page' as const,
      status: 'discovered' as const,
      notes: '分野ページ経由で PDF を収集する listing-page 型。',
    },
    {
      id: 'oshu-r7-pdf',
      municipality: '奥州市',
      label: '令和7年度 行政評価 PDF',
      sourceUrl: 'https://www.city.oshu.iwate.jp/material/files/group/4/R07gyouseihyouka.pdf',
      discoveryStrategy: 'static-pdf-url' as const,
      status: 'discovered' as const,
      notes: '直接 PDF に当たる static-pdf-url 型。',
    },
    {
      id: 'miyako-r7-pdf',
      municipality: '宮古市',
      label: '令和7年度 action plan PDF',
      sourceUrl: 'https://www.city.miyako.iwate.jp/material/files/group/7/R7-11_action_plan.pdf',
      discoveryStrategy: 'static-pdf-url' as const,
      status: 'discovered' as const,
      notes: '直接 PDF に当たる static-pdf-url 型。',
    },
  ];
}

export function buildWorkspaceSummary(documents: WorkspaceDocument[]): WorkspaceSummary {
  const policies = collectStructuredPolicies(documents);
  const projects = collectProjectRecords(documents);
  const reviewItems = collectReviewItems(documents);
  const municipalities = new Set<string>();
  const categories = new Set<PolicyCategory>();
  const keyPointsByText = new Map<string, PolicyKeyPoint>();
  const summaries: string[] = [];

  for (const document of documents) {
    const digest = resolveWorkspaceDocumentDigest(document);
    if (digest?.municipality && digest.municipality !== 'N/A' && digest.municipality !== '未抽出') {
      municipalities.add(digest.municipality);
    }
    if (digest?.category) {
      categories.add(digest.category);
    }
    if (digest?.overview) {
      summaries.push(digest.overview);
    }
  }

  for (const policy of policies) {
    if (policy.municipality && policy.municipality !== 'N/A') {
      municipalities.add(policy.municipality);
    }
    categories.add(policy.category);

    for (const point of policy.keyPoints) {
      if (!keyPointsByText.has(point.text)) {
        keyPointsByText.set(point.text, point);
      }
    }

    if (policy.summary) {
      summaries.push(policy.summary);
    }
  }

  const titleSource =
    sanitizeSummaryTitle(resolveWorkspaceDocumentDigest(documents[0])?.title) ||
    sanitizeSummaryTitle(policies[0]?.title) ||
    documents[0]?.name ||
    '政策資料';
  const title = policies.length > 1 ? `${titleSource} ほか ${policies.length} 件` : titleSource;
  const keyPoints = Array.from(keyPointsByText.values()).slice(0, 8);
  const combinedSummary = clampText(summaries.join(' ').trim(), 640);

  return {
    title,
    municipalities: Array.from(municipalities),
    categories: Array.from(categories),
    documentCount: documents.length,
    projectCount: projects.length,
    openReviewCount: reviewItems.filter((item) => item.status === 'open').length,
    keyPoints,
    combinedSummary,
  };
}

export function buildDocumentComparisonRows(documents: WorkspaceDocument[]): string[][] {
  return documents.map((document) => {
    const digest = resolveWorkspaceDocumentDigest(document);
    return [
      document.name,
      digest?.municipality || '未抽出',
      `${document.projectRecords.length}件`,
      `${document.reviewItems.filter((item) => item.status === 'open').length}件`,
      document.processing.message,
    ];
  });
}

export function buildAudienceLead(summary: WorkspaceSummary, userProfile: UserProfile): string {
  const municipalityText = summary.municipalities.length > 0
    ? `${summary.municipalities.join('・')}の`
    : '';

  switch (userProfile.audience) {
    case 'staff':
      return `${municipalityText}政策文書を業務判断向けに再構成しました。意思決定に必要な論点を先頭に配置しています。`;
    case 'legislator':
      return `${municipalityText}政策文書を審議向けに整理しました。比較しやすさと論点の見通しを重視しています。`;
    case 'researcher':
      return `${municipalityText}政策文書を分析用途向けに再構成しました。文書横断の比較と出典確認を重視しています。`;
    case 'resident':
    default:
      return `${municipalityText}政策文書を住民向けに読みやすく再編集しました。重要事項から順に確認できます。`;
  }
}

export function buildActionHints(summary: WorkspaceSummary, userProfile: UserProfile): string[] {
  const baseHints = [
    `${summary.documentCount}件の文書を横断して優先論点を確認する`,
    '必要に応じて ZIP 出力して共有する',
  ];

  switch (userProfile.readingPreference) {
    case 'comparison':
      return ['文書比較セクションから差分を確認する', ...baseHints];
    case 'detail':
      return ['文書一覧から個別の要約と詳細を確認する', ...baseHints];
    case 'summary':
    default:
      return ['冒頭サマリーで結論を先に把握する', ...baseHints];
  }
}

export function buildPromptContext(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  promptRequest?: PromptGenerationRequest
): string {
  const summary = buildWorkspaceSummary(documents);
  const categories = summary.categories.map((category) => CATEGORY_LABELS[category]).join('、') || '未分類';
  const keyPoints = summary.keyPoints.map((point, index) => `${index + 1}. ${point.text}`).join('\n');
  const priorPromptSummary = promptRequest?.messages.length
    ? promptRequest.messages.map((message, index) => `${index + 1}. ${message.role}: ${message.content}`).join('\n')
    : 'なし';
  const documentDigests = documents
    .map((document, index) => {
      const policy = document.structuredData;
      const digest = resolveWorkspaceDocumentDigest(document);
      const parsedTables = document.tableResults.filter((result) => result.status === 'parsed');
      const tableDigest = parsedTables
        .slice(0, 2)
        .map((result, tableIndex) => {
          const previewRows = result.table.rows
            .slice(0, 2)
            .map((row) => row.join(' | '))
            .join('\n');

          return [
            `表${tableIndex + 1}: ${result.table.headers.join(' | ')}`,
            previewRows ? `行プレビュー:\n${previewRows}` : '行プレビュー: なし',
          ].join('\n');
        })
        .join('\n');

      return [
        `文書${index + 1}: ${document.name}`,
        `自治体: ${digest?.municipality || policy?.municipality || '未抽出'}`,
        `カテゴリ: ${digest?.category ? CATEGORY_LABELS[digest.category] : policy ? CATEGORY_LABELS[policy.category] : '未抽出'}`,
        `要旨: ${digest?.overview || policy?.summary || document.processing.message}`,
        `取り込み経路: ${document.ingestionPath || 'unknown'}`,
        `抽出済み表: ${countParsedTables(document.tableResults)}件`,
        `事業数: ${document.projectRecords.length}件`,
        tableDigest ? `表データ:\n${tableDigest}` : '表データ: なし',
      ].join('\n');
    })
    .join('\n\n');

  return [
    'あなたは日本語の政策文書ビューアを構成する補助アシスタントです。',
    promptRequest
      ? 'ユーザー質問を起点に briefing-first の説明面を組み立て、必要なら文書本文を補助的に参照してください。'
      : '要約中心ではなく、抽出済みの文書一覧と表データを見せる UI を補助してください。',
    `対象ユーザー: ${userProfile.audience}`,
    `読解モード: ${userProfile.readingPreference}`,
    `表示制約: ${userProfile.displayConstraint}`,
    promptRequest ? `質問モード: ${promptRequest.mode}` : '',
    promptRequest ? `現在の質問: ${promptRequest.prompt}` : '',
    promptRequest ? `これまでの会話:\n${priorPromptSummary}` : '',
    `文書数: ${summary.documentCount}`,
    `カテゴリ: ${categories}`,
    `文書横断サマリー: ${summary.combinedSummary || '未抽出'}`,
    `主要論点:\n${keyPoints || 'なし'}`,
    `文書データ:\n${documentDigests}`,
  ].join('\n\n');
}

function countParsedTables(tableResults: TableParseResult[]): number {
  return tableResults.filter((result) => result.status === 'parsed').length;
}

function sanitizeSummaryTitle(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized === 'N/A' || normalized === '未抽出') {
    return undefined;
  }
  if (
    normalized.startsWith('[') ||
    normalized.startsWith('#') ||
    normalized.startsWith('Table ') ||
    normalized.startsWith('Headers:')
  ) {
    return undefined;
  }
  return clampText(normalized, 80);
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}…`;
}

function dedupeSources(sources: CollectionSource[]): CollectionSource[] {
  const byId = new Map<string, CollectionSource>();
  sources.forEach((source) => {
    byId.set(source.id, source);
  });
  return Array.from(byId.values());
}

export function getFileFingerprint(file: File): string {
  return [
    file.name,
    file.size,
    file.lastModified,
    file.type || 'application/octet-stream',
  ].join(':');
}
