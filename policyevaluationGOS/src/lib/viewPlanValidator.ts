import {
  VIEW_PLAN_V2_LEAF_KINDS,
  VIEW_PLAN_V2_NODE_KINDS,
  VIEW_PLAN_V2_TOOL_KINDS,
  VIEW_PLAN_V2_VERSION,
} from '@/lib/viewPlanV2';
import type {
  ViewPlanV2ActionItem,
  ViewPlanV2ActionListNode,
  ViewPlanDetailItem,
  ViewPlanEvidenceBinding,
  ViewPlanStatItem,
  ViewPlanTableData,
  ViewPlanV2,
  ViewPlanV2BulletListNode,
  ViewPlanV2CalloutNode,
  ViewPlanV2CalloutTone,
  ViewPlanV2DetailCardNode,
  ViewPlanV2Gap,
  ViewPlanV2GridColumns,
  ViewPlanV2GridNode,
  ViewPlanV2HeroNode,
  ViewPlanV2LeafKind,
  ViewPlanV2LeafNode,
  ViewPlanV2NavigateTool,
  ViewPlanV2Node,
  ViewPlanV2NodeKind,
  ViewPlanV2OpenSourceTool,
  ViewPlanV2PageNode,
  ViewPlanV2SectionNode,
  ViewPlanV2StackNode,
  ViewPlanV2StatListNode,
  ViewPlanV2TableNode,
  ViewPlanV2Tool,
  ViewPlanV2ToolKind,
} from '@/lib/viewPlanV2';

export type ViewPlanV2ValidationIssueCode =
  | 'invalid_root_object'
  | 'unsupported_plan_version'
  | 'missing_field'
  | 'invalid_field'
  | 'unknown_node_kind'
  | 'unknown_tool_kind'
  | 'missing_evidence_binding'
  | 'invalid_layout_structure';

export interface ViewPlanV2ValidationIssue {
  code: ViewPlanV2ValidationIssueCode;
  path: string;
  message: string;
}

export type ViewPlanV2ValidationResult =
  | { ok: true; plan: ViewPlanV2 }
  | { ok: false; issues: ViewPlanV2ValidationIssue[] };

const GAP_VALUES: ViewPlanV2Gap[] = ['sm', 'md', 'lg'];
const GRID_COLUMN_VALUES: ViewPlanV2GridColumns[] = [1, 2, 3];
const CALLOUT_TONES: ViewPlanV2CalloutTone[] = ['neutral', 'info', 'warning'];
const ITEM_EMPHASIS_VALUES = ['default', 'strong'] as const;

export function validateViewPlanV2(input: unknown): ViewPlanV2ValidationResult {
  const issues: ViewPlanV2ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ code: 'invalid_root_object', path: 'plan', message: 'Plan must be an object.' }],
    };
  }

  const version = readRequiredString(input, 'version', 'version', issues);
  if (version !== VIEW_PLAN_V2_VERSION) {
    issues.push({
      code: 'unsupported_plan_version',
      path: 'version',
      message: `Expected version '${VIEW_PLAN_V2_VERSION}'.`,
    });
  }

  const root = parseNode(input.root, 'root', issues);
  if (!root) {
    return { ok: false, issues };
  }

  if (root.kind !== 'page') {
    issues.push({
      code: 'invalid_layout_structure',
      path: 'root',
      message: 'Root node must use the page layout primitive.',
    });
    return { ok: false, issues };
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, plan: { version: VIEW_PLAN_V2_VERSION, root } };
}

function parseNode(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2Node | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Node must be an object.' });
    return null;
  }

  const kindValue = readRequiredString(value, 'kind', `${path}.kind`, issues);
  if (!kindValue) {
    return null;
  }
  if (!isNodeKind(kindValue)) {
    issues.push({
      code: 'unknown_node_kind',
      path: `${path}.kind`,
      message: `Unsupported node kind '${kindValue}'. Allowed kinds: ${VIEW_PLAN_V2_NODE_KINDS.join(', ')}.`,
    });
    return null;
  }

  switch (kindValue) {
    case 'page':
      return parsePageNode(value, path, issues);
    case 'section':
      return parseSectionNode(value, path, issues);
    case 'stack':
      return parseStackNode(value, path, issues);
    case 'grid':
      return parseGridNode(value, path, issues);
    case 'hero':
      return parseHeroNode(value, path, issues);
    case 'stat-list':
      return parseStatListNode(value, path, issues);
    case 'bullet-list':
      return parseBulletListNode(value, path, issues);
    case 'table':
      return parseTableNode(value, path, issues);
    case 'detail-card':
      return parseDetailCardNode(value, path, issues);
    case 'callout':
      return parseCalloutNode(value, path, issues);
    case 'action-list':
      return parseActionListNode(value, path, issues);
  }
}

function parsePageNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2PageNode | null {
  const base = parseBaseNode(value, path, issues, 'page');
  if (!base) {
    return null;
  }

  const children = parseChildrenArray(value.children, `${path}.children`, issues, 'Page requires at least one section.');
  if (!children) {
    return null;
  }

  const sections: ViewPlanV2SectionNode[] = [];
  children.forEach((child, index) => {
    const parsed = parseNode(child, `${path}.children[${index}]`, issues);
    if (!parsed) {
      return;
    }
    if (parsed.kind !== 'section') {
      issues.push({
        code: 'invalid_layout_structure',
        path: `${path}.children[${index}]`,
        message: 'Page children must be section nodes.',
      });
      return;
    }
    sections.push(parsed);
  });

  return { ...base, children: sections };
}

function parseSectionNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2SectionNode | null {
  const base = parseBaseNode(value, path, issues, 'section');
  if (!base) {
    return null;
  }

  const children = parseChildrenArray(value.children, `${path}.children`, issues, 'Section requires at least one layout child.');
  if (!children) {
    return null;
  }

  const layoutChildren: Array<ViewPlanV2StackNode | ViewPlanV2GridNode> = [];
  children.forEach((child, index) => {
    const parsed = parseNode(child, `${path}.children[${index}]`, issues);
    if (!parsed) {
      return;
    }
    if (parsed.kind !== 'stack' && parsed.kind !== 'grid') {
      issues.push({
        code: 'invalid_layout_structure',
        path: `${path}.children[${index}]`,
        message: 'Section children must be stack or grid nodes.',
      });
      return;
    }
    layoutChildren.push(parsed);
  });

  return { ...base, children: layoutChildren };
}

function parseStackNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2StackNode | null {
  const base = parseBaseNode(value, path, issues, 'stack');
  if (!base) {
    return null;
  }

  const gap = readEnum(value.gap, `${path}.gap`, GAP_VALUES, issues);
  const children = parseChildrenArray(value.children, `${path}.children`, issues, 'Stack requires at least one child.');
  if (!gap || !children) {
    return null;
  }

  const stackChildren: Array<ViewPlanV2GridNode | ViewPlanV2LeafNode> = [];
  children.forEach((child, index) => {
    const parsed = parseNode(child, `${path}.children[${index}]`, issues);
    if (!parsed) {
      return;
    }
    if (parsed.kind === 'page' || parsed.kind === 'section' || parsed.kind === 'stack') {
      issues.push({
        code: 'invalid_layout_structure',
        path: `${path}.children[${index}]`,
        message: 'Stack children must be grid nodes or leaf primitives.',
      });
      return;
    }
    stackChildren.push(parsed);
  });

  return { ...base, gap, children: stackChildren };
}

function parseGridNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2GridNode | null {
  const base = parseBaseNode(value, path, issues, 'grid');
  if (!base) {
    return null;
  }

  const columns = readEnumNumber(value.columns, `${path}.columns`, GRID_COLUMN_VALUES, issues);
  const children = parseChildrenArray(value.children, `${path}.children`, issues, 'Grid requires at least one leaf child.');
  if (!columns || !children) {
    return null;
  }

  const leafChildren: ViewPlanV2LeafNode[] = [];
  children.forEach((child, index) => {
    const parsed = parseNode(child, `${path}.children[${index}]`, issues);
    if (!parsed) {
      return;
    }
    if (isLeafNode(parsed)) {
      leafChildren.push(parsed);
      return;
    }

    if (!isLeafNode(parsed)) {
      issues.push({
        code: 'invalid_layout_structure',
        path: `${path}.children[${index}]`,
        message: 'Grid children must be leaf nodes.',
      });
    }
  });

  return { ...base, columns, children: leafChildren };
}

function parseHeroNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2HeroNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'hero');
  const headline = readRequiredString(value, 'headline', `${path}.headline`, issues);
  const body = readRequiredString(value, 'body', `${path}.body`, issues);
  const stats = value.stats === undefined ? undefined : parseStatItems(value.stats, `${path}.stats`, issues, true);
  if (!base || !headline || !body) {
    return null;
  }
  return { ...base, headline, body, ...(stats ? { stats } : {}) };
}

function parseStatListNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2StatListNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'stat-list');
  const items = parseStatItems(value.items, `${path}.items`, issues, false);
  if (!base || !items) {
    return null;
  }
  return { ...base, items };
}

function parseBulletListNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2BulletListNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'bullet-list');
  const items = parseStringList(value.items, `${path}.items`, issues, 'Bullet list requires at least one item.');
  if (!base || !items) {
    return null;
  }
  return { ...base, items };
}

function parseTableNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2TableNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'table');
  const data = parseTableData(value.data, `${path}.data`, issues);
  if (!base || !data) {
    return null;
  }
  return { ...base, data };
}

function parseDetailCardNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2DetailCardNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'detail-card');
  const items = parseDetailItems(value.items, `${path}.items`, issues);
  if (!base || !items) {
    return null;
  }
  return { ...base, items };
}

function parseCalloutNode(value: Record<string, unknown>, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2CalloutNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'callout');
  const tone = readEnum(value.tone, `${path}.tone`, CALLOUT_TONES, issues);
  const body = readRequiredString(value, 'body', `${path}.body`, issues);
  if (!base || !tone || !body) {
    return null;
  }
  return { ...base, tone, body };
}

function parseActionListNode(
  value: Record<string, unknown>,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): ViewPlanV2ActionListNode | null {
  const base = parseEvidenceNodeBase(value, path, issues, 'action-list');
  const items = parseActionItems(value.items, `${path}.items`, issues);
  if (!base || !items) {
    return null;
  }
  return { ...base, items };
}

function parseBaseNode<Kind extends ViewPlanV2NodeKind>(
  value: Record<string, unknown>,
  path: string,
  issues: ViewPlanV2ValidationIssue[],
  kind: Kind
): { id: string; kind: Kind; title?: string; description?: string } | null {
  const id = readRequiredString(value, 'id', `${path}.id`, issues);
  if (!id) {
    return null;
  }

  const title = readOptionalString(value.title, `${path}.title`, issues);
  const description = readOptionalString(value.description, `${path}.description`, issues);

  return {
    id,
    kind,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}

function parseEvidenceNodeBase<Kind extends ViewPlanV2LeafKind>(
  value: Record<string, unknown>,
  path: string,
  issues: ViewPlanV2ValidationIssue[],
  kind: Kind
): { id: string; kind: Kind; title?: string; description?: string; evidence: ViewPlanEvidenceBinding[] } | null {
  const base = parseBaseNode(value, path, issues, kind);
  const evidence = parseEvidenceBindings(value.evidence, `${path}.evidence`, issues);
  if (!base || !evidence) {
    return null;
  }
  return { ...base, evidence };
}

function parseActionItems(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2ActionItem[] | null {
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Items must be an array.' });
    return null;
  }
  if (value.length === 0) {
    issues.push({ code: 'invalid_field', path, message: 'Action list requires at least one item.' });
    return null;
  }

  const items = value
    .map((entry, index) => parseActionItem(entry, `${path}[${index}]`, issues))
    .filter((entry): entry is ViewPlanV2ActionItem => entry !== null);

  return items.length > 0 ? items : null;
}

function parseActionItem(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2ActionItem | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Action item must be an object.' });
    return null;
  }

  const label = readRequiredString(value, 'label', `${path}.label`, issues);
  const description = readOptionalString(value.description, `${path}.description`, issues);
  const emphasis = value.emphasis === undefined
    ? undefined
    : readEnum(value.emphasis, `${path}.emphasis`, ITEM_EMPHASIS_VALUES, issues);
  const tool = parseTool(value.tool, `${path}.tool`, issues);

  if (!label || !tool) {
    return null;
  }

  return {
    label,
    ...(description ? { description } : {}),
    ...(emphasis ? { emphasis } : {}),
    tool,
  };
}

function parseTool(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanV2Tool | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Tool must be an object.' });
    return null;
  }

  const kind = readRequiredString(value, 'kind', `${path}.kind`, issues);
  if (!kind) {
    return null;
  }
  if (!isToolKind(kind)) {
    issues.push({
      code: 'unknown_tool_kind',
      path: `${path}.kind`,
      message: `Unsupported tool kind '${kind}'. Allowed tools: ${VIEW_PLAN_V2_TOOL_KINDS.join(', ')}.`,
    });
    return null;
  }

  switch (kind) {
    case 'navigate':
      return parseNavigateTool(value, path, issues);
    case 'open-source':
      return parseOpenSourceTool(value, path, issues);
  }
}

function parseNavigateTool(
  value: Record<string, unknown>,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): ViewPlanV2NavigateTool | null {
  const target = readRequiredString(value, 'target', `${path}.target`, issues);
  if (!target) {
    return null;
  }

  return {
    kind: 'navigate',
    target,
  };
}

function parseOpenSourceTool(
  value: Record<string, unknown>,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): ViewPlanV2OpenSourceTool | null {
  const sourceDocumentId = readRequiredString(value, 'sourceDocumentId', `${path}.sourceDocumentId`, issues);
  const sourceReference = readRequiredString(value, 'sourceReference', `${path}.sourceReference`, issues);
  if (!sourceDocumentId || !sourceReference) {
    return null;
  }

  return {
    kind: 'open-source',
    sourceDocumentId,
    sourceReference,
  };
}

function parseChildrenArray(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[],
  emptyMessage: string
): unknown[] | null {
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Children must be an array.' });
    return null;
  }
  if (value.length === 0) {
    issues.push({ code: 'invalid_layout_structure', path, message: emptyMessage });
    return null;
  }
  return value;
}

function parseEvidenceBindings(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): ViewPlanEvidenceBinding[] | null {
  if (!Array.isArray(value)) {
    issues.push({ code: 'missing_evidence_binding', path, message: 'Content nodes require evidence bindings.' });
    return null;
  }

  const bindings = value
    .map((entry, index) => parseEvidenceBinding(entry, `${path}[${index}]`, issues))
    .filter((entry): entry is ViewPlanEvidenceBinding => entry !== null);

  if (bindings.length === 0) {
    issues.push({ code: 'missing_evidence_binding', path, message: 'At least one evidence binding is required.' });
    return null;
  }

  return bindings;
}

function parseEvidenceBinding(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): ViewPlanEvidenceBinding | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Evidence binding must be an object.' });
    return null;
  }

  const sourceDocumentId = readRequiredString(value, 'sourceDocumentId', `${path}.sourceDocumentId`, issues);
  const sourceReference = readRequiredString(value, 'sourceReference', `${path}.sourceReference`, issues);
  const excerpt = readOptionalString(value.excerpt, `${path}.excerpt`, issues);

  if (!sourceDocumentId || !sourceReference) {
    return null;
  }

  return {
    sourceDocumentId,
    sourceReference,
    ...(excerpt ? { excerpt } : {}),
  };
}

function parseStatItems(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[],
  optional: boolean
): ViewPlanStatItem[] | undefined | null {
  if (value === undefined && optional) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Items must be an array.' });
    return null;
  }
  if (!optional && value.length === 0) {
    issues.push({ code: 'invalid_field', path, message: 'Items must not be empty.' });
    return null;
  }

  const items = value
    .map((entry, index) => parseStatItem(entry, `${path}[${index}]`, issues))
    .filter((entry): entry is ViewPlanStatItem => entry !== null);
  return !optional && items.length === 0 ? null : items;
}

function parseStatItem(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanStatItem | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Stat item must be an object.' });
    return null;
  }
  const label = readRequiredString(value, 'label', `${path}.label`, issues);
  const itemValue = readRequiredString(value, 'value', `${path}.value`, issues);
  const emphasis = value.emphasis === undefined
    ? undefined
    : readEnum(value.emphasis, `${path}.emphasis`, ITEM_EMPHASIS_VALUES, issues);

  if (!label || !itemValue) {
    return null;
  }

  return {
    label,
    value: itemValue,
    ...(emphasis ? { emphasis } : {}),
  };
}

function parseStringList(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[],
  emptyMessage: string
): string[] | null {
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_field', path, message: 'List must be an array.' });
    return null;
  }

  const items = value
    .map((entry, index) => normalizeString(entry, `${path}[${index}]`, issues))
    .filter((entry): entry is string => entry !== null);

  if (items.length === 0) {
    issues.push({ code: 'invalid_field', path, message: emptyMessage });
    return null;
  }

  return items;
}

function parseTableData(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanTableData | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Table data must be an object.' });
    return null;
  }

  const columns = parseStringList(value.columns, `${path}.columns`, issues, 'Table requires at least one column.');
  if (!columns) {
    return null;
  }
  if (!Array.isArray(value.rows)) {
    issues.push({ code: 'invalid_field', path: `${path}.rows`, message: 'Rows must be an array.' });
    return null;
  }

  const rows = value.rows
    .map((entry, index) => parseRow(entry, `${path}.rows[${index}]`, issues, columns.length))
    .filter((entry): entry is string[] => entry !== null);

  return { columns, rows };
}

function parseRow(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[],
  expectedColumns: number
): string[] | null {
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Row must be an array.' });
    return null;
  }

  const row = value
    .map((cell, index) => normalizeString(cell, `${path}[${index}]`, issues))
    .filter((cell): cell is string => cell !== null);

  if (row.length !== expectedColumns) {
    issues.push({
      code: 'invalid_field',
      path,
      message: `Row must contain exactly ${expectedColumns} cells.`,
    });
    return null;
  }

  return row;
}

function parseDetailItems(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanDetailItem[] | null {
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Items must be an array.' });
    return null;
  }
  if (value.length === 0) {
    issues.push({ code: 'invalid_field', path, message: 'Detail card requires at least one item.' });
    return null;
  }

  const items = value
    .map((entry, index) => parseDetailItem(entry, `${path}[${index}]`, issues))
    .filter((entry): entry is ViewPlanDetailItem => entry !== null);
  return items.length > 0 ? items : null;
}

function parseDetailItem(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): ViewPlanDetailItem | null {
  if (!isRecord(value)) {
    issues.push({ code: 'invalid_field', path, message: 'Detail item must be an object.' });
    return null;
  }
  const label = readRequiredString(value, 'label', `${path}.label`, issues);
  const itemValue = readRequiredString(value, 'value', `${path}.value`, issues);
  if (!label || !itemValue) {
    return null;
  }
  return { label, value: itemValue };
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): string | null {
  if (!(key in value)) {
    issues.push({ code: 'missing_field', path, message: `Missing required field '${key}'.` });
    return null;
  }
  return normalizeString(value[key], path, issues);
}

function readOptionalString(
  value: unknown,
  path: string,
  issues: ViewPlanV2ValidationIssue[]
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeString(value, path, issues) || undefined;
}

function normalizeString(value: unknown, path: string, issues: ViewPlanV2ValidationIssue[]): string | null {
  if (typeof value !== 'string') {
    issues.push({ code: 'invalid_field', path, message: 'Expected a non-empty string.' });
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    issues.push({ code: 'invalid_field', path, message: 'Expected a non-empty string.' });
    return null;
  }
  return normalized;
}

function readEnum<const Value extends string>(
  value: unknown,
  path: string,
  allowed: readonly Value[],
  issues: ViewPlanV2ValidationIssue[]
): Value | null {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    issues.push({ code: 'invalid_field', path, message: `Expected one of: ${allowed.join(', ')}.` });
    return null;
  }
  return value as Value;
}

function readEnumNumber<const Value extends number>(
  value: unknown,
  path: string,
  allowed: readonly Value[],
  issues: ViewPlanV2ValidationIssue[]
): Value | null {
  if (typeof value !== 'number' || !allowed.includes(value as Value)) {
    issues.push({ code: 'invalid_field', path, message: `Expected one of: ${allowed.join(', ')}.` });
    return null;
  }
  return value as Value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeKind(value: string): value is ViewPlanV2NodeKind {
  return VIEW_PLAN_V2_NODE_KINDS.includes(value as ViewPlanV2NodeKind);
}

export function isLeafKind(value: ViewPlanV2NodeKind): value is ViewPlanV2LeafKind {
  return VIEW_PLAN_V2_LEAF_KINDS.includes(value as ViewPlanV2LeafKind);
}

function isLeafNode(node: ViewPlanV2Node): node is ViewPlanV2LeafNode {
  return isLeafKind(node.kind);
}

function isToolKind(value: string): value is ViewPlanV2ToolKind {
  return VIEW_PLAN_V2_TOOL_KINDS.includes(value as ViewPlanV2ToolKind);
}
