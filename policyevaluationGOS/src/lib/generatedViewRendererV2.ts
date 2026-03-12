import {
  getViewPlanV2PrimitiveDefinition,
  getViewPlanV2ToolDefinition,
} from '@/lib/viewPlanV2';
import type {
  ViewPlanEvidenceBinding,
  ViewPlanV2,
  ViewPlanV2ActionItem,
  ViewPlanV2ActionListNode,
  ViewPlanV2BulletListNode,
  ViewPlanV2CalloutNode,
  ViewPlanV2DetailCardNode,
  ViewPlanV2GridNode,
  ViewPlanV2HeroNode,
  ViewPlanV2Node,
  ViewPlanV2OpenSourceTool,
  ViewPlanV2PageNode,
  ViewPlanV2SectionNode,
  ViewPlanV2StackNode,
  ViewPlanV2StatListNode,
  ViewPlanV2TableNode,
  ViewPlanV2Tool,
} from '@/lib/viewPlanV2';

type ViewPlanV2ComponentRendererRegistry = {
  [Kind in ViewPlanV2Node['kind']]: (node: Extract<ViewPlanV2Node, { kind: Kind }>) => string;
};

type ViewPlanV2ToolRendererRegistry = {
  [Kind in ViewPlanV2Tool['kind']]: (tool: Extract<ViewPlanV2Tool, { kind: Kind }>, item: ViewPlanV2ActionItem) => string;
};

const COMPONENT_RENDERERS = {
  page: renderPageNode,
  section: renderSectionNode,
  stack: renderStackNode,
  grid: renderGridNode,
  hero: renderHeroNode,
  'stat-list': renderStatListNode,
  'bullet-list': renderBulletListNode,
  table: renderTableNode,
  'detail-card': renderDetailCardNode,
  callout: renderCalloutNode,
  'action-list': renderActionListNode,
} satisfies ViewPlanV2ComponentRendererRegistry;

const TOOL_RENDERERS = {
  navigate: renderNavigateTool,
  'open-source': renderOpenSourceTool,
} satisfies ViewPlanV2ToolRendererRegistry;

export function getGeneratedViewV2Styles(): string {
  return `
    :root {
      color-scheme: light;
      --v2-surface: #f7f8f4;
      --v2-panel: rgba(255, 255, 255, 0.9);
      --v2-panel-strong: rgba(255, 255, 255, 0.96);
      --v2-border: rgba(99, 115, 129, 0.2);
      --v2-ink: #14213d;
      --v2-muted: #516071;
      --v2-accent: #2a9d8f;
      --v2-warning: #f4a261;
      --v2-shadow: 0 18px 45px rgba(20, 33, 61, 0.08);
    }
    .generated-view-v2 {
      font-family: "Avenir Next", "Hiragino Sans", "Yu Gothic", sans-serif;
      color: var(--v2-ink);
      background:
        radial-gradient(circle at top right, rgba(42, 157, 143, 0.12), transparent 30%),
        radial-gradient(circle at bottom left, rgba(244, 162, 97, 0.14), transparent 24%),
        linear-gradient(180deg, #fdfcf7 0%, #f2f5ef 100%);
      padding: 1.5rem;
      border-radius: 1.5rem;
    }
    .generated-view-v2__section,
    .generated-view-v2__leaf {
      background: var(--v2-panel);
      border: 1px solid var(--v2-border);
      border-radius: 1.25rem;
      box-shadow: var(--v2-shadow);
    }
    .generated-view-v2__section,
    .generated-view-v2__stack,
    .generated-view-v2__grid,
    .generated-view-v2__leaf {
      display: grid;
      gap: 1rem;
    }
    .generated-view-v2__section,
    .generated-view-v2__leaf {
      padding: 1rem;
    }
    .generated-view-v2__stack[data-gap="sm"] { gap: 0.75rem; }
    .generated-view-v2__stack[data-gap="md"] { gap: 1rem; }
    .generated-view-v2__stack[data-gap="lg"] { gap: 1.4rem; }
    .generated-view-v2__grid { grid-template-columns: 1fr; }
    .generated-view-v2__grid[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .generated-view-v2__grid[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .generated-view-v2__eyebrow {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--v2-muted);
    }
    .generated-view-v2__title {
      margin: 0;
      font-size: 1.1rem;
      line-height: 1.3;
    }
    .generated-view-v2__headline {
      margin: 0;
      font-size: clamp(1.6rem, 4vw, 2.4rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }
    .generated-view-v2__description,
    .generated-view-v2__body,
    .generated-view-v2__action-description,
    .generated-view-v2__evidence-note {
      margin: 0;
      color: var(--v2-muted);
      line-height: 1.65;
    }
    .generated-view-v2__stats,
    .generated-view-v2__bullet-list,
    .generated-view-v2__detail-list,
    .generated-view-v2__action-list,
    .generated-view-v2__evidence-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.75rem;
    }
    .generated-view-v2__stat,
    .generated-view-v2__detail-item,
    .generated-view-v2__action-item {
      background: var(--v2-panel-strong);
      border: 1px solid var(--v2-border);
      border-radius: 1rem;
      padding: 0.8rem 0.9rem;
    }
    .generated-view-v2__stat-label,
    .generated-view-v2__detail-label {
      display: block;
      font-size: 0.75rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--v2-muted);
      margin-bottom: 0.25rem;
    }
    .generated-view-v2__stat-value[data-emphasis="strong"],
    .generated-view-v2__action-trigger[data-emphasis="strong"] {
      font-weight: 700;
    }
    .generated-view-v2__table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 1rem;
      background: var(--v2-panel-strong);
    }
    .generated-view-v2__table th,
    .generated-view-v2__table td {
      padding: 0.75rem;
      border-bottom: 1px solid var(--v2-border);
      text-align: left;
      vertical-align: top;
    }
    .generated-view-v2__table th {
      font-size: 0.76rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--v2-muted);
    }
    .generated-view-v2__callout[data-tone="warning"] {
      border-color: rgba(244, 162, 97, 0.4);
    }
    .generated-view-v2__callout[data-tone="info"] {
      border-color: rgba(42, 157, 143, 0.35);
    }
    .generated-view-v2__action-trigger,
    .generated-view-v2__evidence-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      width: fit-content;
      min-height: 2.5rem;
      border-radius: 999px;
      border: 1px solid rgba(42, 157, 143, 0.28);
      background: rgba(42, 157, 143, 0.08);
      color: var(--v2-ink);
      padding: 0.65rem 0.9rem;
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    .generated-view-v2__evidence {
      display: grid;
      gap: 0.55rem;
      padding-top: 0.25rem;
    }
    @media (max-width: 860px) {
      .generated-view-v2__grid[data-columns="2"],
      .generated-view-v2__grid[data-columns="3"] {
        grid-template-columns: 1fr;
      }
    }
  `;
}

export function renderGeneratedViewV2Markup(plan: ViewPlanV2): string {
  return renderNode(plan.root);
}

export function renderGeneratedViewV2Document(plan: ViewPlanV2): string {
  const title = plan.root.title || 'Generated View v2';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>${getGeneratedViewV2Styles()}</style>
</head>
<body>
  ${renderGeneratedViewV2Markup(plan)}
</body>
</html>`;
}

function renderNode(node: ViewPlanV2Node): string {
  switch (node.kind) {
    case 'page':
      return COMPONENT_RENDERERS.page(node);
    case 'section':
      return COMPONENT_RENDERERS.section(node);
    case 'stack':
      return COMPONENT_RENDERERS.stack(node);
    case 'grid':
      return COMPONENT_RENDERERS.grid(node);
    case 'hero':
      return COMPONENT_RENDERERS.hero(node);
    case 'stat-list':
      return COMPONENT_RENDERERS['stat-list'](node);
    case 'bullet-list':
      return COMPONENT_RENDERERS['bullet-list'](node);
    case 'table':
      return COMPONENT_RENDERERS.table(node);
    case 'detail-card':
      return COMPONENT_RENDERERS['detail-card'](node);
    case 'callout':
      return COMPONENT_RENDERERS.callout(node);
    case 'action-list':
      return COMPONENT_RENDERERS['action-list'](node);
  }
}

function renderPageNode(node: ViewPlanV2PageNode): string {
  return `
    <main class="generated-view-v2" ${renderPrimitiveAttributes(node.kind)}>
      ${renderHeader(node.title, node.description)}
      ${node.children.map((child) => renderNode(child)).join('')}
    </main>
  `;
}

function renderSectionNode(node: ViewPlanV2SectionNode): string {
  return `
    <section id="${escapeHtml(node.id)}" class="generated-view-v2__section" ${renderPrimitiveAttributes(node.kind)}>
      ${renderHeader(node.title, node.description)}
      ${node.children.map((child) => renderNode(child)).join('')}
    </section>
  `;
}

function renderStackNode(node: ViewPlanV2StackNode): string {
  return `
    <div class="generated-view-v2__stack" ${renderPrimitiveAttributes(node.kind)} data-gap="${escapeHtml(node.gap)}">
      ${renderHeader(node.title, node.description)}
      ${node.children.map((child) => renderNode(child)).join('')}
    </div>
  `;
}

function renderGridNode(node: ViewPlanV2GridNode): string {
  return `
    <div class="generated-view-v2__grid" ${renderPrimitiveAttributes(node.kind)} data-columns="${String(node.columns)}">
      ${renderHeader(node.title, node.description)}
      ${node.children.map((child) => renderNode(child)).join('')}
    </div>
  `;
}

function renderHeroNode(node: ViewPlanV2HeroNode): string {
  const stats = node.stats?.length
    ? `<ul class="generated-view-v2__stats">${node.stats
        .map(
          (item) => `
            <li class="generated-view-v2__stat">
              <span class="generated-view-v2__stat-label">${escapeHtml(item.label)}</span>
              <span class="generated-view-v2__stat-value" data-emphasis="${escapeHtml(item.emphasis || 'default')}">${escapeHtml(item.value)}</span>
            </li>
          `
        )
        .join('')}</ul>`
    : '';

  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `
      <h2 class="generated-view-v2__headline">${escapeHtml(node.headline)}</h2>
      <p class="generated-view-v2__body">${escapeHtml(node.body)}</p>
      ${stats}
    `,
    node.evidence
  );
}

function renderStatListNode(node: ViewPlanV2StatListNode): string {
  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `<ul class="generated-view-v2__stats">${node.items
      .map(
        (item) => `
          <li class="generated-view-v2__stat">
            <span class="generated-view-v2__stat-label">${escapeHtml(item.label)}</span>
            <span class="generated-view-v2__stat-value" data-emphasis="${escapeHtml(item.emphasis || 'default')}">${escapeHtml(item.value)}</span>
          </li>
        `
      )
      .join('')}</ul>`,
    node.evidence
  );
}

function renderBulletListNode(node: ViewPlanV2BulletListNode): string {
  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `<ul class="generated-view-v2__bullet-list">${node.items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('')}</ul>`,
    node.evidence
  );
}

function renderTableNode(node: ViewPlanV2TableNode): string {
  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `
      <table class="generated-view-v2__table">
        <thead>
          <tr>${node.data.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${node.data.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            .join('')}
        </tbody>
      </table>
    `,
    node.evidence
  );
}

function renderDetailCardNode(node: ViewPlanV2DetailCardNode): string {
  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `<ul class="generated-view-v2__detail-list">${node.items
      .map(
        (item) => `
          <li class="generated-view-v2__detail-item">
            <span class="generated-view-v2__detail-label">${escapeHtml(item.label)}</span>
            <span>${escapeHtml(item.value)}</span>
          </li>
        `
      )
      .join('')}</ul>`,
    node.evidence
  );
}

function renderCalloutNode(node: ViewPlanV2CalloutNode): string {
  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `<div class="generated-view-v2__callout" data-tone="${escapeHtml(node.tone)}"><p class="generated-view-v2__body">${escapeHtml(node.body)}</p></div>`,
    node.evidence
  );
}

function renderActionListNode(node: ViewPlanV2ActionListNode): string {
  return renderLeafShell(
    node.kind,
    node.title,
    node.description,
    `<ul class="generated-view-v2__action-list">${node.items.map((item) => renderActionItem(item)).join('')}</ul>`,
    node.evidence
  );
}

function renderActionItem(item: ViewPlanV2ActionItem): string {
  return `
    <li class="generated-view-v2__action-item">
      ${renderTool(item.tool, item)}
      ${item.description ? `<p class="generated-view-v2__action-description">${escapeHtml(item.description)}</p>` : ''}
    </li>
  `;
}

function renderTool(tool: ViewPlanV2Tool, item: ViewPlanV2ActionItem): string {
  switch (tool.kind) {
    case 'navigate':
      return TOOL_RENDERERS.navigate(tool, item);
    case 'open-source':
      return TOOL_RENDERERS['open-source'](tool, item);
  }
}

function renderNavigateTool(tool: Extract<ViewPlanV2Tool, { kind: 'navigate' }>, item: ViewPlanV2ActionItem): string {
  return `
    <a
      class="generated-view-v2__action-trigger"
      data-tool-kind="navigate"
      ${renderToolAttributes(tool.kind)}
      data-emphasis="${escapeHtml(item.emphasis || 'default')}"
      href="#${escapeHtml(tool.target)}"
    >${escapeHtml(item.label)}</a>
  `;
}

function renderOpenSourceTool(tool: ViewPlanV2OpenSourceTool, item: ViewPlanV2ActionItem): string {
  return `
    <span
      class="generated-view-v2__action-trigger"
      data-tool-kind="open-source"
      ${renderToolAttributes(tool.kind)}
      data-emphasis="${escapeHtml(item.emphasis || 'default')}"
      data-source-document-id="${escapeHtml(tool.sourceDocumentId)}"
      data-source-reference="${escapeHtml(tool.sourceReference)}"
    >${escapeHtml(item.label)}</span>
  `;
}

function renderLeafShell(
  kind: ViewPlanV2Node['kind'],
  title: string | undefined,
  description: string | undefined,
  content: string,
  evidence: ViewPlanEvidenceBinding[]
): string {
  return `
    <article class="generated-view-v2__leaf" ${renderPrimitiveAttributes(kind)}>
      ${renderHeader(title, description)}
      ${content}
      ${renderEvidence(evidence)}
    </article>
  `;
}

function renderEvidence(evidence: ViewPlanEvidenceBinding[]): string {
  return `
    <div class="generated-view-v2__evidence">
      <p class="generated-view-v2__evidence-note">出典</p>
      <ul class="generated-view-v2__evidence-list">${evidence
        .map((binding, index) => renderEvidenceItem(binding, index))
        .join('')}</ul>
    </div>
  `;
}

function renderEvidenceItem(binding: ViewPlanEvidenceBinding, index: number): string {
  return `
    <li>
      ${renderOpenSourceTool(
        {
          kind: 'open-source',
          sourceDocumentId: binding.sourceDocumentId,
          sourceReference: binding.sourceReference,
        },
        {
          label: `出典 ${index + 1}`,
          ...(binding.excerpt ? { description: binding.excerpt } : {}),
          tool: {
            kind: 'open-source',
            sourceDocumentId: binding.sourceDocumentId,
            sourceReference: binding.sourceReference,
          },
        }
      )}
    </li>
  `;
}

function renderHeader(title?: string, description?: string): string {
  if (!title && !description) {
    return '';
  }

  return `
    <header>
      ${title ? `<p class="generated-view-v2__eyebrow">${escapeHtml(title)}</p>` : ''}
      ${description ? `<p class="generated-view-v2__description">${escapeHtml(description)}</p>` : ''}
    </header>
  `;
}

function renderPrimitiveAttributes(kind: ViewPlanV2Node['kind']): string {
  const definition = getViewPlanV2PrimitiveDefinition(kind);
  if (!definition) {
    throw new Error(`Missing primitive definition for '${kind}'.`);
  }

  return [
    `data-primitive="${escapeHtml(definition.kind)}"`,
    `data-primitive-category="${escapeHtml(definition.category)}"`,
    `data-primitive-surface="${escapeHtml(definition.surface)}"`,
    definition.interactive ? 'data-primitive-interactive="true"' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function renderToolAttributes(kind: ViewPlanV2Tool['kind']): string {
  const definition = getViewPlanV2ToolDefinition(kind);
  if (!definition) {
    throw new Error(`Missing tool definition for '${kind}'.`);
  }

  return [
    `data-tool="${escapeHtml(definition.kind)}"`,
    `data-tool-surface="${escapeHtml(definition.surface)}"`,
  ].join(' ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
