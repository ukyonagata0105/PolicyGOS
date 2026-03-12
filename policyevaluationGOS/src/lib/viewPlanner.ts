import type { ViewPlanV2, ViewPlanV2Node } from '@/lib/viewPlanV2';
import { validateViewPlanV2 } from '@/lib/viewPlanValidator';
import type { ViewPlanV2ValidationIssue } from '@/lib/viewPlanValidator';

export type ViewPlannerFallbackReasonCode = 'validation_failed';

export interface ViewPlannerV1FallbackSignal {
  signal: 'fallback_to_v1';
  targetVersion: 'v1';
  attemptedVersion: 'v2';
  reasonCode: ViewPlannerFallbackReasonCode;
  issues: ViewPlanV2ValidationIssue[];
}

export type ViewPlannerResult =
  | {
      status: 'ready';
      version: 'v2';
      plan: ViewPlanV2;
    }
  | {
      status: 'fallback';
      fallback: ViewPlannerV1FallbackSignal;
    };

export function postProcessViewPlanV2Candidate(candidate: unknown): ViewPlannerResult {
  const validation = validateViewPlanV2(candidate);
  if (!validation.ok) {
    return {
      status: 'fallback',
      fallback: createV1FallbackSignal(validation.issues),
    };
  }

  return {
    status: 'ready',
    version: 'v2',
    plan: normalizeViewPlanV2(validation.plan),
  };
}

export function createV1FallbackSignal(issues: ViewPlanV2ValidationIssue[]): ViewPlannerV1FallbackSignal {
  return {
    signal: 'fallback_to_v1',
    targetVersion: 'v1',
    attemptedVersion: 'v2',
    reasonCode: 'validation_failed',
    issues,
  };
}

export function isV1FallbackSignal(value: unknown): value is ViewPlannerV1FallbackSignal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.signal === 'fallback_to_v1'
    && record.targetVersion === 'v1'
    && record.attemptedVersion === 'v2'
    && record.reasonCode === 'validation_failed'
    && Array.isArray(record.issues);
}

function normalizeViewPlanV2(plan: ViewPlanV2): ViewPlanV2 {
  return {
    version: plan.version,
    root: normalizeNode(plan.root),
  };
}

function normalizeNode<Node extends ViewPlanV2Node>(node: Node): Node {
  switch (node.kind) {
    case 'page':
    case 'section':
    case 'stack':
    case 'grid':
      return {
        ...node,
        children: node.children.map((child) => normalizeNode(child)),
      } as Node;
    case 'hero':
      return {
        ...node,
        headline: node.headline.trim(),
        body: node.body.trim(),
        stats: node.stats?.map((item) => ({ ...item })),
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
    case 'stat-list':
      return {
        ...node,
        items: node.items.map((item) => ({ ...item })),
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
    case 'bullet-list':
      return {
        ...node,
        items: [...node.items],
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
    case 'table':
      return {
        ...node,
        data: {
          columns: [...node.data.columns],
          rows: node.data.rows.map((row) => [...row]),
        },
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
    case 'detail-card':
      return {
        ...node,
        items: node.items.map((item) => ({ ...item })),
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
    case 'callout':
      return {
        ...node,
        body: node.body.trim(),
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
    case 'action-list':
      return {
        ...node,
        items: node.items.map((item) => ({
          ...item,
          label: item.label.trim(),
          ...(item.description ? { description: item.description.trim() } : {}),
          tool: { ...item.tool },
        })),
        evidence: node.evidence.map((binding) => ({ ...binding })),
      } as Node;
  }
}
