import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkspaceReviewPanel } from '@/components/WorkspaceReviewPanel';
import { selectWorkspaceDocumentReviewDebug } from '@/lib/workspaceStateAdapters';
import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type { WorkspaceProjectExplorerItem } from '@/types';

function createSelectedDocument() {
  const document = createWorkspaceDocument(
    createPdfFile(new File(['policy'], 'policy.pdf', { type: 'application/pdf' }))
  );

  document.collectionSource.municipality = '盛岡市';
  document.processing = {
    provider: 'gemini',
    status: 'completed',
    progress: 100,
    message: '処理完了',
  };
  document.structuredData = {
    title: '防災計画',
    municipality: '盛岡市',
    summary: '避難体制を更新する。',
    keyPoints: [{ text: '避難所訓練を増やす', importance: 'high' }],
    category: 'public-safety',
  };
  document.reviewItems = [
    {
      id: 'review-1',
      documentId: document.id,
      severity: 'high',
      reason: '指標要確認',
      status: 'open',
    },
  ];
  document.rawCandidateRows = [
    {
      id: 'raw-1',
      sourceDocumentId: document.id,
      extractorStrategy: 'sheet',
      sourceReference: 'R-1',
      sectionPath: ['防災'],
      projectNameCandidate: '避難支援強化事業',
      projectSummaryCandidate: '避難体制を更新する',
      rowFields: {},
      confidence: 0.8,
      candidateKind: 'project',
    },
  ];
  document.candidateRows = [...document.rawCandidateRows];
  document.rowDecisions = [
    {
      sourceReference: 'R-1',
      decision: 'project',
      sectionPath: ['防災'],
      projectName: '避難支援強化事業',
      projectSummary: '避難体制を更新する',
      supportingFields: [],
      supportingTextSpans: [],
      decisionNotes: ['採用'],
      qualityHints: ['列整列済み'],
      confidence: 0.8,
      reviewFlags: ['指標要確認'],
    },
  ];
  document.normalizedRows = [
    {
      sourceReference: 'R-1',
      sectionPath: ['防災'],
      projectNumber: '1-1',
      projectName: '避難支援強化事業',
      projectSummary: '避難体制を更新する',
      activityIndicatorName: '訓練回数',
      outcomeIndicatorName: '避難完了率',
      confidence: 0.82,
      reviewFlags: ['指標要確認'],
    },
  ];
  document.repairedNormalizedRows = [...document.normalizedRows];
  document.tableResults = [
    {
      status: 'unparsed',
      table: {
        id: 'table-1',
        artifactId: 'artifact-1',
        parserId: 'no_parse',
        preview: 'preview',
        reason: 'layout only',
        issues: [],
      },
      decision: {
        parserId: 'no_parse',
        confidence: 0.45,
        fallbackParserIds: [],
        provider: 'heuristic',
        model: 'n/a',
      },
    },
  ];

  return selectWorkspaceDocumentReviewDebug(document);
}

function createProjectExplorerItems(documentId: string): WorkspaceProjectExplorerItem[] {
  return [
    {
      id: 'project-1',
      sourceDocumentId: documentId,
      sourceDocumentName: 'policy.pdf',
      municipality: '盛岡市',
      projectNumber: '1-1',
      projectName: '避難支援強化事業',
      projectSummary: '避難体制を更新する',
      sectionPath: ['防災', '避難'],
      activityIndicatorCount: 1,
      outcomeIndicatorCount: 1,
      confidencePercent: 82,
      publicationStatus: 'review',
      reviewFlags: ['指標要確認'],
      publicationNotes: ['確認後公開'],
    },
  ];
}

describe('WorkspaceReviewPanel', () => {
  it('keeps secondary surfaces bounded until the review workspace is opened', () => {
    const selectedDocument = createSelectedDocument();

    render(
      <WorkspaceReviewPanel
        selectedDocument={selectedDocument}
        projectExplorerItems={createProjectExplorerItems(selectedDocument.display.id)}
        isOpen={false}
        onToggle={() => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: 'Review Workspace' }).textContent).toBe('Review Workspace');
    expect(
      screen.getByText('生成ビューを主面に保ちつつ、抽出確認はこのワークスペース内で切り替えます。').textContent
    ).toBe('生成ビューを主面に保ちつつ、抽出確認はこのワークスペース内で切り替えます。');
    expect(screen.queryByText('避難支援強化事業')).toBeNull();
    expect(screen.queryByText('Parsed tables')).toBeNull();
  });

  it('switches between explorer, policy, and debug views inside the bounded workspace', () => {
    const selectedDocument = createSelectedDocument();

    render(
      <WorkspaceReviewPanel
        selectedDocument={selectedDocument}
        projectExplorerItems={createProjectExplorerItems(selectedDocument.display.id)}
        isOpen
        onToggle={() => undefined}
      />
    );

    expect(screen.getByText('避難支援強化事業').textContent).toBe('避難支援強化事業');

    fireEvent.click(screen.getByRole('button', { name: 'Structured policy' }));
    expect(screen.getByRole('heading', { name: '防災計画' }).textContent).toBe('防災計画');

    fireEvent.click(screen.getByRole('button', { name: 'Debug trace' }));
    expect(screen.getByText('Parsed tables').textContent).toBe('Parsed tables');
    expect(screen.getAllByText('指標要確認').length).toBeGreaterThan(0);
  });
});
