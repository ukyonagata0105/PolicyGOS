import { describe, expect, it } from 'vitest';

import {
  VIEW_PLAN_V2_CONTENT_KINDS,
  VIEW_PLAN_V2_INTERACTION_KINDS,
  VIEW_PLAN_V2_LAYOUT_KINDS,
  VIEW_PLAN_V2_PRIMITIVE_REGISTRY,
  VIEW_PLAN_V2_TOOL_KINDS,
  VIEW_PLAN_V2_TOOL_REGISTRY,
  getViewPlanV2PrimitiveDefinition,
  getViewPlanV2ToolDefinition,
} from '@/lib/viewPlanV2';
import { validateViewPlanV2 } from '@/lib/viewPlanValidator';

function createValidPlanCandidate() {
  return {
    version: 'v2',
    root: {
      id: 'page-root',
      kind: 'page',
      title: '政策評価ビュー',
      children: [
        {
          id: 'overview-section',
          kind: 'section',
          title: 'Overview',
          children: [
            {
              id: 'overview-stack',
              kind: 'stack',
              gap: 'md',
              children: [
                {
                  id: 'hero-1',
                  kind: 'hero',
                  headline: '政策評価ダッシュボード',
                  body: '重点施策の概況です。',
                  stats: [{ label: '文書数', value: '1件', emphasis: 'strong' }],
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-1',
                    },
                  ],
                },
                {
                  id: 'grid-1',
                  kind: 'grid',
                  columns: 2,
                  children: [
                    {
                      id: 'stats-1',
                      kind: 'stat-list',
                      items: [{ label: '公開可', value: '1件', emphasis: 'strong' }],
                      evidence: [
                        {
                          sourceDocumentId: 'doc-1',
                          sourceReference: 'page-1-table-1:row-1',
                        },
                      ],
                    },
                    {
                      id: 'actions-1',
                      kind: 'action-list',
                      title: '次の操作',
                      items: [
                        {
                          label: '案件詳細へ',
                          description: '詳細カードに移動します。',
                          emphasis: 'strong',
                          tool: {
                            kind: 'navigate',
                            target: 'project-detail',
                          },
                        },
                        {
                          label: '出典を開く',
                          tool: {
                            kind: 'open-source',
                            sourceDocumentId: 'doc-1',
                            sourceReference: 'page-2',
                          },
                        },
                      ],
                      evidence: [
                        {
                          sourceDocumentId: 'doc-1',
                          sourceReference: 'page-2',
                          excerpt: '主な根拠箇所',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

interface ActionListCandidateNode {
  kind: string;
  evidence?: Array<{
    sourceDocumentId: string;
    sourceReference: string;
    excerpt?: string;
  }>;
  items: Array<{
    label: string;
    description?: string;
    emphasis?: string;
    tool: {
      kind: string;
      target?: string;
      sourceDocumentId?: string;
      sourceReference?: string;
    };
  }>;
}

function getActionListNode(candidate: ReturnType<typeof createValidPlanCandidate>) {
  const section = candidate.root.children[0];
  const stack = section?.children[0];
  const grid = stack?.children[1];
  if (!grid || grid.kind !== 'grid') {
    throw new Error('Expected grid fixture node');
  }

  const gridNode = grid as { kind: string; children: unknown[] };
  const actionList = gridNode.children[1] as { kind?: string } | undefined;
  if (!actionList || actionList.kind !== 'action-list') {
    throw new Error('Expected action-list fixture node');
  }

  return actionList as ActionListCandidateNode;
}

describe('viewPlanV2 registry', () => {
  it('exposes only approved user-facing primitives and tools', () => {
    expect(VIEW_PLAN_V2_LAYOUT_KINDS).toEqual(['page', 'section', 'stack', 'grid']);
    expect(VIEW_PLAN_V2_CONTENT_KINDS).toEqual(['hero', 'stat-list', 'bullet-list', 'table', 'detail-card', 'callout']);
    expect(VIEW_PLAN_V2_INTERACTION_KINDS).toEqual(['action-list']);
    expect(VIEW_PLAN_V2_TOOL_KINDS).toEqual(['navigate', 'open-source']);
    expect(Object.values(VIEW_PLAN_V2_PRIMITIVE_REGISTRY).every((definition) => definition.surface === 'user')).toBe(true);
    expect(Object.values(VIEW_PLAN_V2_TOOL_REGISTRY).every((definition) => definition.surface === 'user')).toBe(true);
    expect(getViewPlanV2PrimitiveDefinition('html')).toBeNull();
    expect(getViewPlanV2PrimitiveDefinition('review-panel')).toBeNull();
    expect(getViewPlanV2ToolDefinition('debug-json')).toBeNull();
    expect(getViewPlanV2ToolDefinition('open-review-panel')).toBeNull();
  });
});

describe('validateViewPlanV2', () => {
  it('accepts a bounded v2 primitive tree with approved interaction tools', () => {
    const result = validateViewPlanV2(createValidPlanCandidate());

    expect(result).toEqual({
      ok: true,
      plan: {
        version: 'v2',
        root: {
          id: 'page-root',
          kind: 'page',
          title: '政策評価ビュー',
          children: [
            {
              id: 'overview-section',
              kind: 'section',
              title: 'Overview',
              children: [
                {
                  id: 'overview-stack',
                  kind: 'stack',
                  gap: 'md',
                  children: [
                    {
                      id: 'hero-1',
                      kind: 'hero',
                      headline: '政策評価ダッシュボード',
                      body: '重点施策の概況です。',
                      stats: [{ label: '文書数', value: '1件', emphasis: 'strong' }],
                      evidence: [
                        {
                          sourceDocumentId: 'doc-1',
                          sourceReference: 'page-1',
                        },
                      ],
                    },
                    {
                      id: 'grid-1',
                      kind: 'grid',
                      columns: 2,
                      children: [
                        {
                          id: 'stats-1',
                          kind: 'stat-list',
                          items: [{ label: '公開可', value: '1件', emphasis: 'strong' }],
                          evidence: [
                            {
                              sourceDocumentId: 'doc-1',
                              sourceReference: 'page-1-table-1:row-1',
                            },
                          ],
                        },
                        {
                          id: 'actions-1',
                          kind: 'action-list',
                          title: '次の操作',
                          items: [
                            {
                              label: '案件詳細へ',
                              description: '詳細カードに移動します。',
                              emphasis: 'strong',
                              tool: {
                                kind: 'navigate',
                                target: 'project-detail',
                              },
                            },
                            {
                              label: '出典を開く',
                              tool: {
                                kind: 'open-source',
                                sourceDocumentId: 'doc-1',
                                sourceReference: 'page-2',
                              },
                            },
                          ],
                          evidence: [
                            {
                              sourceDocumentId: 'doc-1',
                              sourceReference: 'page-2',
                              excerpt: '主な根拠箇所',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('rejects arbitrary html primitives', () => {
    const candidate = createValidPlanCandidate();
    getActionListNode(candidate).kind = 'html';

    const result = validateViewPlanV2(candidate);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [
        {
          code: 'unknown_node_kind',
          path: 'root.children[0].children[0].children[1].children[1].kind',
        },
      ],
    });
  });

  it('rejects non-approved review or debug tools', () => {
    const candidate = createValidPlanCandidate();
    getActionListNode(candidate).items[0].tool.kind = 'debug-json';

    const result = validateViewPlanV2(candidate);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [
        {
          code: 'unknown_tool_kind',
          path: 'root.children[0].children[0].children[1].children[1].items[0].tool.kind',
        },
      ],
    });
  });

  it('rejects missing evidence bindings for leaf primitives', () => {
    const candidate = createValidPlanCandidate();
    delete getActionListNode(candidate).evidence;

    const result = validateViewPlanV2(candidate);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [
        {
          code: 'missing_evidence_binding',
          path: 'root.children[0].children[0].children[1].children[1].evidence',
        },
      ],
    });
  });

  it('rejects invalid layout structures', () => {
    const candidate = {
      version: 'v2',
      root: {
        id: 'page-root',
        kind: 'page',
        children: [
          {
            id: 'overview-section',
            kind: 'section',
            children: [
              {
                id: 'hero-direct',
                kind: 'hero',
                headline: '直接配置',
                body: 'section 直下の hero は不可です。',
                evidence: [
                  {
                    sourceDocumentId: 'doc-1',
                    sourceReference: 'page-3',
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = validateViewPlanV2(candidate);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      issues: [
        {
          code: 'invalid_layout_structure',
          path: 'root.children[0].children[0]',
        },
      ],
    });
  });
});
