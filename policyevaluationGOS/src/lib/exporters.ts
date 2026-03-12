import JSZip from 'jszip';

import { renderGeneratedViewDocument } from '@/lib/generatedViewRenderer';
import { renderGeneratedViewV2Document } from '@/lib/generatedViewRendererV2';
import { deriveCandidateBundle, deriveProjectRowsCsv } from '@/lib/projectExtractor';
import { buildPolicyCorpus } from '@/lib/workspace';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';
import type {
  CollectionSource,
  GeneratedUI,
  PromptConversationMessage,
  UserProfile,
  WorkspaceDocument,
} from '@/types';

interface PromptSessionExport {
  messages: PromptConversationMessage[];
  contextDocumentId: string | null;
}

interface WorkspaceZipExportOptions {
  generatedUI: GeneratedUI;
  documents: WorkspaceDocument[];
  userProfile: UserProfile;
  viewPlanV2?: ViewPlanV2 | null;
  sourceRegistry?: CollectionSource[];
  promptSession?: PromptSessionExport | null;
}

export async function exportWorkspaceAsZip(
  generatedUI: GeneratedUI,
  documents: WorkspaceDocument[],
  userProfile: UserProfile
): Promise<void>;
export async function exportWorkspaceAsZip(options: WorkspaceZipExportOptions): Promise<void>;
export async function exportWorkspaceAsZip(
  optionsOrGeneratedUi: GeneratedUI | WorkspaceZipExportOptions,
  documentsArg?: WorkspaceDocument[],
  userProfileArg?: UserProfile
): Promise<void> {
  const {
    generatedUI,
    documents,
    userProfile,
    viewPlanV2 = null,
    sourceRegistry = [],
    promptSession = null,
  } =
    optionsOrGeneratedUi instanceof Object && 'generatedUI' in optionsOrGeneratedUi
      ? optionsOrGeneratedUi
      : {
          generatedUI: optionsOrGeneratedUi,
          documents: documentsArg || [],
          userProfile: userProfileArg as UserProfile,
          viewPlanV2: null,
          sourceRegistry: [],
          promptSession: null,
        };

  const zip = new JSZip();
  const corpus = buildPolicyCorpus(documents);
  const selectedRuntime = viewPlanV2 ? 'v2' : 'v1';
  const promptContextDocument = promptSession?.contextDocumentId
    ? documents.find((document) => document.id === promptSession.contextDocumentId) || null
    : null;
  const promptMessages = promptSession?.messages || [];
  const lastUserPrompt = [...promptMessages].reverse().find((message) => message.role === 'user')?.content || null;

  zip.file(
    'index.html',
    generatedUI.renderMode === 'html' && generatedUI.htmlDocument
      ? generatedUI.htmlDocument
      : viewPlanV2
        ? renderGeneratedViewV2Document(viewPlanV2)
        : renderGeneratedViewDocument(generatedUI)
  );
  zip.file(
    'runtime-v1.html',
    generatedUI.renderMode === 'html' && generatedUI.htmlDocument
      ? generatedUI.htmlDocument
      : renderGeneratedViewDocument(generatedUI)
  );
  if (viewPlanV2) {
    zip.file('runtime-v2.html', renderGeneratedViewV2Document(viewPlanV2));
  }
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        generatedAt: generatedUI.timestamp,
        title: generatedUI.title,
        provider: generatedUI.provider,
        model: generatedUI.model,
        runtime: {
          selected: selectedRuntime,
          available: {
            v1: true,
            v2: Boolean(viewPlanV2),
          },
          files: {
            index: 'index.html',
            v1: 'runtime-v1.html',
            v2: viewPlanV2 ? 'runtime-v2.html' : null,
          },
        },
        userProfile,
        prompt: generatedUI.prompt || null,
        promptSession: promptSession
          ? {
              turnCount: promptMessages.length,
              lastUserPrompt,
              contextDocumentId: promptSession.contextDocumentId,
              contextDocumentName: promptContextDocument?.name || null,
              messages: promptMessages,
            }
          : null,
        sourceRegistry: sourceRegistry.map((source) => ({
          id: source.id,
          municipality: source.municipality,
          label: source.label,
          sourceUrl: source.sourceUrl,
          discoveryStrategy: source.discoveryStrategy,
          status: source.status,
          notes: source.notes || null,
        })),
        routes: {
          direct: documents.filter((document) => document.routeDecision?.route === 'direct').length,
          table: documents.filter((document) => document.routeDecision?.route === 'table').length,
          pending: documents.filter((document) => !document.routeDecision).length,
        },
        corpus,
        documents: documents.map((document) => ({
          id: document.id,
          name: document.name,
          size: document.size,
          uploadedAt: document.uploadedAt.toISOString(),
          ocrAvailable: Boolean(document.ocrText),
          structuredTitle: document.structuredData?.title || null,
          ingestionPath: document.ingestionPath || null,
          documentType: document.documentType || null,
          routeDecision: document.routeDecision,
          collectionSource: {
            municipality: document.collectionSource.municipality,
            label: document.collectionSource.label,
            sourceUrl: document.collectionSource.sourceUrl,
            discoveryStrategy: document.collectionSource.discoveryStrategy,
            status: document.collectionSource.status,
          },
        })),
      },
      null,
      2
    )
  );

  const sourcesFolder = zip.folder('sources');
  for (const document of documents) {
    const candidateBundle = deriveCandidateBundle(document);
    const projectRowsCsv = deriveProjectRowsCsv(document);

    sourcesFolder?.file(
      `${sanitizeFileName(document.name)}.json`,
      JSON.stringify(
        {
          name: document.name,
          ocrText: document.ocrText,
          structuringText: document.structuringText,
          rawLayoutText: document.rawLayoutText,
          rawJson: document.rawJson,
          rawCsv: document.rawCsv,
          structuredData: document.structuredData,
          documentDigest: document.documentDigest,
          candidateBundle,
          rawCandidateRows: document.rawCandidateRows,
          candidateRows: document.candidateRows,
          rowDecisions: document.rowDecisions,
          originalNormalizedRows: document.originalNormalizedRows,
          repairedNormalizedRows: document.repairedNormalizedRows,
          normalizedRows: document.normalizedRows,
          repairStatus: document.repairStatus,
          repairProvider: document.repairProvider,
          repairModel: document.repairModel,
          repairRawResponse: document.repairRawResponse,
          repairError: document.repairError,
          repairNotes: document.repairNotes,
          repairMetrics: document.repairMetrics,
          extractionProvider: document.extractionProvider,
          extractionModel: document.extractionModel,
          extractionRawResponse: document.extractionRawResponse,
          extractionError: document.extractionError,
          projectRowsCsv,
          projectRecords: document.projectRecords,
          reviewItems: document.reviewItems,
          collectionSource: document.collectionSource,
          tableArtifacts: document.tableArtifacts,
          tableResults: document.tableResults,
          processing: document.processing,
        },
        null,
        2
      )
    );
    if (projectRowsCsv) {
      sourcesFolder?.file(`${sanitizeFileName(document.name)}-project-rows.csv`, projectRowsCsv);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${sanitizeFileName(generatedUI.title)}.zip`);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
