import type { GeneratedUI, GeneratedViewSection } from '@/types';

export function getGeneratedViewStyles(): string {
  return `
    :root {
      color-scheme: light;
      --surface: #f8fafc;
      --panel: rgba(255, 255, 255, 0.92);
      --border: rgba(148, 163, 184, 0.25);
      --ink: #0f172a;
      --muted: #475569;
      --sky: linear-gradient(135deg, #dbeafe 0%, #f0f9ff 100%);
      --emerald: linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%);
      --amber: linear-gradient(135deg, #fef3c7 0%, #fff7ed 100%);
      --slate: linear-gradient(135deg, #e2e8f0 0%, #f8fafc 100%);
    }
    .generated-view {
      font-family: "Avenir Next", "Hiragino Sans", "Yu Gothic", sans-serif;
      color: var(--ink);
    }
    .generated-view__canvas {
      background:
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 32%),
        radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.12), transparent 28%),
        linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
      padding: 1.25rem;
      border-radius: 1.5rem;
      min-height: 24rem;
    }
    .generated-view__meta {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .generated-view__badge {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.35rem 0.7rem;
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid var(--border);
      color: var(--muted);
    }
    .generated-view__grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }
    .generated-view__section {
      grid-column: span 12;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 1.4rem;
      padding: 1.1rem;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
      backdrop-filter: blur(12px);
    }
    .generated-view__section--detail {
      display: none;
    }
    .generated-view__grid:has(.generated-view__section--detail:target) .generated-view__section--summary {
      display: none;
    }
    .generated-view__grid:has(.generated-view__section--detail:target) .generated-view__section--detail {
      display: none;
    }
    .generated-view__grid:has(.generated-view__section--detail:target) .generated-view__section--detail:target {
      display: block;
    }
    .generated-view__section--detail:target {
      display: block;
    }
    .generated-view__detail-back {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.75rem;
      color: #0369a1;
      font-size: 0.92rem;
      font-weight: 600;
      text-decoration: none;
    }
    .generated-view__detail-back:hover {
      text-decoration: underline;
    }
    .generated-view__section[data-accent="sky"] { background: var(--sky); }
    .generated-view__section[data-accent="emerald"] { background: var(--emerald); }
    .generated-view__section[data-accent="amber"] { background: var(--amber); }
    .generated-view__section[data-accent="slate"] { background: var(--slate); }
    .generated-view__section[data-kind="hero"] {
      padding: 1.4rem;
    }
    .generated-view__section-title {
      font-size: 1rem;
      font-weight: 700;
      margin: 0 0 0.5rem;
    }
    .generated-view__hero-title {
      font-size: clamp(1.55rem, 4vw, 2.5rem);
      font-weight: 800;
      letter-spacing: -0.04em;
      margin: 0 0 0.75rem;
    }
    .generated-view__description {
      color: var(--muted);
      font-size: 0.96rem;
      line-height: 1.7;
      margin: 0;
    }
    .generated-view__items,
    .generated-view__bullet-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.7rem;
    }
    .generated-view__item {
      background: rgba(255, 255, 255, 0.74);
      border: 1px solid rgba(255, 255, 255, 0.45);
      border-radius: 1rem;
      padding: 0.8rem 0.9rem;
    }
    .generated-view__item-label {
      display: block;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.3rem;
    }
    .generated-view__item-value {
      display: block;
      font-size: 0.98rem;
      line-height: 1.55;
    }
    .generated-view__item-value[data-emphasis="strong"] {
      font-size: 1.05rem;
      font-weight: 700;
    }
    .generated-view__table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.74);
    }
    .generated-view__table th,
    .generated-view__table td {
      padding: 0.75rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      text-align: left;
      vertical-align: top;
      font-size: 0.92rem;
    }
    .generated-view__table th {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .generated-view__paragraph {
      color: var(--muted);
      line-height: 1.75;
      margin: 0.65rem 0 0;
    }
    .generated-view__table-link {
      color: #0369a1;
      text-decoration: none;
      font-weight: 600;
    }
    .generated-view__table-link:hover {
      text-decoration: underline;
    }
    @media (min-width: 960px) {
      .generated-view__section[data-kind="summary-grid"],
      .generated-view__section[data-kind="documents"] {
        grid-column: span 6;
      }
    }
  `;
}

export function renderGeneratedViewMarkup(generatedUI: GeneratedUI): string {
  const sections = generatedUI.schema.sections.map(renderSection).join('');

  return `
    <div class="generated-view">
      <div class="generated-view__canvas">
        <div class="generated-view__meta">
          <span class="generated-view__badge">${escapeHtml(generatedUI.provider)}</span>
          <span class="generated-view__badge">${escapeHtml(generatedUI.model)}</span>
          <span class="generated-view__badge">${escapeHtml(new Date(generatedUI.timestamp).toLocaleString('ja-JP'))}</span>
        </div>
        <div class="generated-view__grid">
          ${sections}
        </div>
      </div>
    </div>
  `;
}

export function renderGeneratedViewDocument(generatedUI: GeneratedUI): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(generatedUI.title)}</title>
  <style>${getGeneratedViewStyles()}</style>
</head>
<body>
  ${renderGeneratedViewMarkup(generatedUI)}
</body>
</html>`;
}

function renderSection(section: GeneratedViewSection): string {
  const isDetail = section.id.startsWith('detail-');
  const sectionClass = [
    'generated-view__section',
    isDetail ? 'generated-view__section--detail' : 'generated-view__section--summary',
  ].join(' ');
  const titleClass = section.kind === 'hero' ? 'generated-view__hero-title' : 'generated-view__section-title';
  const description = section.description
    ? `<p class="generated-view__description">${escapeHtml(section.description)}</p>`
    : '';
  const items = section.items?.length ? renderItems(section) : '';
  const table = section.table
    ? renderTable(
        section.table.columns,
        section.table.rows,
        section.table.rowSectionIds,
        section.table.rowLinkColumnIndex
      )
    : '';
  const paragraphs = section.paragraphs?.length
    ? section.paragraphs
        .map((paragraph) => `<p class="generated-view__paragraph">${escapeHtml(paragraph)}</p>`)
        .join('')
    : '';
  const backLink = isDetail
    ? `<a class="generated-view__detail-back" href="#overview">一覧へ戻る</a>`
    : '';

  return `
    <section id="${escapeHtml(section.id)}" class="${sectionClass}" data-kind="${escapeHtml(section.kind)}" data-accent="${escapeHtml(section.accent || 'slate')}">
      <h2 class="${titleClass}">${escapeHtml(section.title)}</h2>
      ${description}
      ${items}
      ${table}
      ${paragraphs}
      ${backLink}
    </section>
  `;
}

function renderItems(section: GeneratedViewSection): string {
  const listClass = section.kind === 'key-points' ? 'generated-view__bullet-list' : 'generated-view__items';
  return `
    <ul class="${listClass}">
      ${(section.items || [])
        .map(
          (item) => `
            <li class="generated-view__item">
              <span class="generated-view__item-label">${escapeHtml(item.label)}</span>
              <span class="generated-view__item-value" data-emphasis="${escapeHtml(item.emphasis || 'default')}">${escapeHtml(item.value)}</span>
            </li>
          `
        )
        .join('')}
    </ul>
  `;
}

function renderTable(
  columns: string[],
  rows: string[][],
  rowSectionIds?: Array<string | null>,
  rowLinkColumnIndex = 0
): string {
  return `
    <table class="generated-view__table">
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row, rowIndex) => `
              <tr>${row
                .map((cell, cellIndex) => {
                  if (cellIndex === rowLinkColumnIndex && rowSectionIds?.[rowIndex]) {
                    return `<td><a class="generated-view__table-link" href="#${escapeHtml(rowSectionIds[rowIndex] || '')}">${escapeHtml(cell)}</a></td>`;
                  }
                  return `<td>${escapeHtml(cell)}</td>`;
                })
                .join('')}</tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
