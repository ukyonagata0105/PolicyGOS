import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type {
  CollectionSource,
  SourceCollectionStatus,
  SourceDiscoveryCandidateSummary,
  SourceDiscoveryStrategy,
  WorkspaceDocument,
  WorkspaceState,
} from '@/types';

import type { SourceCandidate, SourceDiscoveryResponse } from '@/lib/ocrBackendClient';

const REVIEW_DISCOVERY_STRATEGIES: SourceDiscoveryStrategy[] = ['listing-page', 'viewer-kintone'];

export interface SourceCollectionClient {
  discoverSource(url: string, strategy: string): Promise<SourceDiscoveryResponse>;
  fetchRemotePdf(url: string): Promise<File>;
}

export interface SourceCollectionMutation {
  source: CollectionSource;
  documents: WorkspaceDocument[];
}

export function createSourceCollectionProgressState(source: CollectionSource): CollectionSource {
  return {
    ...source,
    notes: `${source.notes || ''} 取得候補を確認中...`.trim(),
  };
}

export function createSourceCollectionReviewState(
  source: CollectionSource,
  message: string,
  discoveryCandidates?: SourceDiscoveryCandidateSummary[]
): CollectionSource {
  return {
    ...source,
    status: 'review',
    notes: message,
    discoveryCandidates: discoveryCandidates ?? source.discoveryCandidates,
  };
}

export async function importCollectionSource(
  source: CollectionSource,
  client: SourceCollectionClient,
  now: string = new Date().toISOString()
): Promise<SourceCollectionMutation> {
  const discovery = await client.discoverSource(source.sourceUrl, source.discoveryStrategy);
  const candidates = discovery.candidates;

  if (candidates.length === 0) {
    return {
      source: createSourceCollectionReviewState(source, '候補 PDF が見つかりませんでした。'),
      documents: [],
    };
  }

  if (requiresCandidateReview(source.discoveryStrategy)) {
    return {
      source: {
        ...source,
        status: 'discovered',
        notes: `${candidates.length}件の候補 PDF を検出しました。`,
        discoveryCandidates: candidates.slice(0, 8).map(toDiscoveryCandidateSummary),
        lastCollectedAt: now,
      },
      documents: [],
    };
  }

  const files = await Promise.all(candidates.slice(0, 1).map((candidate) => client.fetchRemotePdf(candidate.url)));
  const notes = `${candidates.length}件の候補を検出し、${files.length}件を追加しました。`;

  return {
    source: {
      ...source,
      status: 'collected',
      notes,
      discoveryCandidates: candidates.slice(0, 1).map(toDiscoveryCandidateSummary),
      lastCollectedAt: now,
    },
    documents: createCollectedWorkspaceDocuments(files, source, now),
  };
}

export async function collectDiscoveredSourceCandidate(
  source: CollectionSource,
  candidate: SourceCandidate,
  client: SourceCollectionClient,
  now: string = new Date().toISOString()
): Promise<SourceCollectionMutation> {
  const file = await client.fetchRemotePdf(candidate.url);
  const notes = `${candidate.file_name} を追加しました。`;

  return {
    source: {
      ...source,
      status: 'collected',
      notes,
      lastCollectedAt: now,
    },
    documents: createCollectedWorkspaceDocuments([file], source, now),
  };
}

export function applySourceCollectionMutation(
  workspace: WorkspaceState,
  mutation: SourceCollectionMutation,
  now: string = new Date().toISOString()
): WorkspaceState {
  const nextWorkspace: WorkspaceState = {
    ...workspace,
    sourceRegistry: workspace.sourceRegistry.map((entry) => (entry.id === mutation.source.id ? mutation.source : entry)),
    lastUpdatedAt: now,
  };

  if (mutation.documents.length === 0) {
    return nextWorkspace;
  }

  return {
    ...nextWorkspace,
    documents: [...workspace.documents, ...mutation.documents],
    error: null,
    phase: 'ingestion',
  };
}

export function applyCollectionSourceState(
  workspace: WorkspaceState,
  sourceId: string,
  updater: (source: CollectionSource) => CollectionSource,
  now: string = new Date().toISOString()
): WorkspaceState {
  return {
    ...workspace,
    sourceRegistry: workspace.sourceRegistry.map((source) => (source.id === sourceId ? updater(source) : source)),
    lastUpdatedAt: now,
  };
}

export function resolveSelectedDocumentAfterCollection(
  selectedDocumentId: string | null,
  documents: WorkspaceDocument[]
): string | null {
  if (selectedDocumentId || documents.length === 0) {
    return selectedDocumentId;
  }

  return documents[0]?.id || null;
}

export function requiresCandidateReview(strategy: SourceDiscoveryStrategy): boolean {
  return REVIEW_DISCOVERY_STRATEGIES.includes(strategy);
}

function createCollectedWorkspaceDocuments(
  files: File[],
  source: CollectionSource,
  now: string
): WorkspaceDocument[] {
  return files.map((file) => {
    const pdf = createPdfFile(file);
    const document = createWorkspaceDocument(pdf);
    return {
      ...document,
      collectionSource: {
        ...source,
        status: 'discovered',
        lastCollectedAt: now,
      },
    };
  });
}

function toDiscoveryCandidateSummary(candidate: SourceCandidate): SourceDiscoveryCandidateSummary {
  return {
    url: candidate.url,
    label: candidate.label,
    fileName: candidate.file_name,
  };
}

export function isSourceCollectionStatus(value: string): value is SourceCollectionStatus {
  return value === 'manual' || value === 'discovered' || value === 'collected' || value === 'review';
}
