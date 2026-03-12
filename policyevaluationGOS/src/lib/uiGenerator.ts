import { generatePromptHtmlRuntime } from '@/lib/promptHtmlRuntime';
import {
  createGeneratedUIBuildInput,
  resolveWorkspaceDocumentDigest,
  toUIGenerationResult,
} from '@/lib/pipelineContracts';
import {
  buildAudienceLead,
  buildDocumentComparisonRows,
  buildPolicyCorpus,
  buildPromptContext,
  buildWorkspaceSummary,
  getPolicyCategoryLabel,
} from '@/lib/workspace';
import type {
  CollectionSource,
  GeneratedUI,
  GeneratedViewSection,
  PromptGenerationRequest,
  ProjectRecord,
  UIGenerationOptions,
  UIGenerationResult,
  UserProfile,
  WorkspaceDocument,
} from '@/types';

const DEFAULT_MODEL = 'canonical-briefing-v1';

export async function generateWorkspaceView(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  options?: UIGenerationOptions
): Promise<UIGenerationResult> {
  const input = createGeneratedUIBuildInput(
    documents,
    userProfile,
    options?.sourceRegistry || [],
    options?.promptRequest
  );
  const hasExplicitRouteDecisions = input.documents.some((document) => Boolean(document.routeDecision));
  const isDirectDocumentWorkspace = hasExplicitRouteDecisions
    && input.documents.length > 0
    && input.documents.every((document) => document.routeDecision?.route === 'direct');
  const projectCount = documents.reduce((sum, document) => sum + document.projectRecords.length, 0);

  if (input.promptRequest) {
    const runtimeResult = await generatePromptHtmlRuntime(
      input.documents,
      input.userProfile,
      input.promptRequest
    );

    if (!runtimeResult.success || !runtimeResult.ui) {
      return {
        success: false,
        error: runtimeResult.error || 'Prompt HTML runtime generation failed',
        rawResponse: runtimeResult.rawResponse,
        provider: runtimeResult.provider,
        model: runtimeResult.model,
      };
    }

    return {
      success: true,
      ui: runtimeResult.ui,
      error: runtimeResult.error,
      rawResponse: runtimeResult.rawResponse,
      provider: runtimeResult.provider,
      model: runtimeResult.model,
    };
  }

  if (isDirectDocumentWorkspace) {
    return toUIGenerationResult({
      ui: buildDirectDocumentView(
        input.documents,
        input.userProfile,
        options?.model || DEFAULT_MODEL,
        undefined,
        input.sourceRegistry
      ),
      provider: 'canonical-store',
      model: options?.model || DEFAULT_MODEL,
    });
  }

  if (projectCount === 0) {
    return toUIGenerationResult({
      ui: buildFallbackView(
        input.documents,
        input.userProfile,
        '事業レコードがまだないため、収集状況の最小表示に切り替えました。',
        input.sourceRegistry
      ),
      provider: 'fallback',
      model: options?.model || DEFAULT_MODEL,
    });
  }

  return toUIGenerationResult({
    ui: buildProjectDrivenView(
      input.documents,
      input.userProfile,
      options?.model || DEFAULT_MODEL,
      undefined,
      input.sourceRegistry
    ),
    provider: 'canonical-store',
    model: options?.model || DEFAULT_MODEL,
  });
}

export function buildFallbackView(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  generationError?: string,
  sourceRegistry: UIGenerationOptions['sourceRegistry'] = []
): GeneratedUI {
  return buildProjectDrivenView(documents, userProfile, 'heuristic-project-view', generationError, sourceRegistry);
}

function buildProjectDrivenView(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  model: string,
  generationError?: string,
  sourceRegistry: UIGenerationOptions['sourceRegistry'] = []
): GeneratedUI {
  const summary = buildWorkspaceSummary(documents);
  const corpus = buildPolicyCorpus(documents, sourceRegistry || []);
  const projectRows = corpus.projects.slice(0, 40);
  const sections: GeneratedViewSection[] = [
    {
      id: 'overview',
      kind: 'hero',
      title: summary.title,
      description: buildAudienceLead(summary, userProfile),
      accent: userProfile.displayConstraint === 'presentation' ? 'amber' : 'sky',
      items: [
        { label: '文書数', value: `${summary.documentCount}件`, emphasis: 'strong' },
        { label: '事業数', value: `${summary.projectCount}件`, emphasis: 'strong' },
        { label: '公開可', value: `${corpus.publicationSummary.ready}件` },
        { label: '要確認', value: `${corpus.publicationSummary.review}件` },
        { label: '公開保留', value: `${corpus.publicationSummary.blocked}件` },
      ],
      paragraphs: generationError ? [generationError] : summary.combinedSummary ? [summary.combinedSummary] : undefined,
    },
    {
      id: 'collection-registry',
      kind: 'documents',
      title: '収集台帳',
      description: '自治体ごとの取得元と収集方式です。',
      accent: 'slate',
      table: {
        columns: ['自治体', '取得元', '方式', '状態'],
        rows: corpus.sources.map((source) => [
          source.municipality,
          source.sourceUrl || '手動アップロード',
          source.discoveryStrategy,
          source.status,
        ]),
      },
    },
    {
      id: 'document-comparison',
      kind: 'documents',
      title: '文書一覧',
      description: '収集済み文書と抽出状況です。',
      accent: 'slate',
      table: {
        columns: ['文書', '自治体', '事業', '要確認', '処理状況'],
        rows: buildDocumentComparisonRows(documents),
      },
    },
    {
      id: 'project-explorer',
      kind: 'data-table',
      title: userProfile.audience === 'legislator' ? '審議対象の事業一覧' : '事業一覧',
      description: '事業名をクリックすると指標と出典メモを確認できます。',
      accent: 'emerald',
      table: {
        columns: ['事業', '自治体', '活動指標', '成果指標', '公開状態', '要確認'],
        rows: projectRows.map((project) => [
          buildProjectDisplayName(project),
          resolveMunicipality(documents, project.sourceDocumentId),
          `${countIndicators(project, 'activity')}件`,
          `${countIndicators(project, 'outcome')}件`,
          formatPublicationStatus(project),
          project.reviewFlags.length > 0 ? project.reviewFlags.join(' / ') : 'なし',
        ]),
        rowSectionIds: projectRows.map((project) => buildProjectSectionId(project.id)),
        rowLinkColumnIndex: 0,
      },
    },
  ];

  const detailSections = projectRows.map((project) => buildProjectDetailSection(documents, project));
  sections.push(...detailSections);

  return {
    id: crypto.randomUUID(),
    title: summary.title,
    summary: `${summary.projectCount}件の事業を、収集台帳・事業一覧・説明ビューとして再編成しました。`,
    schema: {
      layout: {
        density: userProfile.displayConstraint === 'mobile' ? 'compact' : 'comfortable',
        emphasis: userProfile.readingPreference,
        heroStyle: userProfile.displayConstraint === 'presentation' ? 'presentation' : 'dashboard',
      },
      sections,
    },
    timestamp: new Date().toISOString(),
    provider: 'canonical-store',
    model,
  };
}

function buildDirectDocumentView(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  model: string,
  generationError?: string,
  sourceRegistry: CollectionSource[] = [],
  promptRequest?: PromptGenerationRequest
): GeneratedUI {
  const summary = buildWorkspaceSummary(documents);
  const promptContext = buildPromptContext(documents, userProfile, promptRequest);
  const briefingDocuments = promptRequest
    ? documents
    : documents.filter((document) => document.routeDecision?.route === 'direct');
  const registryRows = buildReachableSourceRows(briefingDocuments, sourceRegistry);
  const keyPointItems = buildDirectKeyPointItems(briefingDocuments);
  const documentBriefs = briefingDocuments
    .map((document) => buildDocumentBriefParagraph(document))
    .filter(Boolean);
  const questionThreadParagraphs = promptRequest ? buildQuestionThreadParagraphs(promptRequest, briefingDocuments) : [];
  const sections: GeneratedViewSection[] = [
    {
      id: 'overview',
      kind: 'hero',
      title: summary.title,
      description: buildAudienceLead(summary, userProfile),
      accent: userProfile.displayConstraint === 'presentation' ? 'amber' : 'sky',
      items: [
        { label: '文書数', value: `${summary.documentCount}件`, emphasis: 'strong' },
        { label: '自治体', value: summary.municipalities.join('・') || '未抽出', emphasis: 'strong' },
        { label: '主要論点', value: `${keyPointItems.length}件` },
        { label: '参照元', value: `${registryRows.length}件` },
      ],
      paragraphs: [
        generationError,
        promptRequest ? `現在の質問: ${promptRequest.prompt.trim()}` : undefined,
        summary.combinedSummary,
        '政策評価の台帳ではなく、文書の要点と参照経路を先に読める briefing に再編成しました。',
      ].filter((paragraph): paragraph is string => Boolean(paragraph)),
    },
  ];

  if (questionThreadParagraphs.length > 0) {
    sections.push({
      id: 'question-thread',
      kind: 'text',
      title: '質問スレッド',
      description: 'fresh / follow-up の文脈を保持したまま briefing を更新します。',
      accent: 'amber',
      paragraphs: questionThreadParagraphs,
    });
  }

  if (keyPointItems.length > 0) {
    sections.push({
      id: 'briefing-points',
      kind: 'key-points',
      title: '主要論点',
      description: '質問前提の把握に使う論点を先頭に集約しています。',
      accent: 'emerald',
      items: keyPointItems,
    });
  }

  sections.push({
    id: 'document-briefs',
    kind: 'text',
    title: '文書ブリーフ',
    description: '各文書の要旨とレイアウト由来の補足をまとめています。',
    accent: 'slate',
    paragraphs: documentBriefs.length > 0 ? documentBriefs : ['文書要旨が未抽出のため、本文由来の briefing は生成されていません。'],
  });

  sections.push({
    id: 'provenance-trace',
    kind: 'documents',
    title: '出典と参照',
    description: '取得元、抽出経路、ルート判定は必要なときに追跡できます。',
    accent: 'slate',
    table: {
      columns: ['区分', '名称', '取得元', '参照情報'],
      rows: registryRows,
    },
  });

  return {
    id: crypto.randomUUID(),
    title: summary.title,
    summary: `${summary.documentCount}件の文書を、論点サマリー・文書ブリーフ・出典トレースとして再編成しました。`,
    schema: {
      layout: {
        density: userProfile.displayConstraint === 'mobile' ? 'compact' : 'comfortable',
        emphasis: userProfile.readingPreference,
        heroStyle: userProfile.displayConstraint === 'presentation' ? 'presentation' : 'editorial',
      },
      sections,
    },
    timestamp: new Date().toISOString(),
    provider: 'canonical-store',
    model,
    prompt: promptContext,
  };
}

function buildQuestionThreadParagraphs(
  promptRequest: PromptGenerationRequest,
  documents: WorkspaceDocument[]
): string[] {
  const previousUserTurns = promptRequest.messages.filter((message) => message.role === 'user');
  const selectedContext = promptRequest.contextDocumentId
    ? documents.find((document) => document.id === promptRequest.contextDocumentId)
    : null;

  return [
    `モード: ${promptRequest.mode}`,
    `現在の質問: ${promptRequest.prompt.trim()}`,
    previousUserTurns.length > 0
      ? `これまでの質問: ${previousUserTurns.map((message) => message.content).join(' / ')}`
      : 'これまでの質問: なし',
    selectedContext ? `PDFコンテキスト: ${selectedContext.name}` : 'PDFコンテキスト: なし',
  ];
}

function buildProjectDetailSection(documents: WorkspaceDocument[], project: ProjectRecord): GeneratedViewSection {
  const document = documents.find((entry) => entry.id === project.sourceDocumentId);
  const municipality = resolveMunicipality(documents, project.sourceDocumentId);
  const activityIndicators = project.indicators.filter((indicator) => indicator.indicatorType === 'activity');
  const outcomeIndicators = project.indicators.filter((indicator) => indicator.indicatorType === 'outcome');
  const items = [
    ...(project.projectNumber ? [{ label: '事業番号', value: project.projectNumber }] : []),
    { label: '事業名', value: project.projectName, emphasis: 'strong' as const },
    { label: '自治体', value: municipality },
    { label: '文書', value: document?.name || '未抽出' },
    { label: '概要', value: project.projectSummary },
    ...(project.department ? [{ label: '担当部局', value: project.department }] : []),
    ...(project.budget ? [{ label: '予算', value: project.budget }] : []),
    ...(project.fiscalYear ? [{ label: '年度', value: project.fiscalYear }] : []),
    ...(project.status ? [{ label: '状況', value: project.status }] : []),
    { label: '信頼度', value: `${Math.round(project.confidence * 100)}%` },
    { label: '公開状態', value: formatPublicationStatus(project) },
  ];

  activityIndicators.forEach((indicator, index) => {
    items.push({
      label: `活動指標 ${index + 1}`,
      value: formatIndicator(indicator),
    });
  });
  outcomeIndicators.forEach((indicator, index) => {
    items.push({
      label: `成果指標 ${index + 1}`,
      value: formatIndicator(indicator),
    });
  });
  if (project.sourceRefs[0]?.sourceReference) {
    items.push({
      label: '出典メモ',
      value: project.sourceRefs[0].sourceReference,
    });
  }

  return {
    id: buildProjectSectionId(project.id),
    kind: 'documents',
    title: `案件詳細: ${project.projectName}`,
    description: project.reviewFlags.length > 0
      ? `要確認: ${project.reviewFlags.join(' / ')}`
      : '出典メモ付きの事業詳細です。',
    accent: project.publicationStatus === 'blocked' ? 'amber' : project.reviewFlags.length > 0 ? 'amber' : 'slate',
    items,
  };
}

function buildProjectDisplayName(project: ProjectRecord): string {
  if (project.projectNumber && !project.projectName.startsWith(project.projectNumber)) {
    return `${project.projectNumber} ${project.projectName}`;
  }
  return project.projectName;
}

function buildProjectSectionId(projectId: string): string {
  return `detail-${projectId}`;
}

function countIndicators(project: ProjectRecord, indicatorType: 'activity' | 'outcome'): number {
  return project.indicators.filter((indicator) => indicator.indicatorType === indicatorType).length;
}

function resolveMunicipality(documents: WorkspaceDocument[], documentId: string): string {
  const document = documents.find((entry) => entry.id === documentId);
  return resolveWorkspaceDocumentDigest(document || { documentDigest: null, structuredData: null })?.municipality || '未抽出';
}

function formatIndicator(indicator: ProjectRecord['indicators'][number]): string {
  const parts = [indicator.name];
  const values = [
    indicator.plannedValue ? `計画 ${indicator.plannedValue}` : '',
    indicator.actualValue ? `実績 ${indicator.actualValue}` : '',
    indicator.targetValue ? `目標 ${indicator.targetValue}` : '',
    indicator.achievement ? `達成度 ${indicator.achievement}` : '',
  ].filter(Boolean);
  if (indicator.unit) {
    parts.push(`(${indicator.unit})`);
  }
  if (values.length > 0) {
    parts.push(values.join(' / '));
  }
  return parts.join(' ');
}

function formatPublicationStatus(project: ProjectRecord): string {
  switch (project.publicationStatus) {
    case 'ready':
      return '公開可';
    case 'blocked':
      return '公開保留';
    case 'review':
    default:
      return '要確認';
  }
}

function buildDocumentBriefParagraph(document: WorkspaceDocument): string {
  const digest = resolveWorkspaceDocumentDigest(document);
  const overview = normalizeInlineText(digest?.overview || document.structuredData?.summary || '');
  const layoutExcerpt = buildLayoutExcerpt(document.rawLayoutText);
  const category = digest?.category ? getPolicyCategoryLabel(digest.category) : undefined;
  const parts = [
    `${digest?.title || document.name}`,
    category ? `カテゴリ: ${category}` : undefined,
    overview ? `要旨: ${overview}` : undefined,
    layoutExcerpt ? `本文補足: ${layoutExcerpt}` : undefined,
  ].filter(Boolean);

  return parts.join(' / ');
}

function buildDirectKeyPointItems(documents: WorkspaceDocument[]) {
  const seen = new Set<string>();

  return documents
    .flatMap((document) => {
      const structuredKeyPoints = document.structuredData?.keyPoints || [];
      if (structuredKeyPoints.length > 0) {
        return structuredKeyPoints.map((point) => ({
          label: point.importance === 'high' ? '重要' : '論点',
          value: point.text,
          emphasis: point.importance === 'high' ? 'strong' as const : 'default' as const,
        }));
      }

      const digest = resolveWorkspaceDocumentDigest(document);
      return digest?.overview
        ? [{ label: '要旨', value: clampText(normalizeInlineText(digest.overview), 140), emphasis: 'strong' as const }]
        : [];
    })
    .filter((item) => {
      if (!item.value || seen.has(item.value)) {
        return false;
      }
      seen.add(item.value);
      return true;
    })
    .slice(0, 8);
}

function buildReachableSourceRows(documents: WorkspaceDocument[], sourceRegistry: CollectionSource[]): string[][] {
  const rows: string[][] = documents.map((document) => {
    const routeDecision = document.routeDecision;
    const reference = [
      document.ingestionPath || 'unknown',
      routeDecision ? `${routeDecision.route}/${routeDecision.reason}/${routeDecision.confidence}` : 'route:pending',
    ].join(' / ');

    return [
      '文書',
      document.name,
      document.collectionSource.sourceUrl || '手動アップロード',
      reference,
    ];
  });

  const seenRegistryIds = new Set(documents.map((document) => document.collectionSource.id));
  sourceRegistry.forEach((source) => {
    if (seenRegistryIds.has(source.id)) {
      return;
    }
    rows.push([
      '台帳',
      `${source.municipality} / ${source.label}`,
      source.sourceUrl || '未登録',
      `${source.discoveryStrategy} / ${source.status}`,
    ]);
  });

  return rows;
}

function buildLayoutExcerpt(rawLayoutText: string | null): string | undefined {
  const normalized = normalizeInlineText(rawLayoutText || '');
  if (!normalized) {
    return undefined;
  }
  return clampText(normalized, 180);
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}…`;
}
