import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import App from '@/App';
import { promptQuestionCapabilityBaseline } from '@/test/promptSearchBaseline';
import { createGeneratedUICompatibilityFixture } from '@/test/generatedUICompat';
import type { WorkspaceState } from '@/types';

const {
  generativePolicyViewSpy,
  useWorkspacePipelineControllerSpy,
  createInitialWorkspaceStateSpy,
  resolveBackendConnectionSpy,
  resetOCRBackendClientSpy,
  getStoredGeminiApiKeySpy,
  maskGeminiApiKeySpy,
  setStoredGeminiApiKeySpy,
  selectWorkspacePresentationStateSpy,
  exportWorkspaceAsZipSpy,
} = vi.hoisted(() => ({
  generativePolicyViewSpy: vi.fn(),
  useWorkspacePipelineControllerSpy: vi.fn(),
  createInitialWorkspaceStateSpy: vi.fn(),
  resolveBackendConnectionSpy: vi.fn(),
  resetOCRBackendClientSpy: vi.fn(),
  getStoredGeminiApiKeySpy: vi.fn(),
  maskGeminiApiKeySpy: vi.fn(),
  setStoredGeminiApiKeySpy: vi.fn(),
  selectWorkspacePresentationStateSpy: vi.fn(),
  exportWorkspaceAsZipSpy: vi.fn(),
}));
let workspaceStateFixture: WorkspaceState;
const submitPromptQuestionSpy = vi.fn();

vi.mock('@/components/GenerativePolicyView', () => ({
  GenerativePolicyView: (props: unknown) => {
    generativePolicyViewSpy(props);
    return <div data-testid="generative-policy-view-proxy" />;
  },
}));

vi.mock('@/components/PdfUploader', () => ({
  PdfUploader: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" data-testid="pdf-uploader-proxy" disabled={disabled}>
      upload
    </button>
  ),
}));

vi.mock('@/components/WorkspaceReviewPanel', () => ({
  WorkspaceReviewPanel: ({ isOpen }: { isOpen?: boolean }) =>
    isOpen ? <div data-testid="workspace-review-panel-proxy" /> : null,
}));

vi.mock('@/lib/appSettings', () => ({
  getStoredGeminiApiKey: getStoredGeminiApiKeySpy,
  maskGeminiApiKey: maskGeminiApiKeySpy,
  setStoredGeminiApiKey: setStoredGeminiApiKeySpy,
}));

vi.mock('@/lib/ocrBackendClient', () => ({
  resolveBackendConnection: resolveBackendConnectionSpy,
  resetOCRBackendClient: resetOCRBackendClientSpy,
}));

vi.mock('@/lib/workspaceStateAdapters', () => ({
  selectWorkspacePresentationState: selectWorkspacePresentationStateSpy,
}));

vi.mock('@/lib/exporters', () => ({
  exportWorkspaceAsZip: exportWorkspaceAsZipSpy,
}));

vi.mock('@/lib/useWorkspacePipelineController', () => ({
  createInitialWorkspaceState: createInitialWorkspaceStateSpy,
  useWorkspacePipelineController: useWorkspacePipelineControllerSpy,
}));

describe('App GeneratedUI compatibility', () => {
  beforeEach(() => {
    generativePolicyViewSpy.mockClear();
    useWorkspacePipelineControllerSpy.mockReset();
    createInitialWorkspaceStateSpy.mockReset();
    resolveBackendConnectionSpy.mockReset();
    resetOCRBackendClientSpy.mockReset();
    getStoredGeminiApiKeySpy.mockReset();
    maskGeminiApiKeySpy.mockReset();
    setStoredGeminiApiKeySpy.mockReset();
    selectWorkspacePresentationStateSpy.mockReset();
    exportWorkspaceAsZipSpy.mockReset();

    workspaceStateFixture = {
      sessionId: 'session-compat',
      sourceRegistry: [],
      documents: [],
      generatedUI: null,
      activeDeliveryMode: 'interactive-browser',
      phase: 'idle',
      isProcessing: false,
      error: null,
      lastUpdatedAt: '2026-03-12T09:00:00.000Z',
    };

    createInitialWorkspaceStateSpy.mockImplementation(() => workspaceStateFixture);
    useWorkspacePipelineControllerSpy.mockReturnValue({
      appendDocuments: vi.fn(),
      handleAddDiscoveredCandidate: vi.fn(),
      handleDeliveryMode: vi.fn(),
      handleImportSource: vi.fn(),
      handleResetWorkspace: vi.fn(),
      resetGenerationKey: vi.fn(),
      submitPromptQuestion: submitPromptQuestionSpy,
    });
    submitPromptQuestionSpy.mockReset();
    submitPromptQuestionSpy.mockResolvedValue(null);
    exportWorkspaceAsZipSpy.mockResolvedValue(undefined);
    resolveBackendConnectionSpy.mockResolvedValue({
      apiUrl: 'http://127.0.0.1:8000',
      ready: true,
      error: null,
      mismatchReason: null,
      probeKind: 'policyeval-backend',
    });
    getStoredGeminiApiKeySpy.mockReturnValue('');
    maskGeminiApiKeySpy.mockImplementation((value: string) => value || '未設定');
    selectWorkspacePresentationStateSpy.mockReturnValue({
      documentCards: [],
      projectExplorerItems: [],
      selectedDocument: null,
      workspaceSummary: null,
    });
  });

  it('passes the current GeneratedUI object and generation-phase processing flag into the renderer consumer', async () => {
    const generatedUI = createGeneratedUICompatibilityFixture();
    workspaceStateFixture = {
      ...workspaceStateFixture,
      generatedUI,
      isProcessing: true,
      phase: 'generation',
    };

    render(<App />);

    await waitFor(() => {
      expect(useWorkspacePipelineControllerSpy).toHaveBeenCalled();
      expect(generativePolicyViewSpy).toHaveBeenCalled();
    });

    const latestProps = generativePolicyViewSpy.mock.calls.at(-1)?.[0] as {
      generatedUI: typeof generatedUI;
      viewPlanV2?: unknown;
      plannerFallback?: unknown;
      isProcessing: boolean;
      error: string | null;
    };

    const controllerArgs = useWorkspacePipelineControllerSpy.mock.calls.at(-1)?.[0] as {
      workspace: WorkspaceState;
    };

    expect(controllerArgs.workspace).toBe(workspaceStateFixture);
    expect(controllerArgs.workspace.generatedUI).toBe(generatedUI);
    expect(latestProps.generatedUI).toBe(generatedUI);
    expect(latestProps.viewPlanV2).toBeNull();
    expect(latestProps.plannerFallback).toBeNull();
    expect(latestProps.isProcessing).toBe(true);
    expect(latestProps.error).toBeNull();
  });

  it('presents a prompt-first composer shell with inline PDF attachment affordance and closed inspectors', async () => {
    render(<App />);

    expect(screen.getByPlaceholderText('知りたいことや作りたい説明面を書いてください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDFを選択' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '参考PDFを添付' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '生成プレビュー' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '抽出確認は必要なときだけ開く' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '出典と収集導線をあとから辿れるように保つ' })).toBeInTheDocument();
    expect(screen.getByText('PolicyEval GOS')).toBeInTheDocument();
    expect(screen.getByTestId('briefing-preview-shell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '読み込み状況' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-uploader-proxy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-review-panel-proxy')).not.toBeInTheDocument();
    expect(screen.queryByText('入力の流れ')).not.toBeInTheDocument();
  });

  it('surfaces startup mismatch details before inline PDF attachment can begin', async () => {
    resolveBackendConnectionSpy.mockResolvedValue({
      apiUrl: 'http://127.0.0.1:8000',
      ready: false,
      error: 'Configured backend target http://127.0.0.1:8000 is not a compatible PolicyEval OCR backend.',
      mismatchReason: 'Backend OpenAPI schema is missing /repair/opencode.',
      probeKind: 'wrong-service',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('OCR バックエンド起動エラー')).toBeInTheDocument();
    });

    expect(screen.getByText(/Configured backend target http:\/\/127\.0\.0\.1:8000 is not a compatible PolicyEval OCR backend\./)).toBeInTheDocument();
    expect(screen.getByText('Target: http://127.0.0.1:8000')).toBeInTheDocument();
    expect(screen.getByText('Mismatch: Backend OpenAPI schema is missing /repair/opencode.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDFを選択' })).toBeDisabled();
  });

  it('captures the sibling question-to-briefing baseline as a fixture-backed contract', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '生成プレビュー' })).toBeInTheDocument();
    });

    expect(promptQuestionCapabilityBaseline.productReference.questionModes).toEqual(['fresh', 'follow-up']);
    expect(promptQuestionCapabilityBaseline.freshQuestionFlow).toEqual({
      requiresNonEmptyPrompt: true,
      resetsConversation: true,
      clearsPromptAfterSuccess: true,
    });
    expect(promptQuestionCapabilityBaseline.followUpFlow).toEqual({
      requiresExistingConversation: true,
      carriesForwardMessages: true,
      keepsQuestionAsUserTurn: true,
    });
    expect(promptQuestionCapabilityBaseline.optionalPdfContext).toEqual({
      enabled: true,
      maxSelectedFiles: 1,
      extractBeforeGenerate: true,
    });
    expect(promptQuestionCapabilityBaseline.outputSurface.primaryExperience).toBe('briefing-first');
    expect(screen.getByTestId('briefing-preview-shell')).toBeInTheDocument();
  });

  it('submits a fresh prompt as a first-class generation trigger', async () => {
    submitPromptQuestionSpy.mockResolvedValue({
      messages: [
        { role: 'user', content: '地域交通の争点をやさしく説明して' },
        { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
      ],
      generatedUi: createGeneratedUICompatibilityFixture(),
      exportDocuments: [],
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('知りたいことや作りたい説明面を書いてください。'), {
      target: { value: '地域交通の争点をやさしく説明して' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新規で生成' }));

    await waitFor(() => {
      expect(submitPromptQuestionSpy).toHaveBeenCalledWith({
        prompt: '地域交通の争点をやさしく説明して',
        mode: 'fresh',
        messages: [],
        contextDocumentId: null,
      });
    });

    expect(screen.getByText('Briefing を更新しました: 地域交通再編計画ビュー')).toBeInTheDocument();
    expect(screen.getByText('出典と来歴')).toBeInTheDocument();
    expect(screen.getByText('文脈: 添付なし / 質問起点の文書直読')).toBeInTheDocument();
  });

  it('submits a follow-up prompt with preserved conversation context', async () => {
    submitPromptQuestionSpy
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: '地域交通の争点をやさしく説明して' },
          { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
        ],
        generatedUi: createGeneratedUICompatibilityFixture(),
        exportDocuments: [],
      })
      .mockResolvedValueOnce({
        messages: [
          { role: 'user', content: '地域交通の争点をやさしく説明して' },
          { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
          { role: 'user', content: '次は議員向けに論点を絞って' },
          { role: 'assistant', content: 'Briefing を更新しました: 議員向け 地域交通再編計画ビュー' },
        ],
        generatedUi: createGeneratedUICompatibilityFixture(),
        exportDocuments: [],
      });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('知りたいことや作りたい説明面を書いてください。'), {
      target: { value: '地域交通の争点をやさしく説明して' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新規で生成' }));

    await waitFor(() => {
      expect(screen.getByText('Briefing を更新しました: 地域交通再編計画ビュー')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('知りたいことや作りたい説明面を書いてください。'), {
      target: { value: '次は議員向けに論点を絞って' },
    });
    fireEvent.click(screen.getByRole('button', { name: '追質問で更新' }));

    await waitFor(() => {
      expect(submitPromptQuestionSpy).toHaveBeenLastCalledWith({
        prompt: '次は議員向けに論点を絞って',
        mode: 'follow-up',
        messages: [
          { role: 'user', content: '地域交通の争点をやさしく説明して' },
          { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
        ],
        contextDocumentId: null,
      });
    });

    expect(screen.getByText('Briefing を更新しました: 議員向け 地域交通再編計画ビュー')).toBeInTheDocument();
  });

  it('exports prompt-led runtime state with prompt session and prompt export documents', async () => {
    const generatedUi = createGeneratedUICompatibilityFixture();
    const promptExportDocument = {
      ...(workspaceStateFixture.documents[0] || {
        id: 'prompt-doc-1',
        name: 'prompt-doc.txt',
        processing: { status: 'completed' },
      }),
    } as WorkspaceState['documents'][number];

    workspaceStateFixture = {
      ...workspaceStateFixture,
      generatedUI: generatedUi,
      phase: 'delivery',
    };

    submitPromptQuestionSpy.mockResolvedValue({
      messages: [
        { role: 'user', content: '地域交通の争点をやさしく説明して' },
        { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
      ],
      generatedUi,
      exportDocuments: [promptExportDocument],
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('知りたいことや作りたい説明面を書いてください。'), {
      target: { value: '地域交通の争点をやさしく説明して' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新規で生成' }));

    await waitFor(() => {
      expect(submitPromptQuestionSpy).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'ZIP書き出し' }));

    await waitFor(() => {
      expect(exportWorkspaceAsZipSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedUI: generatedUi,
          documents: [promptExportDocument],
          promptSession: {
            messages: [
              { role: 'user', content: '地域交通の争点をやさしく説明して' },
              { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
            ],
            contextDocumentId: null,
          },
        })
      );
    });
  });

  it('clears stale prompt export state when document-driven generation takes over', async () => {
    const generatedUi = createGeneratedUICompatibilityFixture();
    const promptExportDocument = {
      ...(workspaceStateFixture.documents[0] || {
        id: 'prompt-doc-1',
        name: 'prompt-doc.txt',
        processing: { status: 'completed' },
      }),
    } as WorkspaceState['documents'][number];
    const documentDrivenWorkspaceDocument = {
      ...(workspaceStateFixture.documents[0] || {}),
      id: 'workspace-doc-1',
      name: 'workspace-doc.pdf',
      processing: { status: 'completed' },
      collectionSource: {
        id: 'source-workspace-doc-1',
        municipality: '岩手県',
        label: 'workspace-doc.pdf',
        sourceUrl: '',
        discoveryStrategy: 'manual-upload',
        status: 'manual',
      },
      ingestionPath: 'pdf_text_fast_path',
      routeDecision: null,
    } as WorkspaceState['documents'][number];

    workspaceStateFixture = {
      ...workspaceStateFixture,
      generatedUI: generatedUi,
      documents: [documentDrivenWorkspaceDocument],
      phase: 'delivery',
    };

    submitPromptQuestionSpy.mockResolvedValue({
      messages: [
        { role: 'user', content: '地域交通の争点をやさしく説明して' },
        { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
      ],
      generatedUi,
      exportDocuments: [promptExportDocument],
    });

    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('知りたいことや作りたい説明面を書いてください。'), {
      target: { value: '地域交通の争点をやさしく説明して' },
    });
    fireEvent.click(screen.getByRole('button', { name: '新規で生成' }));

    await waitFor(() => {
      expect(submitPromptQuestionSpy).toHaveBeenCalled();
    });

    const controllerArgs = useWorkspacePipelineControllerSpy.mock.calls.at(-1)?.[0] as {
      onPromptSessionInvalidated?: () => void;
    };
    await act(async () => {
      controllerArgs.onPromptSessionInvalidated?.();
    });

    fireEvent.click(screen.getByRole('button', { name: 'ZIP書き出し' }));

    await waitFor(() => {
      expect(exportWorkspaceAsZipSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          documents: [documentDrivenWorkspaceDocument],
          promptSession: null,
        })
      );
    });
  });
});
