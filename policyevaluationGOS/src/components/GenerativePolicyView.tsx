import { useMemo } from 'react';

import {
  getGeneratedViewStyles,
  renderGeneratedViewMarkup,
} from '@/lib/generatedViewRenderer';
import {
  getGeneratedViewV2Styles,
  renderGeneratedViewV2Markup,
} from '@/lib/generatedViewRendererV2';
import type { ViewPlannerV1FallbackSignal } from '@/lib/viewPlanner';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';
import type { GeneratedUI } from '@/types';

interface GenerativePolicyViewProps {
  generatedUI: GeneratedUI | null;
  viewPlanV2?: ViewPlanV2 | null;
  plannerFallback?: ViewPlannerV1FallbackSignal | null;
  isProcessing: boolean;
  error: string | null;
}

export function GenerativePolicyView({
  generatedUI,
  viewPlanV2,
  plannerFallback,
  isProcessing,
  error,
}: GenerativePolicyViewProps) {
  const renderedMarkup = useMemo(() => {
    if (generatedUI?.renderMode === 'html' && generatedUI.htmlDocument) {
      return '';
    }

    if (viewPlanV2) {
      return renderGeneratedViewV2Markup(viewPlanV2);
    }

    if (!generatedUI) {
      return '';
    }

    return renderGeneratedViewMarkup(generatedUI);
  }, [generatedUI, viewPlanV2]);

  if (error) {
    return (
      <div className="rounded-[1.6rem] border border-[#d7b1a8] bg-[rgba(184,82,56,0.08)] p-6">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#8d4b3d]">Preview issue</p>
        <h3 className="mt-2 text-2xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
          生成ビューを整えられませんでした
        </h3>
        <p className="mt-3 text-sm leading-7 text-[#7b3427]">{error}</p>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="rounded-[1.6rem] border border-[var(--border-soft)] bg-[color:var(--surface-muted)] p-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--tone-accent)] border-t-transparent" />
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">プレビュー</p>
            <h3 className="mt-1 text-2xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
              説明面を静かに更新しています
            </h3>
            <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
              文書セットとユーザー属性に合わせて、説明の順序と見せ方を再構成しています。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!generatedUI && !viewPlanV2) {
    return (
      <div className="rounded-[1.8rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] p-8 text-center shadow-[var(--shadow-soft)]">
        <div className="sr-only" data-testid="generated-runtime-version">v1</div>
        <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">プレビュー</p>
        <h3 className="mt-3 text-3xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
          生成プレビューはまだありません
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
          PDF を追加すると、文書全体をもとにした説明面がここに現れます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sr-only" data-testid="generated-runtime-version">
        {viewPlanV2 ? 'v2' : generatedUI?.renderMode === 'html' ? 'html' : 'v1'}
      </div>
      {plannerFallback ? (
        <div className="sr-only" data-testid="planner-fallback-reason">
          {plannerFallback.reasonCode}
        </div>
      ) : null}
      <style>{viewPlanV2 ? getGeneratedViewV2Styles() : getGeneratedViewStyles()}</style>
      <div className="rounded-[1.65rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
              {viewPlanV2 ? '生成ランタイム v2' : generatedUI?.renderMode === 'html' ? 'HTML ランタイム' : '生成済み説明面'}
            </p>
            <h2 className="mt-2 text-3xl leading-tight text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
              {viewPlanV2 ? (viewPlanV2.root.title || generatedUI?.title || '生成ランタイム') : generatedUI!.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              {viewPlanV2
                ? (viewPlanV2.root.description || generatedUI?.summary || '')
                : generatedUI!.summary}
            </p>
            {plannerFallback ? (
              <p className="mt-2 text-xs text-[#8e6b3d]">
                v2 プランナー fallback: {plannerFallback.reasonCode}
              </p>
            ) : null}
            {generatedUI?.warnings && generatedUI.warnings.length > 0 ? (
              <p className="mt-2 text-xs text-[#8e6b3d]">
                {generatedUI.warnings[0]}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-muted)] px-3 py-1">
              {viewPlanV2 ? 'bounded-runtime' : generatedUI?.provider}
            </span>
            <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-muted)] px-3 py-1">
              {viewPlanV2 ? 'view-plan-v2' : generatedUI?.model}
            </span>
          </div>
        </div>
      </div>

      {generatedUI?.renderMode === 'html' && generatedUI.htmlDocument ? (
        <div className="overflow-hidden rounded-[1.65rem] border border-[var(--border-soft)] bg-white shadow-[var(--shadow-soft)]">
          <iframe
            title={generatedUI.title}
            srcDoc={generatedUI.htmlDocument}
            className="min-h-[860px] w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        <div
          className="generated-view-shell"
          dangerouslySetInnerHTML={{ __html: renderedMarkup }}
        />
      )}
    </div>
  );
}
