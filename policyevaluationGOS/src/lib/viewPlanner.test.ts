import { describe, expect, it } from 'vitest';

import { isV1FallbackSignal, postProcessViewPlanV2Candidate } from '@/lib/viewPlanner';

function createValidPlanCandidate() {
  return {
    version: 'v2',
    root: {
      id: 'page-root',
      kind: 'page',
      title: '  政策評価ビュー  ',
      children: [
        {
          id: 'section-1',
          kind: 'section',
          children: [
            {
              id: 'stack-1',
              kind: 'stack',
              gap: 'lg',
              children: [
                {
                  id: 'hero-1',
                  kind: 'hero',
                  headline: '  政策評価サマリー  ',
                  body: '  主要成果を概観します。  ',
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-1',
                      excerpt: 'サマリー',
                    },
                  ],
                },
                {
                  id: 'actions-1',
                  kind: 'action-list',
                  title: '  次の操作  ',
                  items: [
                    {
                      label: '  詳細へ  ',
                      description: '  案件詳細に移動します。  ',
                      emphasis: 'strong',
                      tool: {
                        kind: 'navigate',
                        target: '  detail-project-1  ',
                      },
                    },
                    {
                      label: '  出典を開く  ',
                      tool: {
                        kind: 'open-source',
                        sourceDocumentId: '  doc-1  ',
                        sourceReference: '  page-2  ',
                      },
                    },
                  ],
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-2',
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
  const actionList = stack?.children[1];
  if (!actionList || actionList.kind !== 'action-list') {
    throw new Error('Expected action-list fixture node');
  }

  return actionList as ActionListCandidateNode;
}

describe('postProcessViewPlanV2Candidate', () => {
  it('returns a normalized v2 plan for valid bounded primitives and tools', () => {
    const result = postProcessViewPlanV2Candidate(createValidPlanCandidate());

    expect(result).toEqual({
      status: 'ready',
      version: 'v2',
      plan: {
        version: 'v2',
        root: {
          id: 'page-root',
          kind: 'page',
          title: '政策評価ビュー',
          children: [
            {
              id: 'section-1',
              kind: 'section',
              children: [
                {
                  id: 'stack-1',
                  kind: 'stack',
                  gap: 'lg',
                  children: [
                    {
                      id: 'hero-1',
                      kind: 'hero',
                      headline: '政策評価サマリー',
                      body: '主要成果を概観します。',
                      evidence: [
                        {
                          sourceDocumentId: 'doc-1',
                          sourceReference: 'page-1',
                          excerpt: 'サマリー',
                        },
                      ],
                    },
                    {
                      id: 'actions-1',
                      kind: 'action-list',
                      title: '次の操作',
                      items: [
                        {
                          label: '詳細へ',
                          description: '案件詳細に移動します。',
                          emphasis: 'strong',
                          tool: {
                            kind: 'navigate',
                            target: 'detail-project-1',
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

  it('emits a machine-checkable fallback signal to v1 when registry validation fails', () => {
    const candidate = createValidPlanCandidate();
    getActionListNode(candidate).items[0].tool.kind = 'debug-json';

    const result = postProcessViewPlanV2Candidate(candidate);

    expect(result.status).toBe('fallback');
    if (result.status !== 'fallback') {
      throw new Error('Expected fallback result');
    }

    expect(isV1FallbackSignal(result.fallback)).toBe(true);
    expect(result.fallback).toMatchObject({
      signal: 'fallback_to_v1',
      targetVersion: 'v1',
      attemptedVersion: 'v2',
      reasonCode: 'validation_failed',
      issues: [
        {
          code: 'unknown_tool_kind',
          path: 'root.children[0].children[0].children[1].items[0].tool.kind',
        },
      ],
    });
  });
});
