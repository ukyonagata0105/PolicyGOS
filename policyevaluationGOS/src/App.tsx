import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';

import { GenerativePolicyView } from '@/components/GenerativePolicyView';
import { WorkspaceReviewPanel } from '@/components/WorkspaceReviewPanel';
import { getStoredGeminiApiKey, maskGeminiApiKey, setStoredGeminiApiKey } from '@/lib/appSettings';
import { exportWorkspaceAsZip } from '@/lib/exporters';
import {
  resetOCRBackendClient,
  resolveBackendConnection,
  type BackendConnectionState,
} from '@/lib/ocrBackendClient';
import {
  createInitialWorkspaceState,
  useWorkspacePipelineController,
} from '@/lib/useWorkspacePipelineController';
import type { ViewPlannerV1FallbackSignal } from '@/lib/viewPlanner';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';
import { createPdfFile } from '@/lib/workspace';
import { selectWorkspacePresentationState } from '@/lib/workspaceStateAdapters';
import type {
  AudienceType,
  CollectionSource,
  DisplayConstraint,
  ProcessingJob,
  PromptConversationMessage,
  ReadingPreference,
  UserProfile,
  WorkspaceState,
} from '@/types';

const DEFAULT_USER_PROFILE: UserProfile = {
  audience: 'resident',
  readingPreference: 'summary',
  displayConstraint: 'desktop',
};

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(createInitialWorkspaceState);
  const [backendState, setBackendState] = useState<BackendConnectionState>({
    apiUrl: '',
    ready: false,
    error: null,
    mismatchReason: null,
    probeKind: null,
  });
  const [backendLoading, setBackendLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [showReviewWorkspace, setShowReviewWorkspace] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewPlanV2, setViewPlanV2] = useState<ViewPlanV2 | null>(null);
  const [plannerFallback, setPlannerFallback] = useState<ViewPlannerV1FallbackSignal | null>(null);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [geminiApiKeySaved, setGeminiApiKeySaved] = useState('');
  const [geminiConfigRevision, setGeminiConfigRevision] = useState(0);
  const [promptInput, setPromptInput] = useState('');
  const [promptMessages, setPromptMessages] = useState<PromptConversationMessage[]>([]);
  const [promptContextDocumentId, setPromptContextDocumentId] = useState('');
  const [promptExportDocuments, setPromptExportDocuments] = useState<WorkspaceState['documents']>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);

  const viewContainerRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const {
    appendDocuments,
    handleAddDiscoveredCandidate,
    handleDeliveryMode,
    handleImportSource,
    handleResetWorkspace,
    resetGenerationKey,
    submitPromptQuestion,
  } = useWorkspacePipelineController({
    workspace,
    setWorkspace,
    backendState,
    userProfile,
    geminiApiKeySaved,
    geminiConfigRevision,
    setSelectedDocumentId,
    setViewPlanV2,
    setPlannerFallback,
    onRequireGeminiSettings: () => setShowSettings(true),
    onResetShellState: () => {
      setShowReviewWorkspace(false);
      setPromptInput('');
      setPromptMessages([]);
      setPromptContextDocumentId('');
      setPromptExportDocuments([]);
      setAttachmentNotice(null);
    },
    onPromptSessionInvalidated: () => {
      setPromptMessages([]);
      setPromptContextDocumentId('');
      setPromptExportDocuments([]);
      setAttachmentNotice(null);
    },
  });

  useEffect(() => {
    const storedKey = getStoredGeminiApiKey();
    setGeminiApiKeyInput(storedKey);
    setGeminiApiKeySaved(storedKey);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadBackendConfig = async () => {
      setBackendLoading(true);
      try {
        const connection = await resolveBackendConnection();
        if (!isMounted) {
          return;
        }

        resetOCRBackendClient();
        setBackendState(connection);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setBackendState({
          apiUrl: '',
          ready: false,
          error: error instanceof Error ? error.message : 'バックエンド設定の取得に失敗しました',
          mismatchReason: null,
          probeKind: null,
        });
      } finally {
        if (isMounted) {
          setBackendLoading(false);
        }
      }
    };

    void loadBackendConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (workspace.activeDeliveryMode !== 'fullscreen-present') {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    const target = viewContainerRef.current;
    if (!target || document.fullscreenElement === target) {
      return;
    }

    void target.requestFullscreen().catch(() => undefined);
  }, [workspace.activeDeliveryMode]);

  useEffect(() => {
    if (workspace.documents.length === 0) {
      if (promptContextDocumentId) {
        setPromptContextDocumentId('');
      }
      return;
    }

    const promptContextStillExists = workspace.documents.some((document) => document.id === promptContextDocumentId);
    if (!promptContextDocumentId || !promptContextStillExists) {
      setPromptContextDocumentId(workspace.documents.at(-1)?.id || '');
    }
  }, [promptContextDocumentId, workspace.documents]);

  const handleSaveGeminiApiKey = () => {
    setStoredGeminiApiKey(geminiApiKeyInput);
    const saved = geminiApiKeyInput.trim();
    setGeminiApiKeySaved(saved);
    setGeminiConfigRevision((current) => current + 1);
    resetGenerationKey();
    setShowSettings(false);
  };

  const handleClearGeminiApiKey = () => {
    setGeminiApiKeyInput('');
    setStoredGeminiApiKey('');
    setGeminiApiKeySaved('');
    setGeminiConfigRevision((current) => current + 1);
    resetGenerationKey();
  };

  const presentationState = useMemo(
    () => selectWorkspacePresentationState(workspace, selectedDocumentId),
    [selectedDocumentId, workspace]
  );
  const { projectExplorerItems, selectedDocument, workspaceSummary } = presentationState;
  const surfaceMode = useMemo(
    () => deriveWorkspaceSurfaceMode(workspace.documents, promptMessages),
    [promptMessages, workspace.documents]
  );
  const surfaceRouteLabel = surfaceModeLabel(surfaceMode);
  const sourceAccessSummary = useMemo(
    () => buildSourceAccessSummary(workspace.documents, workspace.sourceRegistry, promptMessages, promptContextDocumentId),
    [promptContextDocumentId, promptMessages, workspace.documents, workspace.sourceRegistry]
  );
  const promptAttachmentDocument = useMemo(
    () => workspace.documents.find((document) => document.id === promptContextDocumentId) || null,
    [promptContextDocumentId, workspace.documents]
  );
  const attachmentDisabled = backendLoading || workspace.isProcessing || !backendState.ready;

  const handlePromptAttachmentFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      setAttachmentNotice('PDF ファイルのみ添付できます。');
      return;
    }

    const createdDocuments = pdfFiles.map(createPdfFile);
    appendDocuments(createdDocuments);
    setPromptContextDocumentId(createdDocuments.at(-1)?.id || '');
    setAttachmentNotice(
      pdfFiles.length === files.length
        ? null
        : 'PDF 以外のファイルは無視し、PDF だけを composer に添付しました。'
    );
  };

  const handleAttachmentInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      handlePromptAttachmentFiles(event.target.files);
      event.target.value = '';
    }
  };

  const handleSubmitPrompt = async (mode: 'fresh' | 'follow-up') => {
    const result = await submitPromptQuestion({
      prompt: promptInput,
      mode,
      messages: mode === 'fresh' ? [] : promptMessages,
      contextDocumentId: promptContextDocumentId || null,
    });

    if (!result) {
      return;
    }

    setPromptMessages(result.messages);
    setPromptInput('');
    setPromptExportDocuments(result.exportDocuments);
  };

  const handleZipExport = async () => {
    if (!workspace.generatedUI) {
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        error: 'ZIP 出力するには Briefing UI が必要です',
        activeDeliveryMode: 'interactive-browser',
      }));
      return;
    }

    await exportWorkspaceAsZip({
      generatedUI: workspace.generatedUI,
      documents: promptMessages.length > 0 && promptExportDocuments.length > 0 ? promptExportDocuments : workspace.documents,
      userProfile,
      viewPlanV2,
      sourceRegistry: workspace.sourceRegistry,
      promptSession:
        promptMessages.length > 0
          ? {
              messages: promptMessages,
              contextDocumentId: promptContextDocumentId || null,
            }
          : null,
    });

    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      activeDeliveryMode: 'zip-export',
      phase: 'delivery',
      error: null,
    }));
  };

  return (
    <div className="app-shell min-h-screen text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-soft)]/80 bg-[color:var(--surface)]/90 backdrop-blur-xl">
        <div className="container-custom py-7 lg:py-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                  サービス
                </span>
                <p className="text-sm font-medium tracking-[0.16em] text-[var(--text-primary)] sm:text-base">PolicyEval GOS</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-2 text-xs uppercase tracking-[0.16em] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                  設定
              </button>
                <StatusPill label="セッション" value={workspace.sessionId.slice(0, 8)} />
                <StatusPill label="表示" value={surfaceRouteLabel} />
                <StatusPill label="文書" value={`${workspace.documents.length}`} />
                <StatusPill label="段階" value={workspace.phase} />
            </div>
          </div>
        </div>
      </header>

      <main className="container-custom py-8 lg:py-10">
        {(backendLoading || backendState.error || !backendState.ready) && (
          <SurfaceNotice danger={Boolean(backendState.error)}>
            <p className="text-sm font-medium">
              {backendState.error ? 'OCR バックエンド起動エラー' : 'OCR バックエンドを起動中'}
            </p>
            <p className="mt-1 text-sm leading-6 opacity-90">
              {backendState.error || 'born-digital PDF は fast path で処理し、必要な場合だけ OCR fallback を使います。'}
            </p>
            {backendState.apiUrl && (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] opacity-75">Target: {backendState.apiUrl}</p>
            )}
            {backendState.mismatchReason && backendState.mismatchReason !== backendState.error && (
              <p className="mt-2 text-sm leading-6 opacity-90">Mismatch: {backendState.mismatchReason}</p>
            )}
          </SurfaceNotice>
        )}

        {workspace.error && (
          <div className="mt-6">
            <SurfaceNotice danger>
              <p className="text-sm font-medium">ワークスペースエラー</p>
              <p className="mt-1 text-sm leading-6 opacity-90">{workspace.error}</p>
            </SurfaceNotice>
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(380px,1.08fr)] xl:items-start">
          <section className="space-y-6 xl:pr-2">
            <SurfaceCard tone="warm" className="overflow-hidden">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">入力</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                      4295 の入力導線に合わせ、質問欄の中で PDF を添付し、そのまま説明面を更新します。
                    </p>
                  </div>

                  {workspace.documents.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetWorkspace}
                      className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-2 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    >
                      セッションをクリア
                    </button>
                  )}
                </div>

                <div className="space-y-5">
                  <div className="rounded-[1.65rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] p-5 shadow-[var(--shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">質問</p>
                        <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                          まず問いを置き、必要な文脈だけをこの場で足します。
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                        {promptMessages.length > 0 ? `${promptMessages.length} 件のやりとり` : '新規セッション'}
                      </span>
                    </div>

                    <label className="block">
                      <span className="mb-3 mt-5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                        入力内容
                      </span>
                      <textarea
                        value={promptInput}
                        onChange={(event) => setPromptInput(event.target.value)}
                        placeholder="知りたいことや作りたい説明面を書いてください。"
                        className="min-h-[220px] w-full rounded-[1.5rem] border border-[var(--border-soft)] bg-[color:var(--surface)] px-4 py-4 text-sm leading-7 text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)]"
                      />
                    </label>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSubmitPrompt('fresh')}
                        disabled={!promptInput.trim() || workspace.isProcessing}
                        className="rounded-full bg-[color:var(--text-primary)] px-4 py-2 text-sm font-medium text-[color:var(--surface-strong)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        新規で生成
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmitPrompt('follow-up')}
                        disabled={!promptInput.trim() || promptMessages.length === 0 || workspace.isProcessing}
                        className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        追質問で更新
                      </button>
                      <span className="text-xs text-[var(--text-tertiary)] sm:ml-auto">
                        {promptMessages.length > 0 ? '会話履歴を引き継いでいます' : '会話履歴はまだありません'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[1.65rem] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,250,242,0.98),rgba(248,239,226,0.92))] p-5 shadow-[var(--shadow-soft)]">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept="application/pdf"
                      multiple
                      onChange={handleAttachmentInputChange}
                      className="hidden"
                    />

                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-2xl">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">添付</p>
                          <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                            {workspace.documents.length} docs
                          </span>
                        </div>
                        <h3 className="mt-2 text-2xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                          参考PDFを添付
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                          composer の中で 1 件を主添付にし、質問に寄り添う文書だけを preview に反映します。
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => attachmentInputRef.current?.click()}
                          disabled={attachmentDisabled}
                          className="rounded-full bg-[color:var(--tone-accent)] px-4 py-2 text-sm font-medium text-[#fffaf2] shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          PDFを選択
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromptContextDocumentId('')}
                          disabled={attachmentDisabled || !promptAttachmentDocument}
                          className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          添付なし
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(280px,1.15fr)] xl:items-start">
                      {promptAttachmentDocument ? (
                        <article className="rounded-[1.3rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--text-primary)]">{promptAttachmentDocument.name}</p>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                {promptAttachmentDocument.ingestionPath || '取り込み待ち'}
                                {promptAttachmentDocument.documentType ? ` / ${promptAttachmentDocument.documentType}` : ''}
                              </p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClassName(promptAttachmentDocument.processing.status)}`}>
                              {statusLabel(promptAttachmentDocument.processing.status)}
                            </span>
                          </div>
                          <p className="mt-3 text-xs leading-6 text-[var(--text-secondary)]">
                            {promptAttachmentDocument.processing.message || '添付した PDF を入力の文脈として使います。'}
                          </p>
                        </article>
                      ) : (
                        <div className="rounded-[1.3rem] border border-dashed border-[var(--border-soft)] bg-[color:var(--surface)] px-4 py-5 text-sm text-[var(--text-secondary)]">
                          まだ参考 PDF は添付されていません。必要なときだけ 1 件選んで prompt に寄り添わせます。
                        </div>
                      )}

                      {workspace.documents.length > 1 && (
                        <div className="space-y-2 rounded-[1.3rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">添付済み文書</p>
                          <div className="space-y-2">
                            {workspace.documents.map((document) => (
                              <button
                                key={document.id}
                                type="button"
                                onClick={() => setPromptContextDocumentId(document.id)}
                                className={`flex w-full items-center justify-between gap-3 rounded-[1.1rem] border px-3 py-3 text-left transition ${
                                  promptContextDocumentId === document.id
                                    ? 'border-[var(--border-strong)] bg-[color:var(--surface-strong)]'
                                    : 'border-[var(--border-soft)] bg-[color:var(--surface)] hover:border-[var(--border-strong)]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm text-[var(--text-primary)]">{document.name}</p>
                                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                                    {document.collectionSource.municipality || 'manual upload'}
                                  </p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClassName(document.processing.status)}`}>
                                  {statusLabel(document.processing.status)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {attachmentNotice && <p className="mt-4 text-xs text-[#9e4a35]">{attachmentNotice}</p>}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <ProfileField
                    label="利用者"
                    value={userProfile.audience}
                    options={[
                      { value: 'resident', label: '住民' },
                      { value: 'legislator', label: '議員' },
                      { value: 'staff', label: '行政職員' },
                      { value: 'researcher', label: '研究者' },
                    ]}
                    onChange={(value) => setUserProfile((current) => ({ ...current, audience: value as AudienceType }))}
                  />
                  <ProfileField
                    label="読み方"
                    value={userProfile.readingPreference}
                    options={[
                      { value: 'summary', label: '要約重視' },
                      { value: 'detail', label: '詳細重視' },
                      { value: 'comparison', label: '比較重視' },
                    ]}
                    onChange={(value) =>
                      setUserProfile((current) => ({
                        ...current,
                        readingPreference: value as ReadingPreference,
                      }))
                    }
                  />
                  <ProfileField
                    label="表示制約"
                    value={userProfile.displayConstraint}
                    options={[
                      { value: 'desktop', label: 'デスクトップ' },
                      { value: 'mobile', label: 'モバイル' },
                      { value: 'presentation', label: 'プレゼン' },
                    ]}
                    onChange={(value) =>
                      setUserProfile((current) => ({
                        ...current,
                        displayConstraint: value as DisplayConstraint,
                      }))
                    }
                  />
                </div>

                {workspaceSummary && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard title="自治体" value={workspaceSummary.municipalities.join(' / ') || '未抽出'} />
                    <SummaryCard title="文書" value={`${workspaceSummary.documentCount} 件`} />
                    <SummaryCard title="事業" value={`${workspaceSummary.projectCount} 件`} />
                    <SummaryCard title="要確認" value={`${workspaceSummary.openReviewCount} 件`} />
                  </div>
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">会話</p>
                  <h2 className="mt-2 text-2xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                    やりとり
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                    新規生成と追質問を同じ流れに積み、質問の経過を説明面と並走させます。
                  </p>
                </div>
                <SurfacePill label="発話数" value={`${promptMessages.length}`} />
              </div>

              <div className="mt-5 space-y-3">
                {promptMessages.length === 0 ? (
                  <div className="rounded-[1.4rem] border border-dashed border-[var(--border-soft)] bg-[color:var(--surface-muted)] px-4 py-7 text-sm text-[var(--text-secondary)]">
                    最初の質問を送ると、ここに fresh / follow-up の履歴が残ります。
                  </div>
                ) : (
                  promptMessages.map((message, index) => (
                    <article
                      key={`${message.role}-${index}`}
                      className={`rounded-[1.4rem] border px-4 py-4 ${
                        message.role === 'user'
                          ? 'border-[var(--border-soft)] bg-[color:var(--surface-strong)]'
                          : 'border-[var(--border-soft)] bg-[color:var(--surface-muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          {message.role === 'user' ? '利用者' : '応答'}
                        </p>
                        {message.role === 'user' && promptAttachmentDocument ? (
                          <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                            {promptAttachmentDocument.name}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-7 text-[var(--text-primary)]">{message.content}</p>
                    </article>
                  ))
                )}
              </div>
            </SurfaceCard>
          </section>

          <section className="space-y-6 xl:sticky xl:top-6">
            <SurfaceCard tone="hero" className="overflow-hidden" dataTestId="briefing-preview-shell">
              <div className="flex flex-col gap-4 border-b border-[var(--border-soft)] pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">Preview</p>
                  <h2
                    className="mt-2 text-3xl leading-tight text-[var(--text-primary)] sm:text-[2.15rem]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    生成プレビュー
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                    prompt と添付 PDF から生成された説明面を右側で保持し、browser / fullscreen / export は同じ出力を共有します。
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ModeButton
                    label="ブラウザ"
                    active={workspace.activeDeliveryMode === 'interactive-browser'}
                    onClick={() => void handleDeliveryMode('interactive-browser')}
                  />
                  <ModeButton
                    label="全画面"
                    active={workspace.activeDeliveryMode === 'fullscreen-present'}
                    onClick={() => void handleDeliveryMode('fullscreen-present')}
                  />
                  <ModeButton
                    label="ZIP書き出し"
                    active={workspace.activeDeliveryMode === 'zip-export'}
                    onClick={() => void handleZipExport()}
                  />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                  <SurfacePill label="表示面" value={surfaceRouteLabel} />
                  <SurfacePill label="添付" value={promptAttachmentDocument?.name || 'なし'} />
                  <SurfacePill label="発話数" value={`${promptMessages.length}`} />
                </div>

                <div ref={viewContainerRef}>
                  <GenerativePolicyView
                    generatedUI={workspace.generatedUI}
                    viewPlanV2={viewPlanV2}
                    plannerFallback={plannerFallback}
                    isProcessing={workspace.isProcessing && workspace.phase === 'generation'}
                    error={null}
                  />
                </div>
              </div>
            </SurfaceCard>

            <details className="group rounded-[1.75rem] border border-[var(--border-soft)] bg-[color:var(--surface)] shadow-[var(--shadow-soft)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">確認用ワークスペース</p>
                  <h2 className="mt-2 text-xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                    抽出確認は必要なときだけ開く
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    review / debug / structured policy は composer と preview の主導線から外し、必要時だけ inspector として開きます。
                  </p>
                </div>
                <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)] transition group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="border-t border-[var(--border-soft)] px-4 pb-4 pt-4">
                <WorkspaceReviewPanel
                  selectedDocument={selectedDocument}
                  projectExplorerItems={projectExplorerItems}
                  isOpen={showReviewWorkspace}
                  onToggle={() => setShowReviewWorkspace((current) => !current)}
                />
              </div>
            </details>

            <details className="group rounded-[1.75rem] border border-[var(--border-soft)] bg-[color:var(--surface)] shadow-[var(--shadow-soft)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">出典と来歴</p>
                  <h2 className="mt-2 text-xl text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                    出典と収集導線をあとから辿れるように保つ
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    prompt-first shell でも source discovery と provenance は失わず、briefing を崩さない位置にまとめます。
                  </p>
                </div>
                <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-secondary)] transition group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="border-t border-[var(--border-soft)] px-6 pb-6 pt-4">
                <div className="mb-5 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                  <SurfacePill label="表示面" value={surfaceRouteLabel} />
                  <SurfacePill label="出典行" value={`${workspace.sourceRegistry.length}`} />
                  <SurfacePill label="来歴参照" value={`${sourceAccessSummary.length}`} />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                  <div className="overflow-x-auto rounded-[1.35rem] border border-[var(--border-soft)] bg-[color:var(--surface-muted)] p-3">
                    <table className="min-w-full border-collapse text-left text-sm text-[var(--text-secondary)]">
                      <thead>
                        <tr className="border-b border-[var(--border-soft)] text-xs uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                          <th className="px-3 py-2">自治体</th>
                          <th className="px-3 py-2">取得元</th>
                          <th className="px-3 py-2">方式</th>
                          <th className="px-3 py-2">状態</th>
                          <th className="px-3 py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspace.sourceRegistry.map((source) => (
                          <CollectionSourceRows
                            key={source.id}
                            source={source}
                            onImport={() => void handleImportSource(source)}
                            onAddCandidate={(candidate) =>
                              void handleAddDiscoveredCandidate(source, {
                                url: candidate.url,
                                label: candidate.label,
                                file_name: candidate.fileName,
                              })
                            }
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rounded-[1.35rem] border border-[var(--border-soft)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-tertiary)]">Provenance pulse</p>
                    <div className="mt-3 space-y-3">
                      {sourceAccessSummary.map((item) => (
                        <article
                          key={`${item.label}-${item.value}`}
                          className="rounded-[1.1rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-3"
                        >
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{item.label}</p>
                          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{item.value}</p>
                          <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">{item.meta}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </section>
        </div>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[1.75rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">設定</h2>
                <p className="mt-1 text-sm text-slate-500">Gemini API Key を設定すると、構造化と Briefing を実行できます。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                閉じる
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Gemini API Key
                </span>
                <input
                  type="password"
                  value={geminiApiKeyInput}
                  onChange={(event) => setGeminiApiKeyInput(event.target.value)}
                  placeholder="AIza..."
                  className="w-full rounded-2xl border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
                />
              </label>

              <p className="text-xs text-slate-500">現在の保存値: {maskGeminiApiKey(geminiApiKeySaved)}</p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveGeminiApiKey}
                  className="rounded-full bg-[color:var(--text-primary)] px-4 py-2 text-sm font-medium text-[color:var(--surface-strong)] shadow-sm"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={handleClearGeminiApiKey}
                  className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  クリア
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatusPillProps {
  label: string;
  value: string;
}

function StatusPill({ label, value }: StatusPillProps) {
  return (
    <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-1 text-xs text-[var(--text-secondary)]">
      {label}: {value}
    </span>
  );
}

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'warm' | 'hero';
  dataTestId?: string;
}

function SurfaceCard({ children, className = '', tone = 'default', dataTestId }: SurfaceCardProps) {
  const toneClassName =
    tone === 'hero'
      ? 'bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,241,231,0.95))]'
      : tone === 'warm'
        ? 'bg-[linear-gradient(180deg,rgba(255,252,247,0.96),rgba(250,241,227,0.9))]'
        : 'bg-[color:var(--surface)]';

  return (
    <section
      data-testid={dataTestId}
      className={`rounded-[1.9rem] border border-[var(--border-soft)] p-6 shadow-[var(--shadow-soft)] backdrop-blur ${toneClassName} ${className}`}
    >
      {children}
    </section>
  );
}

interface SurfaceNoticeProps {
  children: ReactNode;
  danger?: boolean;
}

function SurfaceNotice({ children, danger = false }: SurfaceNoticeProps) {
  return (
    <div
      className={`rounded-[1.5rem] border p-5 ${
        danger
          ? 'border-[#d7b1a8] bg-[color:var(--tone-danger-soft)] text-[#7b3427]'
          : 'border-[var(--border-soft)] bg-[color:var(--tone-accent-soft)] text-[var(--text-primary)]'
      }`}
    >
      {children}
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
}

function SummaryCard({ title, value }: SummaryCardProps) {
  return (
    <div className="rounded-[1.4rem] border border-[var(--border-soft)] bg-[color:var(--surface-strong)] p-5">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-tertiary)]">{title}</p>
      <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function SurfacePill({ label, value }: StatusPillProps) {
  return (
    <span className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-1 text-xs text-[var(--text-secondary)]">
      {label}: {value}
    </span>
  );
}

interface ModeButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ModeButton({ label, active, onClick }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? 'border-[var(--text-primary)] bg-[color:var(--text-primary)] text-[color:var(--surface-strong)] shadow-sm'
          : 'border-[var(--border-soft)] bg-[color:var(--surface-strong)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}

interface ProfileFieldProps {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function ProfileField({ label, value, options, onChange }: ProfileFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface CollectionSourceRowsProps {
  source: CollectionSource;
  onImport: () => void;
  onAddCandidate: (candidate: NonNullable<CollectionSource['discoveryCandidates']>[number]) => void;
}

function CollectionSourceRows({ source, onImport, onAddCandidate }: CollectionSourceRowsProps) {
  return (
    <>
      <tr className="border-b border-slate-100">
        <td className="px-3 py-3">{source.municipality}</td>
        <td className="px-3 py-3 text-xs text-[var(--text-tertiary)]">{source.sourceUrl || '手動アップロード'}</td>
        <td className="px-3 py-3">{source.discoveryStrategy}</td>
        <td className="px-3 py-3">
          <div>{source.status}</div>
          {source.notes && <div className="mt-1 text-xs text-[var(--text-tertiary)]">{source.notes}</div>}
        </td>
        <td className="px-3 py-3">
          <button
            type="button"
            onClick={onImport}
            className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            {source.discoveryStrategy === 'listing-page' ? '候補取得' : '追加'}
          </button>
        </td>
      </tr>
      {source.discoveryCandidates && source.discoveryCandidates.length > 0 && (
        <tr className="border-b border-slate-100 bg-[color:var(--surface-muted)]">
          <td className="px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            候補
          </td>
          <td colSpan={4} className="px-3 py-3">
            <div className="space-y-2">
              {source.discoveryCandidates.map((candidate) => (
                <div key={candidate.url} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--text-primary)]">{candidate.label}</p>
                    <p className="truncate text-xs text-[var(--text-tertiary)]">{candidate.url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddCandidate(candidate)}
                    className="rounded-full border border-[var(--border-soft)] bg-[color:var(--surface-strong)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  >
                    この PDF を追加
                  </button>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function statusClassName(status: ProcessingJob['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'processing':
      return 'bg-sky-100 text-sky-700';
    case 'queued':
      return 'bg-amber-100 text-amber-700';
    case 'idle':
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function statusLabel(status: ProcessingJob['status']): string {
  switch (status) {
    case 'completed':
      return '完了';
    case 'failed':
      return '失敗';
    case 'processing':
      return '処理中';
    case 'queued':
      return '待機中';
    case 'idle':
    default:
      return '未開始';
  }
}

type WorkspaceSurfaceMode = 'empty' | 'pending' | 'prompt' | 'direct' | 'table' | 'mixed';

interface SourceAccessSummaryItem {
  label: string;
  value: string;
  meta: string;
}

function deriveWorkspaceSurfaceMode(
  documents: WorkspaceState['documents'],
  promptMessages: PromptConversationMessage[]
): WorkspaceSurfaceMode {
  const routeSet = new Set(documents.map((document) => document.routeDecision?.route).filter(Boolean));

  if (routeSet.size === 0) {
    if (promptMessages.length > 0) {
      return 'prompt';
    }

    return documents.length > 0 ? 'pending' : 'empty';
  }

  if (routeSet.has('direct') && routeSet.has('table')) {
    return 'mixed';
  }

  return routeSet.has('table') ? 'table' : 'direct';
}

function surfaceModeLabel(mode: WorkspaceSurfaceMode): string {
  switch (mode) {
    case 'prompt':
      return '質問起点';
    case 'direct':
      return '文書直読';
    case 'table':
      return '表重視';
    case 'mixed':
      return '混在';
    case 'pending':
      return '振り分け中';
    case 'empty':
    default:
      return '待機中';
  }
}

function buildSourceAccessSummary(
  documents: WorkspaceState['documents'],
  sourceRegistry: CollectionSource[],
  promptMessages: PromptConversationMessage[],
  promptContextDocumentId: string
): SourceAccessSummaryItem[] {
  const items: SourceAccessSummaryItem[] = [];
  const contextDocument = promptContextDocumentId
    ? documents.find((document) => document.id === promptContextDocumentId)
    : null;

  if (promptMessages.length > 0) {
    const lastUserTurn = [...promptMessages].reverse().find((message) => message.role === 'user');
    items.push({
      label: '入力の流れ',
      value: lastUserTurn?.content || '質問起点の説明面',
      meta: contextDocument
        ? `文脈: ${contextDocument.name} / ${contextDocument.routeDecision?.route || 'direct'} 経路`
        : '文脈: 添付なし / 質問起点の文書直読',
    });
  }

  documents.slice(0, 4).forEach((document) => {
    const routeDecision = document.routeDecision;
    items.push({
      label: routeDecision?.route === 'table' ? '表文書' : '説明文書',
      value: document.name,
      meta: [
        document.collectionSource.sourceUrl || '手動アップロード',
        document.ingestionPath || '取り込み待ち',
        routeDecision ? `${routeDecision.route}/${routeDecision.reason}/${routeDecision.confidence}` : '経路待ち',
      ].join(' / '),
    });
  });

  if (sourceRegistry.length > 0) {
    items.push({
      label: 'Source discovery',
      value: `${sourceRegistry.length}件の seed source`,
      meta: sourceRegistry
        .slice(0, 2)
        .map((source) => `${source.municipality}: ${source.discoveryStrategy}`)
        .join(' / '),
    });
  }

  return items.length > 0
    ? items
    : [
        {
          label: 'Provenance',
          value: 'source discovery は待機中です',
          meta: 'PDF を追加するか質問を送ると、ここに出典と route 情報が現れます。',
        },
      ];
}

export default App;
