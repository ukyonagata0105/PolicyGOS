import { describe, expect, it } from 'vitest';

import {
  getGeneratedViewV2Styles,
  renderGeneratedViewV2Document,
  renderGeneratedViewV2Markup,
} from '@/lib/generatedViewRendererV2';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';

function createViewPlanFixture(): ViewPlanV2 {
  return {
    version: 'v2',
    root: {
      id: 'page-root',
      kind: 'page',
      title: '政策評価ビュー <v2>',
      description: '住民向けの要約と次の操作です。',
      children: [
        {
          id: 'overview-section',
          kind: 'section',
          title: '概要',
          children: [
            {
              id: 'overview-stack',
              kind: 'stack',
              gap: 'md',
              children: [
                {
                  id: 'hero-1',
                  kind: 'hero',
                  title: 'Hero',
                  headline: '政策評価ダッシュボード',
                  body: '<script>alert(1)</script> は文字列として扱う',
                  stats: [
                    { label: '文書数', value: '2件', emphasis: 'strong' },
                    { label: '公開可', value: '1件' },
                  ],
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-1',
                    },
                  ],
                },
                {
                  id: 'summary-grid',
                  kind: 'grid',
                  columns: 2,
                  children: [
                    {
                      id: 'stats-1',
                      kind: 'stat-list',
                      title: '主要指標',
                      items: [{ label: '案件数', value: '4件', emphasis: 'strong' }],
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
                      description: '利用者が選べる操作だけを表示します。',
                      items: [
                        {
                          label: '案件詳細へ',
                          description: '詳細カードに移動します。',
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
                          excerpt: '根拠箇所',
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'bullets-1',
                  kind: 'bullet-list',
                  title: '論点',
                  items: ['<b>重点</b>を確認', '公開手続きを継続'],
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-3',
                    },
                  ],
                },
                {
                  id: 'table-1',
                  kind: 'table',
                  title: '案件一覧',
                  data: {
                    columns: ['案件', '公開状態'],
                    rows: [['防災<強化>事業', '公開可']],
                  },
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-4-table-1',
                    },
                  ],
                },
                {
                  id: 'detail-1',
                  kind: 'detail-card',
                  title: '案件詳細',
                  items: [
                    { label: '概要', value: '<i>HTML</i> はエスケープする' },
                    { label: '担当', value: '政策企画課' },
                  ],
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-5',
                    },
                  ],
                },
                {
                  id: 'callout-1',
                  kind: 'callout',
                  title: '注意',
                  tone: 'warning',
                  body: 'review/debug 用の操作は registry に含めない。',
                  evidence: [
                    {
                      sourceDocumentId: 'doc-1',
                      sourceReference: 'page-6',
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

describe('generatedViewRendererV2', () => {
  it('renders only approved v2 primitives and interaction tools', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderGeneratedViewV2Markup(createViewPlanFixture());

    const primitives = Array.from(wrapper.querySelectorAll('[data-primitive]')).map((node) => ({
      kind: node.getAttribute('data-primitive'),
      category: node.getAttribute('data-primitive-category'),
      surface: node.getAttribute('data-primitive-surface'),
      interactive: node.getAttribute('data-primitive-interactive'),
    }));

    expect(primitives).toEqual([
      { kind: 'page', category: 'layout', surface: 'user', interactive: null },
      { kind: 'section', category: 'layout', surface: 'user', interactive: null },
      { kind: 'stack', category: 'layout', surface: 'user', interactive: null },
      { kind: 'hero', category: 'content', surface: 'user', interactive: null },
      { kind: 'grid', category: 'layout', surface: 'user', interactive: null },
      { kind: 'stat-list', category: 'content', surface: 'user', interactive: null },
      { kind: 'action-list', category: 'interaction', surface: 'user', interactive: 'true' },
      { kind: 'bullet-list', category: 'content', surface: 'user', interactive: null },
      { kind: 'table', category: 'content', surface: 'user', interactive: null },
      { kind: 'detail-card', category: 'content', surface: 'user', interactive: null },
      { kind: 'callout', category: 'content', surface: 'user', interactive: null },
    ]);

    const navigateTrigger = wrapper.querySelector('[data-tool-kind="navigate"]');
    expect(navigateTrigger?.getAttribute('href')).toBe('#detail-project-1');
    expect(navigateTrigger?.textContent).toBe('案件詳細へ');
    expect(navigateTrigger?.getAttribute('data-tool-surface')).toBe('user');

    const openSourceTrigger = wrapper.querySelector('.generated-view-v2__action-list [data-tool-kind="open-source"]');
    expect(openSourceTrigger?.tagName).toBe('SPAN');
    expect(openSourceTrigger?.getAttribute('data-source-document-id')).toBe('doc-1');
    expect(openSourceTrigger?.getAttribute('data-source-reference')).toBe('page-2');
    expect(openSourceTrigger?.textContent).toBe('出典を開く');

    expect(wrapper.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt; は文字列として扱う');
    expect(wrapper.innerHTML).toContain('&lt;b&gt;重点&lt;/b&gt;を確認');
    expect(wrapper.innerHTML).toContain('&lt;i&gt;HTML&lt;/i&gt; はエスケープする');
    expect(wrapper.innerHTML).not.toContain('<script>alert(1)</script>');
    expect(wrapper.innerHTML).not.toContain('<b>重点</b>を確認');
    expect(wrapper.innerHTML).not.toContain('review-panel');
    expect(wrapper.innerHTML).not.toContain('debug-json');
  });

  it('wraps the validated markup in a standalone document shell', () => {
    const plan = createViewPlanFixture();
    const documentMarkup = renderGeneratedViewV2Document(plan);
    const styles = getGeneratedViewV2Styles();

    expect(documentMarkup).toContain('<!DOCTYPE html>');
    expect(documentMarkup).toContain('<html lang="ja">');
    expect(documentMarkup).toContain('<meta charset="UTF-8" />');
    expect(documentMarkup).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    expect(documentMarkup).toContain('<title>政策評価ビュー &lt;v2&gt;</title>');
    expect(documentMarkup).toContain('<style>');
    expect(styles).toContain('.generated-view-v2__action-trigger');
    expect(styles).toContain('.generated-view-v2__grid[data-columns="2"]');
    expect(styles).toContain('.generated-view-v2__callout[data-tone="warning"]');
  });
});
