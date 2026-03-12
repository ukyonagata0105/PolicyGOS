export const VIEW_PLAN_V2_VERSION = 'v2' as const;

export type ViewPlanV2PrimitiveCategory = 'layout' | 'content' | 'interaction';

export interface ViewPlanV2PrimitiveDefinition<
  Kind extends string = string,
  Category extends ViewPlanV2PrimitiveCategory = ViewPlanV2PrimitiveCategory,
> {
  kind: Kind;
  category: Category;
  surface: 'user';
  interactive?: boolean;
}

export interface ViewPlanV2ToolDefinition<Kind extends string = string> {
  kind: Kind;
  surface: 'user';
}

export const VIEW_PLAN_V2_PRIMITIVE_REGISTRY = {
  page: { kind: 'page', category: 'layout', surface: 'user' },
  section: { kind: 'section', category: 'layout', surface: 'user' },
  stack: { kind: 'stack', category: 'layout', surface: 'user' },
  grid: { kind: 'grid', category: 'layout', surface: 'user' },
  hero: { kind: 'hero', category: 'content', surface: 'user' },
  'stat-list': { kind: 'stat-list', category: 'content', surface: 'user' },
  'bullet-list': { kind: 'bullet-list', category: 'content', surface: 'user' },
  table: { kind: 'table', category: 'content', surface: 'user' },
  'detail-card': { kind: 'detail-card', category: 'content', surface: 'user' },
  callout: { kind: 'callout', category: 'content', surface: 'user' },
  'action-list': { kind: 'action-list', category: 'interaction', surface: 'user', interactive: true },
} as const satisfies Record<string, ViewPlanV2PrimitiveDefinition>;

export const VIEW_PLAN_V2_TOOL_REGISTRY = {
  navigate: { kind: 'navigate', surface: 'user' },
  'open-source': { kind: 'open-source', surface: 'user' },
} as const satisfies Record<string, ViewPlanV2ToolDefinition>;

export type ViewPlanV2NodeKind = keyof typeof VIEW_PLAN_V2_PRIMITIVE_REGISTRY;
export type ViewPlanV2ToolKind = keyof typeof VIEW_PLAN_V2_TOOL_REGISTRY;

type PrimitiveKindsByCategory<Category extends ViewPlanV2PrimitiveCategory> = {
  [Kind in ViewPlanV2NodeKind]: (typeof VIEW_PLAN_V2_PRIMITIVE_REGISTRY)[Kind]['category'] extends Category ? Kind : never;
}[ViewPlanV2NodeKind];

export type ViewPlanV2LayoutKind = PrimitiveKindsByCategory<'layout'>;
export type ViewPlanV2ContentKind = PrimitiveKindsByCategory<'content'>;
export type ViewPlanV2InteractionKind = PrimitiveKindsByCategory<'interaction'>;
export type ViewPlanV2LeafKind = Exclude<ViewPlanV2NodeKind, ViewPlanV2LayoutKind>;
export type ViewPlanV2Gap = 'sm' | 'md' | 'lg';
export type ViewPlanV2GridColumns = 1 | 2 | 3;
export type ViewPlanV2CalloutTone = 'neutral' | 'info' | 'warning';
export type ViewPlanV2ItemEmphasis = 'default' | 'strong';

export const VIEW_PLAN_V2_NODE_KINDS = listPrimitiveKinds();
export const VIEW_PLAN_V2_LAYOUT_KINDS = listPrimitiveKindsByCategory('layout');
export const VIEW_PLAN_V2_CONTENT_KINDS = listPrimitiveKindsByCategory('content');
export const VIEW_PLAN_V2_INTERACTION_KINDS = listPrimitiveKindsByCategory('interaction');
export const VIEW_PLAN_V2_LEAF_KINDS = listLeafKinds();
export const VIEW_PLAN_V2_TOOL_KINDS = listToolKinds();

export interface ViewPlanEvidenceBinding {
  sourceDocumentId: string;
  sourceReference: string;
  excerpt?: string;
}

export interface ViewPlanStatItem {
  label: string;
  value: string;
  emphasis?: ViewPlanV2ItemEmphasis;
}

export interface ViewPlanDetailItem {
  label: string;
  value: string;
}

export interface ViewPlanTableData {
  columns: string[];
  rows: string[][];
}

interface ViewPlanV2BaseTool<Kind extends ViewPlanV2ToolKind> {
  kind: Kind;
}

export interface ViewPlanV2NavigateTool extends ViewPlanV2BaseTool<'navigate'> {
  target: string;
}

export interface ViewPlanV2OpenSourceTool extends ViewPlanV2BaseTool<'open-source'> {
  sourceDocumentId: string;
  sourceReference: string;
}

export type ViewPlanV2Tool = ViewPlanV2NavigateTool | ViewPlanV2OpenSourceTool;

export interface ViewPlanV2ActionItem {
  label: string;
  description?: string;
  emphasis?: ViewPlanV2ItemEmphasis;
  tool: ViewPlanV2Tool;
}

interface ViewPlanV2BaseNode<Kind extends ViewPlanV2NodeKind> {
  id: string;
  kind: Kind;
  title?: string;
  description?: string;
}

export interface ViewPlanV2PageNode extends ViewPlanV2BaseNode<'page'> {
  children: ViewPlanV2SectionNode[];
}

export interface ViewPlanV2SectionNode extends ViewPlanV2BaseNode<'section'> {
  children: Array<ViewPlanV2StackNode | ViewPlanV2GridNode>;
}

export interface ViewPlanV2StackNode extends ViewPlanV2BaseNode<'stack'> {
  gap: ViewPlanV2Gap;
  children: Array<ViewPlanV2GridNode | ViewPlanV2LeafNode>;
}

export interface ViewPlanV2GridNode extends ViewPlanV2BaseNode<'grid'> {
  columns: ViewPlanV2GridColumns;
  children: ViewPlanV2LeafNode[];
}

interface ViewPlanV2EvidenceNode<Kind extends ViewPlanV2LeafKind> extends ViewPlanV2BaseNode<Kind> {
  evidence: ViewPlanEvidenceBinding[];
}

export interface ViewPlanV2HeroNode extends ViewPlanV2EvidenceNode<'hero'> {
  headline: string;
  body: string;
  stats?: ViewPlanStatItem[];
}

export interface ViewPlanV2StatListNode extends ViewPlanV2EvidenceNode<'stat-list'> {
  items: ViewPlanStatItem[];
}

export interface ViewPlanV2BulletListNode extends ViewPlanV2EvidenceNode<'bullet-list'> {
  items: string[];
}

export interface ViewPlanV2TableNode extends ViewPlanV2EvidenceNode<'table'> {
  data: ViewPlanTableData;
}

export interface ViewPlanV2DetailCardNode extends ViewPlanV2EvidenceNode<'detail-card'> {
  items: ViewPlanDetailItem[];
}

export interface ViewPlanV2CalloutNode extends ViewPlanV2EvidenceNode<'callout'> {
  tone: ViewPlanV2CalloutTone;
  body: string;
}

export interface ViewPlanV2ActionListNode extends ViewPlanV2EvidenceNode<'action-list'> {
  items: ViewPlanV2ActionItem[];
}

export type ViewPlanV2LeafNode =
  | ViewPlanV2HeroNode
  | ViewPlanV2StatListNode
  | ViewPlanV2BulletListNode
  | ViewPlanV2TableNode
  | ViewPlanV2DetailCardNode
  | ViewPlanV2CalloutNode
  | ViewPlanV2ActionListNode;

export type ViewPlanV2Node =
  | ViewPlanV2PageNode
  | ViewPlanV2SectionNode
  | ViewPlanV2StackNode
  | ViewPlanV2GridNode
  | ViewPlanV2LeafNode;

export interface ViewPlanV2 {
  version: typeof VIEW_PLAN_V2_VERSION;
  root: ViewPlanV2PageNode;
}

export function getViewPlanV2PrimitiveDefinition(kind: string): ViewPlanV2PrimitiveDefinition<ViewPlanV2NodeKind> | null {
  if (!(kind in VIEW_PLAN_V2_PRIMITIVE_REGISTRY)) {
    return null;
  }

  return VIEW_PLAN_V2_PRIMITIVE_REGISTRY[kind as ViewPlanV2NodeKind];
}

export function getViewPlanV2ToolDefinition(kind: string): ViewPlanV2ToolDefinition<ViewPlanV2ToolKind> | null {
  if (!(kind in VIEW_PLAN_V2_TOOL_REGISTRY)) {
    return null;
  }

  return VIEW_PLAN_V2_TOOL_REGISTRY[kind as ViewPlanV2ToolKind];
}

function listPrimitiveKinds(): ViewPlanV2NodeKind[] {
  return Object.keys(VIEW_PLAN_V2_PRIMITIVE_REGISTRY) as ViewPlanV2NodeKind[];
}

function listPrimitiveKindsByCategory<Category extends ViewPlanV2PrimitiveCategory>(
  category: Category
): Array<PrimitiveKindsByCategory<Category>> {
  return (Object.entries(VIEW_PLAN_V2_PRIMITIVE_REGISTRY) as Array<[
    ViewPlanV2NodeKind,
    ViewPlanV2PrimitiveDefinition<ViewPlanV2NodeKind>,
  ]>)
    .filter(([, definition]) => definition.category === category)
    .map(([kind]) => kind as PrimitiveKindsByCategory<Category>);
}

function listLeafKinds(): ViewPlanV2LeafKind[] {
  return VIEW_PLAN_V2_NODE_KINDS.filter(
    (kind): kind is ViewPlanV2LeafKind => VIEW_PLAN_V2_PRIMITIVE_REGISTRY[kind].category !== 'layout'
  );
}

function listToolKinds(): ViewPlanV2ToolKind[] {
  return Object.keys(VIEW_PLAN_V2_TOOL_REGISTRY) as ViewPlanV2ToolKind[];
}
