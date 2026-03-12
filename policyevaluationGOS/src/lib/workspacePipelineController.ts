import { createDefaultSourceRegistry } from '@/lib/workspace';
import type { UserProfile, WorkspaceDocument, WorkspaceState } from '@/types';

export function createInitialWorkspaceState(): WorkspaceState {
  return {
    sessionId: crypto.randomUUID(),
    sourceRegistry: createDefaultSourceRegistry(),
    documents: [],
    generatedUI: null,
    activeDeliveryMode: 'interactive-browser',
    phase: 'idle',
    isProcessing: false,
    error: null,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function appendWorkspaceDocuments(
  workspace: WorkspaceState,
  documents: WorkspaceDocument[],
  now: string = new Date().toISOString()
): WorkspaceState {
  if (documents.length === 0) {
    return workspace;
  }

  return {
    ...workspace,
    documents: [...workspace.documents, ...documents],
    error: null,
    phase: 'ingestion',
    lastUpdatedAt: now,
  };
}

export function collectGenerationReadyDocuments(documents: WorkspaceDocument[]): WorkspaceDocument[] {
  return documents.filter(
    (document) => document.projectRecords.length > 0 || document.documentDigest || document.structuredData
  );
}

export function hasQueuedWorkspaceDocuments(documents: WorkspaceDocument[]): boolean {
  return documents.some((document) => document.processing.status === 'queued');
}

export function buildGenerationKey(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  geminiConfigRevision = 0
): string {
  const documentKey = documents
    .map(
      (document) =>
        `${document.id}:${document.routeDecision?.route || 'pending'}:${document.projectRecords.length}:${document.reviewItems.length}:${document.processing.status}:${document.tableResults.length}:${document.documentDigest ? 1 : 0}:${document.structuredData ? 1 : 0}`
    )
    .join('|');

  return `${documentKey}::${userProfile.audience}:${userProfile.readingPreference}:${userProfile.displayConstraint}:${geminiConfigRevision}`;
}
