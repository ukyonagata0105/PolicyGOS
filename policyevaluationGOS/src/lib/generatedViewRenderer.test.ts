import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getGeneratedViewStyles,
  renderGeneratedViewDocument,
  renderGeneratedViewMarkup,
} from '@/lib/generatedViewRenderer';
import type { GeneratedUI } from '@/types';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generatedViewRenderer v1 characterization', () => {
  it('renders the current report-style section topology and escaping behavior', () => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('2026/01/02 03:04:05');

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderGeneratedViewMarkup(createGeneratedUiFixture());

    expect({
      badges: Array.from(wrapper.querySelectorAll('.generated-view__badge')).map((badge) => badge.textContent),
      sections: Array.from(wrapper.querySelectorAll('.generated-view__section')).map((section) => ({
        id: section.id,
        className: section.className,
        kind: section.getAttribute('data-kind'),
        accent: section.getAttribute('data-accent'),
        title: section.querySelector('h2')?.textContent,
        description: section.querySelector('.generated-view__description')?.textContent || null,
        paragraphs: Array.from(section.querySelectorAll('.generated-view__paragraph')).map((node) => node.textContent),
        itemLabels: Array.from(section.querySelectorAll('.generated-view__item-label')).map((node) => node.textContent),
        itemValues: Array.from(section.querySelectorAll('.generated-view__item-value')).map((node) => node.textContent),
        tableHeaders: Array.from(section.querySelectorAll('th')).map((node) => node.textContent),
        tableRows: Array.from(section.querySelectorAll('tbody tr')).map((row) =>
          Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
        ),
        tableLinks: Array.from(section.querySelectorAll('.generated-view__table-link')).map((link) => ({
          text: link.textContent,
          href: link.getAttribute('href'),
        })),
        backLink: section.querySelector('.generated-view__detail-back')
          ? {
              text: section.querySelector('.generated-view__detail-back')?.textContent,
              href: section.querySelector('.generated-view__detail-back')?.getAttribute('href'),
            }
          : null,
      })),
    }).toMatchInlineSnapshot(`
      {
        "badges": [
          "canonical-store & partners",
          "v1 <frozen>",
          "2026/01/02 03:04:05",
        ],
        "sections": [
          {
            "accent": "sky",
            "backLink": null,
            "className": "generated-view__section generated-view__section--summary",
            "description": "比較用の説明 & 注意事項",
            "id": "overview",
            "itemLabels": [
              "文書数",
              "事業名",
            ],
            "itemValues": [
              "2件",
              "防災<強化>事業",
            ],
            "kind": "hero",
            "paragraphs": [
              "<script>alert(1)</script> は文字列として表示される",
            ],
            "tableHeaders": [],
            "tableLinks": [],
            "tableRows": [],
            "title": "政策ダッシュボード <2026>",
          },
          {
            "accent": "emerald",
            "backLink": null,
            "className": "generated-view__section generated-view__section--summary",
            "description": "1列目のみ詳細リンクを張る",
            "id": "project-explorer",
            "itemLabels": [],
            "itemValues": [],
            "kind": "data-table",
            "paragraphs": [],
            "tableHeaders": [
              "事業",
              "公開状態",
            ],
            "tableLinks": [
              {
                "href": "#detail-project-1",
                "text": "防災<強化>事業",
              },
            ],
            "tableRows": [
              [
                "防災<強化>事業",
                "公開可",
              ],
              [
                "匿名化待ち事業",
                "公開保留",
              ],
            ],
            "title": "事業一覧",
          },
          {
            "accent": "amber",
            "backLink": {
              "href": "#overview",
              "text": "一覧へ戻る",
            },
            "className": "generated-view__section generated-view__section--detail",
            "description": "要確認: 出典確認待ち",
            "id": "detail-project-1",
            "itemLabels": [
              "概要",
              "出典メモ",
            ],
            "itemValues": [
              "<b>強調</b>はエスケープされる",
              "source & notes",
            ],
            "kind": "documents",
            "paragraphs": [],
            "tableHeaders": [],
            "tableLinks": [],
            "tableRows": [],
            "title": "案件詳細: 防災<強化>事業",
          },
        ],
      }
    `);

    expect(wrapper.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(wrapper.innerHTML).toContain('&lt;b&gt;強調&lt;/b&gt;はエスケープされる');
    expect(wrapper.innerHTML).not.toContain('<script>alert(1)</script>');
    expect(wrapper.innerHTML).not.toContain('<b>強調</b>');
  });

  it('wraps the rendered markup in the current standalone document shell and detail CSS rules', () => {
    const generatedUI = createGeneratedUiFixture();
    const documentMarkup = renderGeneratedViewDocument(generatedUI);
    const styles = getGeneratedViewStyles();

    expect(documentMarkup).toContain('<!DOCTYPE html>');
    expect(documentMarkup).toContain('<html lang="ja">');
    expect(documentMarkup).toContain('<meta charset="UTF-8" />');
    expect(documentMarkup).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    expect(documentMarkup).toContain('<title>政策ダッシュボード &lt;2026&gt;</title>');
    expect(documentMarkup).toContain('<style>');
    expect(styles).toContain('.generated-view__section--detail {');
    expect(styles).toContain('.generated-view__grid:has(.generated-view__section--detail:target) .generated-view__section--summary {');
    expect(styles).toContain('.generated-view__grid:has(.generated-view__section--detail:target) .generated-view__section--detail:target {');
    expect(styles).toContain('.generated-view__detail-back {');
    expect(styles).toContain('.generated-view__section[data-kind="documents"] {');
  });
});

function createGeneratedUiFixture(): GeneratedUI {
  return {
    id: 'generated-ui-v1',
    title: '政策ダッシュボード <2026>',
    summary: '現行 v1 レンダラーの固定化',
    timestamp: '2026-01-02T03:04:05.000Z',
    provider: 'canonical-store & partners',
    model: 'v1 <frozen>',
    schema: {
      layout: {
        density: 'comfortable',
        emphasis: 'comparison',
        heroStyle: 'dashboard',
      },
      sections: [
        {
          id: 'overview',
          kind: 'hero',
          title: '政策ダッシュボード <2026>',
          description: '比較用の説明 & 注意事項',
          accent: 'sky',
          items: [
            { label: '文書数', value: '2件', emphasis: 'strong' },
            { label: '事業名', value: '防災<強化>事業' },
          ],
          paragraphs: ['<script>alert(1)</script> は文字列として表示される'],
        },
        {
          id: 'project-explorer',
          kind: 'data-table',
          title: '事業一覧',
          description: '1列目のみ詳細リンクを張る',
          accent: 'emerald',
          table: {
            columns: ['事業', '公開状態'],
            rows: [
              ['防災<強化>事業', '公開可'],
              ['匿名化待ち事業', '公開保留'],
            ],
            rowSectionIds: ['detail-project-1', null],
            rowLinkColumnIndex: 0,
          },
        },
        {
          id: 'detail-project-1',
          kind: 'documents',
          title: '案件詳細: 防災<強化>事業',
          description: '要確認: 出典確認待ち',
          accent: 'amber',
          items: [
            { label: '概要', value: '<b>強調</b>はエスケープされる' },
            { label: '出典メモ', value: 'source & notes' },
          ],
        },
      ],
    },
  };
}
