import { describe, expect, it } from 'vitest';

import { buildViewPlanV2FromWorkspace } from '@/lib/viewPlannerFromWorkspace';
import { validateViewPlanV2 } from '@/lib/viewPlanValidator';
import { createGeneratedUIConsumerDocument } from '@/test/generatedUICompat';
import type { UserProfile } from '@/types';

describe('buildViewPlanV2FromWorkspace', () => {
  it('creates a valid prompt-conditioned plan from canonical workspace data', () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const document = createGeneratedUIConsumerDocument();

    const plan = buildViewPlanV2FromWorkspace([document], profile, []);
    const validation = validateViewPlanV2(plan);

    expect(validation.ok).toBe(true);
    expect(plan.root.title).toContain('地域交通再編計画');
    expect(plan.root.children[0]?.children[0]?.children.some((child) => child.kind === 'hero')).toBe(true);
  });

  it('changes plan composition based on user profile', () => {
    const document = createGeneratedUIConsumerDocument();

    const residentPlan = buildViewPlanV2FromWorkspace(
      [document],
      { audience: 'resident', readingPreference: 'summary', displayConstraint: 'desktop' },
      []
    );
    const legislatorPlan = buildViewPlanV2FromWorkspace(
      [document],
      { audience: 'legislator', readingPreference: 'comparison', displayConstraint: 'desktop' },
      []
    );

    expect(residentPlan.root.description).not.toBe(legislatorPlan.root.description);
    expect(JSON.stringify(residentPlan)).not.toBe(JSON.stringify(legislatorPlan));
  });

  it('keeps the current runtime plan project rows and publication summary for table-derived records', () => {
    const document = createGeneratedUIConsumerDocument('table-route.pdf');
    document.projectRecords = [
      document.projectRecords[0]!,
      {
        id: 'project-review',
        sourceDocumentId: document.id,
        projectName: '予約型交通導入事業',
        projectSummary: 'デマンド交通の実証を進める。',
        sourceRefs: [
          {
            documentId: document.id,
            documentName: document.name,
            sourceReference: 'page-1-table-1:row-2',
          },
        ],
        indicators: [],
        confidence: 0.68,
        reviewFlags: ['指標未抽出'],
        publicationStatus: 'review',
        publicationNotes: ['要確認表示'],
      },
      {
        id: 'project-blocked',
        sourceDocumentId: document.id,
        projectName: 'AI配車最適化事業',
        projectSummary: '個票単位の秘匿情報を含むため公開保留。',
        sourceRefs: [
          {
            documentId: document.id,
            documentName: document.name,
            sourceReference: 'page-1-table-1:row-3',
          },
        ],
        indicators: [],
        confidence: 0.74,
        reviewFlags: ['匿名化確認待ち'],
        publicationStatus: 'blocked',
        publicationNotes: ['匿名化後に再判定'],
      },
    ];

    const plan = buildViewPlanV2FromWorkspace(
      [document],
      { audience: 'resident', readingPreference: 'summary', displayConstraint: 'desktop' },
      []
    );
    const overviewStack = plan.root.children[0]?.children[0];
    expect(overviewStack?.kind).toBe('stack');
    if (!overviewStack || overviewStack.kind !== 'stack') {
      throw new Error('Expected overview stack node');
    }
    const hero = overviewStack.children[0];
    const summaryGrid = overviewStack.children[1];
    expect(summaryGrid?.kind).toBe('grid');
    if (!summaryGrid || summaryGrid.kind !== 'grid') {
      throw new Error('Expected summary grid node');
    }
    const publicationStats = summaryGrid?.children[0];
    const actions = summaryGrid?.children[1];
    const projectsTable = summaryGrid?.children[2];
    const details = plan.root.children[1]?.children[0]?.children;

    expect(hero).toMatchObject({
      kind: 'hero',
      headline: '地域交通再編計画',
      stats: [
        { label: '文書数', value: '1件', emphasis: 'strong' },
        { label: '事業数', value: '3件', emphasis: 'strong' },
        { label: '要確認', value: '1件' },
      ],
    });
    expect(publicationStats).toMatchObject({
      kind: 'stat-list',
      items: [
        { label: '公開可', value: '1件', emphasis: 'strong' },
        { label: '要確認', value: '1件' },
        { label: '公開保留', value: '1件' },
      ],
    });
    expect(actions).toMatchObject({
      kind: 'action-list',
    });
    expect(actions?.kind === 'action-list' ? actions.items[0] : null).toMatchObject({
      tool: { kind: 'navigate', target: 'detail-project-1' },
    });
    expect(projectsTable).toMatchObject({
      kind: 'table',
      title: '事業一覧',
      data: {
        columns: ['事業', '自治体', '公開状態'],
        rows: [
          ['地域交通再編事業', '岩手県', 'ready'],
          ['予約型交通導入事業', '岩手県', 'review'],
          ['AI配車最適化事業', '岩手県', 'blocked'],
        ],
      },
    });
    expect(details).toMatchObject([
      {
        id: 'detail-project-1',
        title: '地域交通再編事業',
        items: [
          { label: '事業番号', value: '1-1' },
          { label: '自治体', value: '岩手県' },
          { label: '概要', value: '地域交通ネットワークを再編する。' },
          { label: '公開状態', value: 'ready' },
        ],
      },
      {
        id: 'detail-project-review',
        title: '予約型交通導入事業',
        items: [
          { label: '自治体', value: '岩手県' },
          { label: '概要', value: 'デマンド交通の実証を進める。' },
          { label: '公開状態', value: 'review' },
        ],
      },
      {
        id: 'detail-project-blocked',
        title: 'AI配車最適化事業',
        items: [
          { label: '自治体', value: '岩手県' },
          { label: '概要', value: '個票単位の秘匿情報を含むため公開保留。' },
          { label: '公開状態', value: 'blocked' },
        ],
      },
    ]);
  });

  it('creates a valid direct-document runtime plan without project rows', () => {
    const document = createGeneratedUIConsumerDocument('direct-route.pdf');
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
    document.projectRecords = [];
    document.normalizedRows = [];
    document.originalNormalizedRows = [];
    document.rawLayoutText = '地域交通の再編方針を示し、住民移動の利便性を改善する。';
    document.structuredData = {
      ...document.structuredData!,
      keyPoints: [
        { text: '交通結節点の接続改善を優先する。' },
        { text: '住民向けの移動支援を強化する。' },
      ],
    };

    const plan = buildViewPlanV2FromWorkspace(
      [document],
      { audience: 'resident', readingPreference: 'summary', displayConstraint: 'desktop' },
      []
    );
    const validation = validateViewPlanV2(plan);

    expect(validation.ok).toBe(true);
    expect(plan.root.description).toBe('route-aware briefing for resident');
    expect(plan.root.children[0]?.id).toBe('direct-overview-section');
    expect(plan.root.children[1]?.id).toBe('direct-details-section');

    const overviewStack = plan.root.children[0]?.children[0];
    expect(overviewStack?.kind).toBe('stack');
    if (!overviewStack || overviewStack.kind !== 'stack') {
      throw new Error('Expected direct overview stack node');
    }

    const hero = overviewStack.children[0];
    const summaryGrid = overviewStack.children[1];
    expect(hero).toMatchObject({
      kind: 'hero',
      headline: '地域交通再編計画',
      stats: [
        { label: '文書数', value: '1件', emphasis: 'strong' },
        { label: '自治体', value: '1件', emphasis: 'strong' },
        { label: '論点数', value: '3件' },
      ],
    });
    expect(summaryGrid?.kind).toBe('grid');
    if (!summaryGrid || summaryGrid.kind !== 'grid') {
      throw new Error('Expected direct summary grid node');
    }

    expect(summaryGrid.children.some((child) => child.kind === 'table')).toBe(false);
    const contextStats = summaryGrid.children[0];
    const actions = summaryGrid.children[1];
    const bullets = summaryGrid.children[2];
    const callout = summaryGrid.children[3];

    expect(contextStats).toMatchObject({
      kind: 'stat-list',
      title: '文書コンテキスト',
      items: [
        { label: '文書数', value: '1件', emphasis: 'strong' },
        { label: '自治体', value: '岩手県' },
        { label: 'カテゴリ', value: 'インフラ' },
      ],
    });
    expect(actions).toMatchObject({ kind: 'action-list' });
    expect(actions?.kind === 'action-list' ? actions.items[0] : null).toMatchObject({
      tool: { kind: 'navigate', target: `direct-detail-${document.id}` },
    });
    expect(bullets).toMatchObject({
      kind: 'bullet-list',
    });
    expect(bullets?.kind === 'bullet-list' ? bullets.items : []).toEqual([
      '交通結節点の接続改善を優先する。',
      '住民向けの移動支援を強化する。',
      '住民移動の利便性を改善する計画です。',
    ]);
    expect(callout).toMatchObject({ kind: 'callout' });

    const details = plan.root.children[1]?.children[0]?.children;
    expect(details?.[0]).toMatchObject({
      id: `direct-detail-${document.id}`,
      title: '地域交通再編計画',
      items: [
        { label: '文書', value: 'direct-route.pdf' },
        { label: '自治体', value: '岩手県' },
        { label: 'カテゴリ', value: 'インフラ' },
        { label: '概要', value: '住民移動の利便性を改善する計画です。' },
      ],
    });
    expect(details?.[0]?.kind === 'detail-card' ? details[0].evidence[0] : null).toMatchObject({
      sourceDocumentId: document.id,
      sourceReference: 'document-digest',
    });
  });
});
