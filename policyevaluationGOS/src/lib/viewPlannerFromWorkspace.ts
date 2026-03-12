import {
  buildActionHints,
  buildPromptContext,
  buildPolicyCorpus,
  buildWorkspaceSummary,
  getPolicyCategoryLabel,
} from '@/lib/workspace';
import { resolveWorkspaceDocumentDigest } from '@/lib/pipelineContracts';
import type {
  ViewPlanEvidenceBinding,
  ViewPlanV2ActionItem,
  ViewPlanV2,
  ViewPlanV2DetailCardNode,
} from '@/lib/viewPlanV2';
import type {
  CollectionSource,
  PolicyCategory,
  PromptGenerationRequest,
  UserProfile,
  WorkspaceDocument,
} from '@/types';

const DIRECT_DETAIL_ID_PREFIX = 'direct-detail';

export function buildViewPlanV2FromWorkspace(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  sourceRegistry: CollectionSource[] = [],
  promptRequest?: PromptGenerationRequest
): ViewPlanV2 {
  if (promptRequest) {
    return buildDirectDocumentPlan(documents, userProfile, promptRequest);
  }

  const tableDocuments = documents.filter((document) => resolvePlanningRoute(document) === 'table');
  const directDocuments = documents.filter((document) => resolvePlanningRoute(document) === 'direct');

  if (directDocuments.length === 0) {
    return buildTableDrivenPlan(tableDocuments, userProfile, sourceRegistry);
  }

  if (tableDocuments.length === 0) {
    return buildDirectDocumentPlan(directDocuments, userProfile);
  }

  return buildMixedRoutePlan(tableDocuments, directDocuments, userProfile, sourceRegistry);
}

function buildTableDrivenPlan(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  sourceRegistry: CollectionSource[] = []
): ViewPlanV2 {
  const summary = buildWorkspaceSummary(documents);
  const corpus = buildPolicyCorpus(documents, sourceRegistry);
  const promptContext = buildPromptContext(documents, userProfile);
  const projectRows = corpus.projects.slice(0, 8);
  const actionHints = buildActionHints(summary, userProfile);

  return {
    version: 'v2',
    root: {
      id: 'page-root',
      kind: 'page',
      title: summary.title,
      description: `prompt-conditioned briefing for ${userProfile.audience}`,
      children: [
        {
          id: 'overview-section',
          kind: 'section',
          title: 'Overview',
          children: [
            {
              id: 'overview-stack',
              kind: 'stack',
              gap: 'lg',
              children: [
                {
                  id: 'hero-1',
                  kind: 'hero',
                  title: 'Prompt-conditioned overview',
                  headline: summary.title,
                  body: summary.combinedSummary || '文書セット全体の要点を反映した runtime view です。',
                  stats: [
                    { label: '文書数', value: `${summary.documentCount}件`, emphasis: 'strong' },
                    { label: '事業数', value: `${summary.projectCount}件`, emphasis: 'strong' },
                    { label: '要確認', value: `${corpus.publicationSummary.review}件` },
                  ],
                  evidence: bindDocuments(documents).slice(0, 3),
                },
                {
                  id: 'summary-grid',
                  kind: 'grid',
                  columns: userProfile.displayConstraint === 'mobile' ? 1 : 2,
                  children: [
                    {
                      id: 'stats-1',
                      kind: 'stat-list',
                      title: '公開状況',
                      items: [
                        { label: '公開可', value: `${corpus.publicationSummary.ready}件`, emphasis: 'strong' },
                        { label: '要確認', value: `${corpus.publicationSummary.review}件` },
                        { label: '公開保留', value: `${corpus.publicationSummary.blocked}件` },
                      ],
                      evidence: bindDocuments(documents).slice(0, 2),
                    },
                    {
                      id: 'actions-1',
                      kind: 'action-list',
                      title: '次の操作',
                      description: promptContext.slice(0, 120),
                      items: actionHints.slice(0, 3).map((hint, index) => ({
                        label: hint,
                        emphasis: index === 0 ? 'strong' : 'default',
                        tool: index === 0
                          ? { kind: 'navigate', target: projectRows[0] ? `detail-${projectRows[0].id}` : 'document-table' }
                          : { kind: 'open-source', sourceDocumentId: documents[0]?.id || 'unknown', sourceReference: documents[0]?.projectRecords[0]?.sourceRefs[0]?.sourceReference || documents[0]?.name || 'workspace' },
                      })),
                      evidence: bindDocuments(documents).slice(0, 2),
                    },
                    {
                      id: 'projects-1',
                      kind: 'table',
                      title: userProfile.audience === 'legislator' ? '審議候補' : '事業一覧',
                      data: {
                        columns: ['事業', '自治体', '公開状態'],
                        rows: projectRows.map((project) => [
                          project.projectName,
                          resolveMunicipality(documents, project.sourceDocumentId),
                          project.publicationStatus,
                        ]),
                      },
                      evidence: projectRows.flatMap((project) => bindProject(project.sourceDocumentId, project.sourceRefs[0]?.sourceReference)).slice(0, 8),
                    },
                    {
                      id: 'callout-1',
                      kind: 'callout',
                      title: 'Runtime note',
                      tone: userProfile.readingPreference === 'comparison' ? 'info' : 'neutral',
                      body: `readingPreference=${userProfile.readingPreference} / displayConstraint=${userProfile.displayConstraint}`,
                      evidence: bindDocuments(documents).slice(0, 1),
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'details-section',
          kind: 'section',
          title: 'Details',
          children: [
            {
              id: 'details-stack',
              kind: 'stack',
              gap: 'md',
              children: projectRows.map((project) => ({
                id: `detail-${project.id}`,
                kind: 'detail-card' as const,
                title: project.projectName,
                items: [
                  ...(project.projectNumber ? [{ label: '事業番号', value: project.projectNumber }] : []),
                  { label: '自治体', value: resolveMunicipality(documents, project.sourceDocumentId) },
                  { label: '概要', value: project.projectSummary },
                  { label: '公開状態', value: project.publicationStatus },
                ],
                evidence: bindProject(project.sourceDocumentId, project.sourceRefs[0]?.sourceReference),
              })),
            },
          ],
        },
      ],
    },
  };
}

function buildDirectDocumentPlan(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  promptRequest?: PromptGenerationRequest
): ViewPlanV2 {
  const summary = buildWorkspaceSummary(documents);
  const promptContext = buildPromptContext(documents, userProfile, promptRequest);
  const actionHints = buildActionHints(summary, userProfile);
  const keyPoints = collectDirectBulletItems(documents);
  const detailCards = buildDirectDetailCards(documents);

  return {
    version: 'v2',
    root: {
      id: 'page-root',
      kind: 'page',
      title: summary.title,
      description: `route-aware briefing for ${userProfile.audience}`,
      children: [
        {
          id: 'direct-overview-section',
          kind: 'section',
          title: 'Overview',
          children: [
            {
              id: 'direct-overview-stack',
              kind: 'stack',
              gap: 'lg',
              children: [
                {
                  id: 'direct-hero-1',
                  kind: 'hero',
                   title: 'Direct-document overview',
                   headline: summary.title,
                   body: promptRequest
                     ? `現在の質問: ${promptRequest.prompt.trim()}`
                     : summary.combinedSummary || documents[0]?.processing.message || '文書本文から要点を整理した runtime view です。',
                   stats: [
                     { label: '文書数', value: `${summary.documentCount}件`, emphasis: 'strong' },
                     { label: '自治体', value: `${summary.municipalities.length || 1}件`, emphasis: 'strong' },
                    { label: '論点数', value: `${keyPoints.length}件` },
                  ],
                  evidence: bindDirectDocuments(documents).slice(0, 4),
                },
                {
                  id: 'direct-summary-grid',
                  kind: 'grid',
                  columns: userProfile.displayConstraint === 'mobile' ? 1 : 2,
                  children: [
                    {
                      id: 'direct-stats-1',
                      kind: 'stat-list',
                      title: '文書コンテキスト',
                      items: [
                        { label: '文書数', value: `${summary.documentCount}件`, emphasis: 'strong' },
                        { label: '自治体', value: summary.municipalities.join('・') || '未抽出' },
                        { label: 'カテゴリ', value: summarizeCategories(documents) },
                      ],
                      evidence: bindDirectDocuments(documents).slice(0, 3),
                    },
                    {
                      id: 'direct-actions-1',
                      kind: 'action-list',
                      title: '次の操作',
                      description: promptContext.slice(0, 120),
                      items: buildDirectActionItems(documents, actionHints),
                      evidence: bindDirectDocuments(documents).slice(0, 3),
                    },
                    {
                      id: 'direct-bullets-1',
                      kind: 'bullet-list',
                      title: '主要論点',
                      items: keyPoints,
                      evidence: bindDirectDocuments(documents).slice(0, 3),
                    },
                    {
                       id: 'direct-callout-1',
                       kind: 'callout',
                       title: 'Prompt note',
                       tone: userProfile.readingPreference === 'comparison' ? 'info' : 'neutral',
                       body: promptContext.slice(0, 220) || '質問条件を反映した briefing route です。',
                       evidence: bindDirectDocuments(documents).slice(0, 2),
                     },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'direct-details-section',
          kind: 'section',
          title: 'Details',
          children: [
            {
              id: 'direct-details-stack',
              kind: 'stack',
              gap: 'md',
              children: detailCards,
            },
          ],
        },
      ],
    },
  };
}

function buildMixedRoutePlan(
  tableDocuments: WorkspaceDocument[],
  directDocuments: WorkspaceDocument[],
  userProfile: UserProfile,
  sourceRegistry: CollectionSource[] = []
): ViewPlanV2 {
  const tablePlan = buildTableDrivenPlan(tableDocuments, userProfile, sourceRegistry);
  const directSections = buildDirectDocumentPlan(directDocuments, userProfile).root.children;
  const summary = buildWorkspaceSummary([...directDocuments, ...tableDocuments]);

  return {
    version: 'v2',
    root: {
      ...tablePlan.root,
      title: summary.title,
      description: `route-aware briefing for ${userProfile.audience}`,
      children: [
        tablePlan.root.children[0],
        ...directSections,
        tablePlan.root.children[1],
      ],
    },
  };
}

function buildDirectDetailCards(documents: WorkspaceDocument[]): ViewPlanV2DetailCardNode[] {
  return documents.map((document) => {
    const digest = resolveWorkspaceDocumentDigest(document);
    const policy = document.structuredData;
    const category = digest?.category || policy?.category;

    return {
      id: `${DIRECT_DETAIL_ID_PREFIX}-${document.id}`,
      kind: 'detail-card',
      title: digest?.title || policy?.title || document.name,
      items: [
        { label: '文書', value: document.name },
        { label: '自治体', value: digest?.municipality || policy?.municipality || '未抽出' },
        { label: 'カテゴリ', value: category ? getPolicyCategoryLabel(category) : '未分類' },
        { label: '概要', value: resolveNarrativeSummary(document) },
      ],
      evidence: bindDirectDocument(document),
    };
  });
}

function buildDirectActionItems(documents: WorkspaceDocument[], actionHints: string[]): ViewPlanV2ActionItem[] {
  const primaryDocument = documents[0];

  return actionHints.slice(0, 3).map((hint, index): ViewPlanV2ActionItem => ({
    label: hint,
    emphasis: index === 0 ? 'strong' : 'default',
    tool: index === 0 && primaryDocument
      ? { kind: 'navigate', target: `${DIRECT_DETAIL_ID_PREFIX}-${primaryDocument.id}` }
      : {
          kind: 'open-source',
          sourceDocumentId: primaryDocument?.id || 'unknown',
          sourceReference: bindDirectDocument(primaryDocument)[0]?.sourceReference || 'workspace',
        },
  }));
}

function collectDirectBulletItems(documents: WorkspaceDocument[]): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  for (const document of documents) {
    for (const point of document.structuredData?.keyPoints || []) {
      const text = normalizeSnippet(point.text);
      if (text && !seen.has(text)) {
        seen.add(text);
        items.push(text);
      }
      if (items.length >= 6) {
        return items;
      }
    }

    const summary = resolveNarrativeSummary(document);
    if (summary && !seen.has(summary)) {
      seen.add(summary);
      items.push(summary);
    }
    if (items.length >= 6) {
      return items;
    }
  }

  return items.length > 0 ? items : ['主要論点は文書本文から確認できます。'];
}

function summarizeCategories(documents: WorkspaceDocument[]): string {
  const labels = Array.from(new Set(documents
    .map((document) => resolveWorkspaceDocumentDigest(document)?.category || document.structuredData?.category)
    .filter((category): category is PolicyCategory => Boolean(category))
    .map((category) => getPolicyCategoryLabel(category))));

  return labels.join('・') || '未分類';
}

function resolveNarrativeSummary(document: WorkspaceDocument): string {
  const digest = resolveWorkspaceDocumentDigest(document);
  const rawLayoutSummary = normalizeSnippet(document.rawLayoutText);

  return normalizeSnippet(
    digest?.overview
    || document.structuredData?.summary
    || rawLayoutSummary
    || document.processing.message
    || document.name
  );
}

function bindDocuments(documents: WorkspaceDocument[]) {
  return documents.flatMap((document) => bindProject(document.id, document.projectRecords[0]?.sourceRefs[0]?.sourceReference || document.name));
}

function bindDirectDocuments(documents: WorkspaceDocument[]): ViewPlanEvidenceBinding[] {
  return documents.flatMap((document) => bindDirectDocument(document));
}

function bindDirectDocument(document?: WorkspaceDocument): ViewPlanEvidenceBinding[] {
  if (!document) {
    return [{ sourceDocumentId: 'unknown', sourceReference: 'workspace' }];
  }

  const bindings: ViewPlanEvidenceBinding[] = [];
  const digest = resolveWorkspaceDocumentDigest(document);

  if (digest?.overview) {
    bindings.push({
      sourceDocumentId: document.id,
      sourceReference: 'document-digest',
      excerpt: trimExcerpt(digest.overview),
    });
  }

  if (document.structuredData?.summary) {
    bindings.push({
      sourceDocumentId: document.id,
      sourceReference: 'structured-summary',
      excerpt: trimExcerpt(document.structuredData.summary),
    });
  }

  if (document.rawLayoutText) {
    bindings.push({
      sourceDocumentId: document.id,
      sourceReference: 'raw-layout-text',
      excerpt: trimExcerpt(document.rawLayoutText),
    });
  }

  if (bindings.length === 0) {
    bindings.push({
      sourceDocumentId: document.id,
      sourceReference: document.name || 'workspace',
    });
  }

  return bindings;
}

function bindProject(sourceDocumentId: string, sourceReference?: string) {
  return [
    {
      sourceDocumentId,
      sourceReference: sourceReference || 'workspace',
    },
  ];
}

function resolveMunicipality(documents: WorkspaceDocument[], documentId: string): string {
  const document = documents.find((entry) => entry.id === documentId);
  return resolveWorkspaceDocumentDigest(document || { documentDigest: null, structuredData: null })?.municipality || '未抽出';
}

function resolvePlanningRoute(document: WorkspaceDocument): 'table' | 'direct' {
  return document.routeDecision?.route === 'direct' ? 'direct' : 'table';
}

function trimExcerpt(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157).trim()}...`;
}

function normalizeSnippet(value: string | undefined | null): string {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}
