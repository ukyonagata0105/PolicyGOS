import { startTransition, useEffect, useEffectEvent, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { exportWorkspaceAsZip } from '@/lib/exporters';
import { structurePolicyData } from '@/lib/dataStructurer';
import {
  buildDocumentDigestFromStructuredPolicy,
  decideDocumentRoute,
} from '@/lib/pipelineContracts';
import {
  buildTableContextForStructuring,
  extractTableArtifacts,
  parseTableArtifacts,
} from '@/lib/tableParsing';
import { extractWithBestOCRProvider } from '@/lib/ocrProviders';
import {
  type SourceCandidate,
  getOCRBackendClient,
  type BackendConnectionState,
} from '@/lib/ocrBackendClient';
import { extractProjectRecords } from '@/lib/projectExtractor';
import { adoptRepairedRows, runRepairPipeline } from '@/lib/repairPipeline';
import {
  applyCollectionSourceState,
  applySourceCollectionMutation,
  collectDiscoveredSourceCandidate,
  createSourceCollectionProgressState,
  createSourceCollectionReviewState,
  importCollectionSource,
  resolveSelectedDocumentAfterCollection,
} from '@/lib/sourceCollection';
import {
  adaptPromptSessionToGenerationInput,
  advancePromptSession,
  normalizePromptSessionSubmission,
} from '@/lib/promptSessionAdapter';
import { generateWorkspaceView } from '@/lib/uiGenerator';
import { buildViewPlanV2FromWorkspace } from '@/lib/viewPlannerFromWorkspace';
import { postProcessViewPlanV2Candidate, type ViewPlannerV1FallbackSignal } from '@/lib/viewPlanner';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';
import {
  appendWorkspaceDocuments,
  buildGenerationKey,
  collectGenerationReadyDocuments,
  createInitialWorkspaceState,
  hasQueuedWorkspaceDocuments,
} from '@/lib/workspacePipelineController';
import { createWorkspaceDocument } from '@/lib/workspace';
import type {
  CollectionSource,
  DeliveryMode,
  PdfFile,
  PromptGenerationRequest,
  PromptGenerationResult,
  PromptSessionSubmission,
  UserProfile,
  WorkspaceDocument,
  WorkspaceState,
} from '@/types';

export {
  appendWorkspaceDocuments,
  buildGenerationKey,
  collectGenerationReadyDocuments,
  createInitialWorkspaceState,
  hasQueuedWorkspaceDocuments,
} from '@/lib/workspacePipelineController';

interface UseWorkspacePipelineControllerOptions {
  workspace: WorkspaceState;
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  backendState: BackendConnectionState;
  userProfile: UserProfile;
  geminiApiKeySaved: string;
  geminiConfigRevision: number;
  setSelectedDocumentId: Dispatch<SetStateAction<string | null>>;
  setViewPlanV2: Dispatch<SetStateAction<ViewPlanV2 | null>>;
  setPlannerFallback: Dispatch<SetStateAction<ViewPlannerV1FallbackSignal | null>>;
  onRequireGeminiSettings: () => void;
  onResetShellState?: () => void;
  onPromptSessionInvalidated?: () => void;
}

interface UseWorkspacePipelineControllerResult {
  appendDocuments: (pdfs: PdfFile[]) => void;
  handleImportSource: (source: CollectionSource) => Promise<void>;
  handleAddDiscoveredCandidate: (source: CollectionSource, candidate: SourceCandidate) => Promise<void>;
  handleDeliveryMode: (mode: DeliveryMode) => Promise<void>;
  submitPromptQuestion: (
    request: PromptSessionSubmission | PromptGenerationRequest
  ) => Promise<PromptGenerationResult | null>;
  handleResetWorkspace: () => void;
  resetGenerationKey: () => void;
}

export function useWorkspacePipelineController({
  workspace,
  setWorkspace,
  backendState,
  userProfile,
  geminiApiKeySaved,
  geminiConfigRevision,
  setSelectedDocumentId,
  setViewPlanV2,
  setPlannerFallback,
  onRequireGeminiSettings,
  onResetShellState,
  onPromptSessionInvalidated,
}: UseWorkspacePipelineControllerOptions): UseWorkspacePipelineControllerResult {
  const workspaceRef = useRef(workspace);
  const backendStateRef = useRef(backendState);
  const userProfileRef = useRef(userProfile);
  const processingRef = useRef(false);
  const generationKeyRef = useRef('');

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    backendStateRef.current = backendState;
  }, [backendState]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  const updateDocument = useEffectEvent(
    (documentId: string, updater: (document: WorkspaceDocument) => WorkspaceDocument) => {
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        documents: currentWorkspace.documents.map((document) =>
          document.id === documentId ? updater(document) : document
        ),
        lastUpdatedAt: new Date().toISOString(),
      }));
    }
  );

  const appendDocuments = useEffectEvent((pdfs: PdfFile[]) => {
    if (!geminiApiKeySaved.trim()) {
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        error: 'Gemini API Key を設定してから文書を処理してください。',
        lastUpdatedAt: new Date().toISOString(),
      }));
      onRequireGeminiSettings();
      return;
    }

    const workspaceDocuments = pdfs.map(createWorkspaceDocument);
    onPromptSessionInvalidated?.();

    setWorkspace((currentWorkspace) =>
      appendWorkspaceDocuments(currentWorkspace, workspaceDocuments)
    );
    setSelectedDocumentId((currentSelectedDocumentId) =>
      resolveSelectedDocumentAfterCollection(currentSelectedDocumentId, workspaceDocuments)
    );
  });

  const handleImportSource = useEffectEvent(async (source: CollectionSource) => {
    try {
      setWorkspace((currentWorkspace) =>
        applyCollectionSourceState(currentWorkspace, source.id, createSourceCollectionProgressState)
      );

      const client = getOCRBackendClient({ apiUrl: backendStateRef.current.apiUrl });
        const mutation = await importCollectionSource(source, client);
        onPromptSessionInvalidated?.();
        setWorkspace((currentWorkspace) => applySourceCollectionMutation(currentWorkspace, mutation));
      setSelectedDocumentId((currentSelectedDocumentId) =>
        resolveSelectedDocumentAfterCollection(currentSelectedDocumentId, mutation.documents)
      );
    } catch (error) {
      setWorkspace((currentWorkspace) =>
        applyCollectionSourceState(currentWorkspace, source.id, () =>
          createSourceCollectionReviewState(
            source,
            error instanceof Error ? error.message : '取得に失敗しました。'
          )
        )
      );
    }
  });

  const handleAddDiscoveredCandidate = useEffectEvent(
    async (source: CollectionSource, candidate: SourceCandidate) => {
      try {
        const client = getOCRBackendClient({ apiUrl: backendStateRef.current.apiUrl });
        const mutation = await collectDiscoveredSourceCandidate(source, candidate, client);
        onPromptSessionInvalidated?.();
        setWorkspace((currentWorkspace) => applySourceCollectionMutation(currentWorkspace, mutation));
        setSelectedDocumentId((currentSelectedDocumentId) =>
          resolveSelectedDocumentAfterCollection(currentSelectedDocumentId, mutation.documents)
        );
      } catch (error) {
        setWorkspace((currentWorkspace) =>
          applyCollectionSourceState(currentWorkspace, source.id, () =>
            createSourceCollectionReviewState(
              source,
              error instanceof Error ? error.message : '候補 PDF の追加に失敗しました。'
            )
          )
        );
      }
    }
  );

  const processQueuedDocuments = useEffectEvent(async () => {
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      isProcessing: true,
      phase: 'ingestion',
      error: null,
      lastUpdatedAt: new Date().toISOString(),
    }));

    try {
      while (true) {
        const nextDocument = workspaceRef.current.documents.find(
          (document) => document.processing.status === 'queued'
        );

        if (!nextDocument) {
          break;
        }

        try {
          updateDocument(nextDocument.id, (document) => ({
            ...document,
            processing: {
              ...document.processing,
              provider: 'router',
              status: 'processing',
              progress: 0,
              message: '文書種別を判定しています',
              startedAt: new Date().toISOString(),
            },
            error: null,
          }));

          const ocrResult = await extractWithBestOCRProvider(
            nextDocument.file,
            backendStateRef.current,
            (progress) => {
              updateDocument(nextDocument.id, (document) => ({
                ...document,
                processing: {
                  ...document.processing,
                  provider: progress.provider,
                  status: progress.status,
                  progress: progress.progress,
                  message: progress.message,
                  jobId: progress.jobId,
                  pages: progress.pages,
                },
              }));
            }
          );

          const preferredDocumentText = ocrResult.rawLayoutText || ocrResult.text;
          const structuringBaseText = ocrResult.structuringText || ocrResult.text || preferredDocumentText;

          updateDocument(nextDocument.id, (document) => ({
            ...document,
            pageCount: ocrResult.pages ?? undefined,
            ocrText: preferredDocumentText,
            structuringText: structuringBaseText,
            rawLayoutText: ocrResult.rawLayoutText || preferredDocumentText,
            rawJson: ocrResult.rawJson || null,
            rawCsv: ocrResult.rawCsv || null,
            documentType: ocrResult.classification,
            ingestionPath: ocrResult.pathUsed,
            classificationConfidence: ocrResult.classificationConfidence,
            collectionSource: {
              ...document.collectionSource,
              status: 'collected',
              lastCollectedAt: new Date().toISOString(),
            },
            processing: {
              ...document.processing,
              provider: ocrResult.provider,
              status: 'processing',
              progress: 100,
              message: '表を解析しています',
            },
          }));

          const tableArtifacts = extractTableArtifacts(preferredDocumentText, nextDocument.id, {
            rawCsv: ocrResult.rawCsv || undefined,
            sourceType:
              ocrResult.pathUsed === 'pdf_text_fast_path' || ocrResult.pathUsed === 'fallback'
                ? 'pdf_layout_text'
                : undefined,
            sourcePath: ocrResult.pathUsed,
          });
          const tableResults = await parseTableArtifacts(tableArtifacts);

          updateDocument(nextDocument.id, (document) => ({
            ...document,
            tableArtifacts,
            tableResults,
            processing: {
              ...document.processing,
              provider: ocrResult.provider,
              status: 'processing',
              progress: 100,
              message: '文書概要を構造化しています',
            },
          }));

          const tableContext = buildTableContextForStructuring(tableResults);
          const structuringInput = tableContext
            ? `${structuringBaseText}\n\n[Parsed tables]\n${tableContext}`
            : structuringBaseText;
          const structuredResult = await structurePolicyData(structuringInput);
          if (!structuredResult.success || !structuredResult.policy) {
            throw new Error(structuredResult.error || '政策構造化に失敗しました');
          }

          const extractedStructuredData = {
            ...structuredResult.policy,
            sourceDocumentId: nextDocument.id,
          };
          const preferredMunicipality =
            nextDocument.collectionSource.municipality && nextDocument.collectionSource.municipality !== '未登録'
              ? nextDocument.collectionSource.municipality
              : extractedStructuredData.municipality;

          updateDocument(nextDocument.id, (document) => ({
            ...document,
            structuredData: extractedStructuredData,
            collectionSource: {
              ...document.collectionSource,
              municipality: preferredMunicipality || document.collectionSource.municipality,
            },
            processing: {
              ...document.processing,
              provider: structuredResult.provider || document.processing.provider,
              status: 'processing',
              progress: 100,
              message: '文書ルートを判定しています',
            },
          }));

          const extractionDocument: WorkspaceDocument = {
            ...nextDocument,
            pageCount: ocrResult.pages ?? undefined,
            ocrText: preferredDocumentText,
            structuringText: structuringBaseText,
            rawLayoutText: ocrResult.rawLayoutText || preferredDocumentText,
            rawJson: ocrResult.rawJson || null,
            rawCsv: ocrResult.rawCsv || null,
            tableArtifacts,
            tableResults,
            structuredData: extractedStructuredData,
            collectionSource: {
              ...nextDocument.collectionSource,
              municipality: preferredMunicipality || nextDocument.collectionSource.municipality,
              status: 'collected',
              lastCollectedAt: new Date().toISOString(),
            },
            documentType: ocrResult.classification,
            ingestionPath: ocrResult.pathUsed,
            classificationConfidence: ocrResult.classificationConfidence,
          };
          const projectExtraction = await extractProjectRecords(extractionDocument);
          const routeDecision = decideDocumentRoute({
            rawCsv: extractionDocument.rawCsv,
            tableResults,
            candidateRows: projectExtraction.candidateRows || [],
          });
          const directDocument: WorkspaceDocument = {
            ...extractionDocument,
            structuredData: extractedStructuredData,
            documentDigest: buildDocumentDigestFromStructuredPolicy(extractedStructuredData),
            rawCandidateRows: [],
            candidateRows: [],
            routeDecision,
            rowDecisions: [],
            originalNormalizedRows: [],
            repairedNormalizedRows: [],
            normalizedRows: [],
            repairStatus: 'idle',
            repairProvider: undefined,
            repairModel: undefined,
            repairRawResponse: null,
            repairError: null,
            repairNotes: [],
            repairMetrics: null,
            extractionProvider: undefined,
            extractionModel: undefined,
            extractionRawResponse: null,
            extractionError: null,
            projectRecords: [],
            reviewItems: [],
          };

          let finalDocument: WorkspaceDocument =
            routeDecision.route === 'table'
              ? {
                  ...directDocument,
                  documentDigest: projectExtraction.documentDigest || directDocument.documentDigest,
                  rawCandidateRows: projectExtraction.rawCandidateRows || [],
                  candidateRows: projectExtraction.candidateRows || [],
                  rowDecisions: projectExtraction.rowDecisions || [],
                  originalNormalizedRows: projectExtraction.normalizedRows || [],
                  normalizedRows: projectExtraction.normalizedRows || [],
                  extractionProvider: projectExtraction.provider,
                  extractionModel: projectExtraction.model,
                  extractionRawResponse: projectExtraction.rawResponse || null,
                  extractionError: projectExtraction.error || null,
                  projectRecords: projectExtraction.projects || [],
                  reviewItems: projectExtraction.reviewItems || [],
                }
              : directDocument;

          if (routeDecision.route === 'table' && (projectExtraction.candidateRows || []).length > 0) {
            updateDocument(nextDocument.id, (document) => ({
              ...document,
              processing: {
                ...document.processing,
                provider: projectExtraction.provider || structuredResult.provider || document.processing.provider,
                status: 'processing',
                progress: 100,
                message: '抽出結果を修復しています',
              },
            }));

            const repairResult = await runRepairPipeline(finalDocument);
            finalDocument = {
              ...finalDocument,
              repairedNormalizedRows: repairResult.repair.normalizedRows,
              repairStatus: repairResult.repair.success
                ? repairResult.adopted
                  ? 'adopted'
                  : 'rejected'
                : 'failed',
              repairProvider: repairResult.repair.provider,
              repairModel: repairResult.repair.model,
              repairRawResponse: repairResult.repair.rawResponse || null,
              repairError: repairResult.repair.error || null,
              repairNotes: [...repairResult.repair.notes, ...repairResult.adoptedNotes],
              repairMetrics: repairResult.adoptedMetrics,
            };

            if (repairResult.repair.success && repairResult.repair.normalizedRows.length > 0) {
              finalDocument = {
                ...finalDocument,
                ...adoptRepairedRows(finalDocument, repairResult.repair, repairResult.adoptedRows),
              };
            }
          }

          updateDocument(nextDocument.id, (document) => ({
            ...document,
            structuredData: extractedStructuredData,
            documentDigest: finalDocument.documentDigest,
            rawCandidateRows: finalDocument.rawCandidateRows,
            candidateRows: finalDocument.candidateRows,
            routeDecision: finalDocument.routeDecision,
            rowDecisions: finalDocument.rowDecisions,
            originalNormalizedRows: finalDocument.originalNormalizedRows,
            repairedNormalizedRows: finalDocument.repairedNormalizedRows,
            normalizedRows: finalDocument.normalizedRows,
            repairStatus: finalDocument.repairStatus,
            repairProvider: finalDocument.repairProvider,
            repairModel: finalDocument.repairModel,
            repairRawResponse: finalDocument.repairRawResponse,
            repairError: finalDocument.repairError,
            repairNotes: finalDocument.repairNotes,
            repairMetrics: finalDocument.repairMetrics,
            extractionProvider: finalDocument.extractionProvider,
            extractionModel: finalDocument.extractionModel,
            extractionRawResponse: finalDocument.extractionRawResponse,
            extractionError: finalDocument.extractionError,
            projectRecords: finalDocument.projectRecords,
            reviewItems: finalDocument.reviewItems,
            collectionSource: {
              ...document.collectionSource,
              municipality: preferredMunicipality || document.collectionSource.municipality,
              status: finalDocument.reviewItems.length > 0 ? 'review' : 'collected',
              lastCollectedAt: new Date().toISOString(),
            },
            processing: {
              ...document.processing,
              provider:
                finalDocument.repairProvider ||
                finalDocument.extractionProvider ||
                structuredResult.provider ||
                document.processing.provider,
              status: 'completed',
              progress: 100,
              message:
                finalDocument.routeDecision?.route === 'direct'
                  ? '文書の要約準備が完了しました'
                  : finalDocument.projectRecords.length > 0
                  ? '処理完了'
                  : '事業抽出は完了したが確認項目があります',
              completedAt: new Date().toISOString(),
            },
          }));
        } catch (error) {
          updateDocument(nextDocument.id, (document) => ({
            ...document,
            error: error instanceof Error ? error.message : '不明なエラーが発生しました',
            collectionSource: {
              ...document.collectionSource,
              status: 'review',
            },
            processing: {
              ...document.processing,
              status: 'failed',
              progress: 100,
              message: '処理に失敗しました',
              completedAt: new Date().toISOString(),
            },
          }));
        }
      }
    } finally {
      processingRef.current = false;
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        isProcessing: false,
        phase: currentWorkspace.generatedUI ? 'delivery' : 'understanding',
        lastUpdatedAt: new Date().toISOString(),
      }));
    }
  });

  const regenerateWorkspaceView = useEffectEvent(async (generationKey: string) => {
    const completedDocuments = collectGenerationReadyDocuments(workspaceRef.current.documents);
    if (completedDocuments.length === 0) {
      return;
    }

    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      isProcessing: true,
      phase: 'generation',
      error: null,
      lastUpdatedAt: new Date().toISOString(),
    }));

    try {
      const generation = await generateWorkspaceView(completedDocuments, userProfileRef.current, {
        sourceRegistry: workspaceRef.current.sourceRegistry,
      });

      if (!generation.success || !generation.ui) {
        throw new Error(generation.error || 'Briefing UI の生成に失敗しました');
      }

      startTransition(() => {
        onPromptSessionInvalidated?.();
        const runtimeCandidate = buildViewPlanV2FromWorkspace(
          completedDocuments,
          userProfileRef.current,
          workspaceRef.current.sourceRegistry
        );
        const runtimeResult = postProcessViewPlanV2Candidate(runtimeCandidate);
        setViewPlanV2(runtimeResult.status === 'ready' ? runtimeResult.plan : null);
        setPlannerFallback(runtimeResult.status === 'fallback' ? runtimeResult.fallback : null);

        setWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          generatedUI: generation.ui || null,
          isProcessing: false,
          phase: 'delivery',
          error: null,
          lastUpdatedAt: new Date().toISOString(),
        }));
      });
    } catch (error) {
      generationKeyRef.current = generationKeyRef.current === generationKey ? '' : generationKeyRef.current;
      setViewPlanV2(null);
      setPlannerFallback(null);
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        isProcessing: false,
        phase: 'understanding',
        error: error instanceof Error ? error.message : 'Briefing UI の更新に失敗しました',
        lastUpdatedAt: new Date().toISOString(),
      }));
    }
  });

  useEffect(() => {
    if (processingRef.current) {
      return;
    }

    if (!hasQueuedWorkspaceDocuments(workspace.documents)) {
      return;
    }

    void processQueuedDocuments();
  }, [processQueuedDocuments, workspace.documents]);

  useEffect(() => {
    if (workspace.isProcessing || processingRef.current) {
      return;
    }

    const completedDocuments = collectGenerationReadyDocuments(workspace.documents);
    if (completedDocuments.length === 0) {
      generationKeyRef.current = '';
      return;
    }

    const nextGenerationKey = buildGenerationKey(
      workspace.documents,
      userProfile,
      geminiConfigRevision
    );
    if (generationKeyRef.current === nextGenerationKey) {
      return;
    }

    generationKeyRef.current = nextGenerationKey;
    void regenerateWorkspaceView(nextGenerationKey);
  }, [
    geminiConfigRevision,
    regenerateWorkspaceView,
    userProfile,
    workspace.documents,
    workspace.isProcessing,
  ]);

  const handleDeliveryMode = useEffectEvent(async (mode: DeliveryMode) => {
    if (mode === 'zip-export') {
      if (!workspaceRef.current.generatedUI) {
        setWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          error: 'ZIP 出力するには Briefing UI が必要です',
          activeDeliveryMode: 'interactive-browser',
        }));
        return;
      }

      await exportWorkspaceAsZip(
        workspaceRef.current.generatedUI,
        workspaceRef.current.documents,
        userProfileRef.current
      );
      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        activeDeliveryMode: mode,
        phase: 'delivery',
      }));
      return;
    }

    setWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      activeDeliveryMode: mode,
      phase: 'delivery',
    }));
  });

  const submitPromptQuestion = useEffectEvent(
    async (
      request: PromptSessionSubmission | PromptGenerationRequest
    ): Promise<PromptGenerationResult | null> => {
      const generationReadyDocuments = collectGenerationReadyDocuments(workspaceRef.current.documents);
      const submission = normalizePromptSessionSubmission(request, generationReadyDocuments);
      const trimmedPrompt = submission.prompt.trim();
      if (!trimmedPrompt) {
        return null;
      }

      if (!geminiApiKeySaved.trim()) {
        setWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          error: 'Gemini API Key を設定してから質問を実行してください。',
          lastUpdatedAt: new Date().toISOString(),
        }));
        onRequireGeminiSettings();
        return null;
      }

      const adaptedInput = adaptPromptSessionToGenerationInput({
        submission: {
          ...submission,
          prompt: trimmedPrompt,
        },
        availableDocuments: generationReadyDocuments,
        userProfile: userProfileRef.current,
      });

      setWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        isProcessing: true,
        phase: 'generation',
        error: null,
        lastUpdatedAt: new Date().toISOString(),
      }));

      try {
        const generation = await generateWorkspaceView(adaptedInput.generationDocuments, userProfileRef.current, {
          sourceRegistry: workspaceRef.current.sourceRegistry,
          promptRequest: adaptedInput.promptRequest,
        });

        if (!generation.success || !generation.ui) {
          throw new Error(generation.error || '質問起点の Briefing UI 生成に失敗しました');
        }

        setViewPlanV2(null);
        setPlannerFallback(null);

        const nextSession = advancePromptSession(
          {
            ...submission,
            prompt: trimmedPrompt,
          },
          generation.ui
        );

        setWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          generatedUI: generation.ui || null,
          isProcessing: false,
          phase: 'delivery',
          error: null,
          lastUpdatedAt: new Date().toISOString(),
        }));

        return {
          session: nextSession,
          messages: nextSession.turns,
          generatedUi: generation.ui,
          exportDocuments: adaptedInput.exportDocuments,
        };
      } catch (error) {
        setViewPlanV2(null);
        setPlannerFallback(null);
        setWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          isProcessing: false,
          phase: currentWorkspace.documents.length > 0 ? 'understanding' : 'idle',
          error: error instanceof Error ? error.message : '質問起点の Briefing UI の更新に失敗しました',
          lastUpdatedAt: new Date().toISOString(),
        }));
        return null;
      }
    }
  );

  const handleResetWorkspace = useEffectEvent(() => {
    generationKeyRef.current = '';
    setSelectedDocumentId(null);
    setViewPlanV2(null);
    setPlannerFallback(null);
    onResetShellState?.();
    setWorkspace(createInitialWorkspaceState());
  });

  const resetGenerationKey = () => {
    generationKeyRef.current = '';
  };

  return {
    appendDocuments,
    handleImportSource,
    handleAddDiscoveredCandidate,
    handleDeliveryMode,
    submitPromptQuestion,
    handleResetWorkspace,
    resetGenerationKey,
  };
}
