import { describe, expect, it, vi } from 'vitest';

import type { SourceCandidate, SourceDiscoveryResponse } from '@/lib/ocrBackendClient';
import {
  applySourceCollectionMutation,
  collectDiscoveredSourceCandidate,
  createSourceCollectionProgressState,
  createSourceCollectionReviewState,
  importCollectionSource,
  requiresCandidateReview,
  resolveSelectedDocumentAfterCollection,
} from '@/lib/sourceCollection';
import { preservedSearchCapabilityBaseline } from '@/test/promptSearchBaseline';
import { createDefaultSourceRegistry } from '@/lib/workspace';
import type { CollectionSource, WorkspaceState } from '@/types';

function createWorkspaceState(source: CollectionSource): WorkspaceState {
  return {
    sessionId: 'session-1',
    sourceRegistry: [source],
    documents: [],
    generatedUI: null,
    activeDeliveryMode: 'interactive-browser',
    phase: 'idle',
    isProcessing: false,
    error: 'stale error',
    lastUpdatedAt: '2026-03-11T00:00:00.000Z',
  };
}

function createClient(overrides: Partial<{
  discoverSource: (url: string, strategy: string) => Promise<SourceDiscoveryResponse>;
  fetchRemotePdf: (url: string) => Promise<File>;
}> = {}) {
  return {
    discoverSource: overrides.discoverSource || vi.fn(),
    fetchRemotePdf: overrides.fetchRemotePdf || vi.fn(),
  };
}

describe('sourceCollection helpers', () => {
  it('keeps current strategy compatibility boundaries', () => {
    expect(requiresCandidateReview('listing-page')).toBe(true);
    expect(requiresCandidateReview('viewer-kintone')).toBe(true);
    expect(requiresCandidateReview('static-pdf-url')).toBe(false);
    expect(requiresCandidateReview('manual-upload')).toBe(false);
  });

  it('locks source discovery and fetch as the current guaranteed search baseline', () => {
    expect(preservedSearchCapabilityBaseline.minimumCapability).toBe('source-discovery-and-fetch');
    expect(preservedSearchCapabilityBaseline.reviewStrategies.every((strategy) => requiresCandidateReview(strategy))).toBe(true);
    expect(preservedSearchCapabilityBaseline.directFetchStrategies.every((strategy) => !requiresCandidateReview(strategy))).toBe(true);
    expect(preservedSearchCapabilityBaseline.broaderSearchAugmentation).toEqual({
      status: 'optional-future-work',
      requiredForCurrentBranch: false,
    });
  });

  it('marks in-progress discovery without dropping existing notes', () => {
    const source = createDefaultSourceRegistry()[0]!;

    expect(createSourceCollectionProgressState(source).notes).toBe(
      'viewer/kintone 型。収集アダプタ実装対象。 取得候補を確認中...'
    );
  });

  it('moves zero-candidate discovery to review without fetching files', async () => {
    const source = createDefaultSourceRegistry()[2]!;
    const client = createClient({
      discoverSource: vi.fn().mockResolvedValue({
        source_url: source.sourceUrl,
        strategy: source.discoveryStrategy,
        candidates: [],
      }),
    });

    const mutation = await importCollectionSource(source, client, '2026-03-11T10:00:00.000Z');

    expect(mutation.source.status).toBe('review');
    expect(mutation.source.notes).toBe('候補 PDF が見つかりませんでした。');
    expect(mutation.documents).toEqual([]);
    expect(client.fetchRemotePdf).not.toHaveBeenCalled();
  });

  it('keeps listing and viewer discovery in discovered state with truncated candidates', async () => {
    const source = createDefaultSourceRegistry()[1]!;
    const candidates = Array.from({ length: 9 }, (_, index) => ({
      url: `https://example.com/${index}.pdf`,
      label: `candidate-${index}`,
      file_name: `candidate-${index}.pdf`,
    }));
    const client = createClient({
      discoverSource: vi.fn().mockResolvedValue({
        source_url: source.sourceUrl,
        strategy: source.discoveryStrategy,
        candidates,
      }),
    });

    const mutation = await importCollectionSource(source, client, '2026-03-11T10:00:00.000Z');

    expect(mutation.source.status).toBe('discovered');
    expect(mutation.source.notes).toBe('9件の候補 PDF を検出しました。');
    expect(mutation.source.discoveryCandidates).toHaveLength(8);
    expect(mutation.documents).toEqual([]);
    expect(client.fetchRemotePdf).not.toHaveBeenCalled();
  });

  it('fetches the first direct candidate and appends discovered documents', async () => {
    const source = createDefaultSourceRegistry()[2]!;
    const client = createClient({
      discoverSource: vi.fn().mockResolvedValue({
        source_url: source.sourceUrl,
        strategy: source.discoveryStrategy,
        candidates: [
          {
            url: 'https://example.com/direct.pdf',
            label: 'direct',
            file_name: 'direct.pdf',
          },
          {
            url: 'https://example.com/ignored.pdf',
            label: 'ignored',
            file_name: 'ignored.pdf',
          },
        ],
      }),
      fetchRemotePdf: vi.fn().mockResolvedValue(new File(['pdf'], 'direct.pdf', { type: 'application/pdf' })),
    });

    const mutation = await importCollectionSource(source, client, '2026-03-11T10:00:00.000Z');
    const nextWorkspace = applySourceCollectionMutation(
      createWorkspaceState(source),
      mutation,
      '2026-03-11T10:00:01.000Z'
    );

    expect(mutation.source.status).toBe('collected');
    expect(mutation.source.notes).toBe('2件の候補を検出し、1件を追加しました。');
    expect(mutation.source.discoveryCandidates).toEqual([
      {
        url: 'https://example.com/direct.pdf',
        label: 'direct',
        fileName: 'direct.pdf',
      },
    ]);
    expect(mutation.documents).toHaveLength(1);
    expect(mutation.documents[0]?.collectionSource.status).toBe('discovered');
    expect(nextWorkspace.phase).toBe('ingestion');
    expect(nextWorkspace.error).toBeNull();
    expect(nextWorkspace.documents).toHaveLength(1);
  });

  it('adds a selected discovered candidate and preserves current fallback messaging contract', async () => {
    const source = createDefaultSourceRegistry()[0]!;
    const candidate: SourceCandidate = {
      url: 'https://example.com/viewer.pdf',
      label: 'viewer',
      file_name: 'viewer.pdf',
    };
    const client = createClient({
      fetchRemotePdf: vi.fn().mockResolvedValue(new File(['pdf'], 'viewer.pdf', { type: 'application/pdf' })),
    });

    const mutation = await collectDiscoveredSourceCandidate(source, candidate, client, '2026-03-11T10:00:00.000Z');

    expect(mutation.source.status).toBe('collected');
    expect(mutation.source.notes).toBe('viewer.pdf を追加しました。');
    expect(mutation.documents[0]?.collectionSource.status).toBe('discovered');
    expect(resolveSelectedDocumentAfterCollection(null, mutation.documents)).toBe(mutation.documents[0]?.id);
    expect(
      createSourceCollectionReviewState(source, '候補 PDF の追加に失敗しました。').notes
    ).toBe('候補 PDF の追加に失敗しました。');
  });
});
