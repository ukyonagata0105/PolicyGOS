import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GenerativePolicyView } from '@/components/GenerativePolicyView';
import { createGeneratedUICompatibilityFixture } from '@/test/generatedUICompat';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';

describe('GenerativePolicyView compatibility', () => {
  it('keeps the empty-state contract when no generated UI exists yet', () => {
    render(<GenerativePolicyView generatedUI={null} isProcessing={false} error={null} />);

    expect(screen.getByText('生成プレビューはまだありません')).toBeInTheDocument();
    expect(screen.getByText('PDF を追加すると、文書全体をもとにした説明面がここに現れます。')).toBeInTheDocument();
  });

  it('renders renderer-driven markup and top-level GeneratedUI metadata', () => {
    const generatedUI = createGeneratedUICompatibilityFixture();
    const { container } = render(
      <GenerativePolicyView generatedUI={generatedUI} isProcessing={false} error={null} />
    );

    expect(screen.getByRole('heading', { name: generatedUI.title })).toBeInTheDocument();
    expect(screen.getByText(generatedUI.summary)).toBeInTheDocument();
    expect(screen.getByText('生成済み説明面')).toBeInTheDocument();
    expect(screen.getAllByText(generatedUI.provider).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(generatedUI.model).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('generated-runtime-version')).toHaveTextContent('v1');
    expect(container.querySelector('style')?.textContent).toContain('.generated-view__canvas');
    expect(container.querySelector('.generated-view-shell .generated-view')).not.toBeNull();
    expect(container.querySelector('#overview')).not.toBeNull();
    expect(container.querySelector('a[href="#detail-project-1"]')?.textContent).toContain('地域交通再編事業');
    expect(container.querySelector('#detail-project-1 .generated-view__detail-back')?.getAttribute('href')).toBe('#overview');
  });

  it('prefers a validated v2 runtime plan when provided', () => {
    const generatedUI = createGeneratedUICompatibilityFixture();
    const viewPlanV2: ViewPlanV2 = {
      version: 'v2',
      root: {
        id: 'page-root',
        kind: 'page',
        title: 'Runtime Briefing',
        description: 'prompt-conditioned briefing for resident',
        children: [
          {
            id: 'overview-section',
            kind: 'section',
            children: [
              {
                id: 'stack-1',
                kind: 'stack',
                gap: 'md',
                children: [
                  {
                    id: 'hero-1',
                    kind: 'hero',
                    headline: 'Runtime Hero',
                    body: 'v2 body',
                    evidence: [
                      { sourceDocumentId: 'doc-1', sourceReference: 'page-1' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const { container } = render(
      <GenerativePolicyView
        generatedUI={generatedUI}
        viewPlanV2={viewPlanV2}
        plannerFallback={null}
        isProcessing={false}
        error={null}
      />
    );

    expect(screen.getByText('生成ランタイム v2')).toBeInTheDocument();
    expect(screen.getByTestId('generated-runtime-version')).toHaveTextContent('v2');
    expect(screen.getByRole('heading', { name: 'Runtime Briefing' })).toBeInTheDocument();
    expect(container.querySelector('.generated-view-v2')).not.toBeNull();
    expect(container.querySelector('.generated-view')).toBeNull();
  });

  it('renders prompt-first HTML runtime in an iframe when htmlDocument is present', () => {
    const generatedUI = {
      ...createGeneratedUICompatibilityFixture(),
      renderMode: 'html' as const,
      htmlDocument:
        '<!DOCTYPE html><html lang="ja"><head><title>HTML Runtime</title></head><body><main><h1>HTML Runtime</h1></main></body></html>',
      warnings: [],
    };

    const { container } = render(
      <GenerativePolicyView generatedUI={generatedUI} isProcessing={false} error={null} />
    );

    expect(screen.getByText('HTML ランタイム')).toBeInTheDocument();
    expect(screen.getByTestId('generated-runtime-version')).toHaveTextContent('html');
    expect(container.querySelector('iframe[title="地域交通再編計画ビュー"]')).not.toBeNull();
    expect(container.querySelector('.generated-view-shell')).toBeNull();
  });
});
