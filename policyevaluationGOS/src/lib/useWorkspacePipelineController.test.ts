import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  appendWorkspaceDocuments,
  buildGenerationKey,
  collectGenerationReadyDocuments,
  createInitialWorkspaceState,
} from '@/lib/workspacePipelineController';
import { structurePolicyData } from '@/lib/dataStructurer';
import {
  buildTableContextForStructuring,
  extractTableArtifacts,
  parseTableArtifacts,
} from '@/lib/tableParsing';
import { extractWithBestOCRProvider } from '@/lib/ocrProviders';
import { extractProjectRecords } from '@/lib/projectExtractor';
import { runRepairPipeline } from '@/lib/repairPipeline';
import { preservedSearchCapabilityBaseline } from '@/test/promptSearchBaseline';
import { useWorkspacePipelineController } from '@/lib/useWorkspacePipelineController';
import { createGeneratedUICompatibilityFixture, createGeneratedUIConsumerDocument } from '@/test/generatedUICompat';
import type { ProjectCandidateRow, UserProfile, WorkspaceDocument, WorkspaceState } from '@/types';

const { generateWorkspaceViewSpy } = vi.hoisted(() => ({
  generateWorkspaceViewSpy: vi.fn(),
}));
const { exportWorkspaceAsZipSpy } = vi.hoisted(() => ({
  exportWorkspaceAsZipSpy: vi.fn(),
}));

const { buildViewPlanV2FromWorkspaceSpy, postProcessViewPlanV2CandidateSpy } = vi.hoisted(() => ({
  buildViewPlanV2FromWorkspaceSpy: vi.fn(),
  postProcessViewPlanV2CandidateSpy: vi.fn(),
}));

vi.mock('@/lib/exporters', () => ({
  exportWorkspaceAsZip: exportWorkspaceAsZipSpy,
}));

vi.mock('@/lib/dataStructurer', () => ({
  structurePolicyData: vi.fn(),
}));

vi.mock('@/lib/tableParsing', () => ({
  buildTableContextForStructuring: vi.fn(),
  extractTableArtifacts: vi.fn(),
  parseTableArtifacts: vi.fn(),
}));

vi.mock('@/lib/ocrProviders', () => ({
  extractWithBestOCRProvider: vi.fn(),
}));

vi.mock('@/lib/ocrBackendClient', () => ({
  getOCRBackendClient: vi.fn(),
}));

vi.mock('@/lib/projectExtractor', () => ({
  extractProjectRecords: vi.fn(),
}));

vi.mock('@/lib/repairPipeline', () => ({
  adoptRepairedRows: vi.fn(),
  runRepairPipeline: vi.fn(),
}));

vi.mock('@/lib/sourceCollection', () => ({
  applyCollectionSourceState: vi.fn(),
  applySourceCollectionMutation: vi.fn(),
  collectDiscoveredSourceCandidate: vi.fn(),
  createSourceCollectionProgressState: vi.fn(),
  createSourceCollectionReviewState: vi.fn(),
  importCollectionSource: vi.fn(),
  resolveSelectedDocumentAfterCollection: vi.fn(),
}));

vi.mock('@/lib/uiGenerator', () => ({
  generateWorkspaceView: generateWorkspaceViewSpy,
}));

vi.mock('@/lib/viewPlannerFromWorkspace', () => ({
  buildViewPlanV2FromWorkspace: buildViewPlanV2FromWorkspaceSpy,
}));

vi.mock('@/lib/viewPlanner', () => ({
  postProcessViewPlanV2Candidate: postProcessViewPlanV2CandidateSpy,
}));

function createDocument(name: string): WorkspaceDocument {
  const file = new File(['pdf'], name, { type: 'application/pdf' });

  return {
    file,
    id: `document-${name}`,
    name,
    size: file.size,
    uploadedAt: new Date('2026-03-11T00:00:00.000Z'),
    collectionSource: {
      id: `source-${name}`,
      municipality: '未登録',
      label: name,
      sourceUrl: '',
      discoveryStrategy: 'manual-upload',
      status: 'manual',
      notes: 'test fixture',
    },
    processing: {
      provider: 'pending',
      status: 'queued',
      progress: 0,
      message: '処理待ち',
    },
    ocrText: null,
    structuringText: null,
    rawLayoutText: null,
    rawJson: null,
    rawCsv: null,
    structuredData: null,
    documentDigest: null,
    rawCandidateRows: [],
    candidateRows: [],
    routeDecision: null,
    rowDecisions: [],
    originalNormalizedRows: [],
    repairedNormalizedRows: [],
    normalizedRows: [],
    repairStatus: 'idle',
    repairRawResponse: null,
    repairError: null,
    repairNotes: [],
    repairMetrics: null,
    extractionRawResponse: null,
    extractionError: null,
    projectRecords: [],
    reviewItems: [],
    tableArtifacts: [],
    tableResults: [],
    error: null,
  };
}

function createStructuredPolicy() {
  return {
    title: '地域交通再編計画',
    municipality: '岩手県',
    summary: '住民移動の利便性を改善します。',
    keyPoints: [],
    category: 'infrastructure' as const,
  };
}

function createProjectCandidateRow(documentId: string): ProjectCandidateRow {
  return {
    id: `${documentId}-candidate-1`,
    sourceDocumentId: documentId,
    extractorStrategy: 'row-segmented',
    sourceReference: 'page-1-table-1:row-1',
    sectionPath: [],
    projectNumber: '1-1',
    projectNameCandidate: '地域交通再編事業',
    projectSummaryCandidate: '交通網を再編する事業です。',
    department: '都市政策課',
    rowFields: {
      番号: '1-1',
      事業名: '地域交通再編事業',
      概要: '交通網を再編する事業です。',
      担当: '都市政策課',
    },
    confidence: 0.82,
    candidateKind: 'project',
  };
}

describe('useWorkspacePipelineController helpers', () => {
  beforeEach(() => {
    generateWorkspaceViewSpy.mockReset();
    exportWorkspaceAsZipSpy.mockReset();
    buildViewPlanV2FromWorkspaceSpy.mockReset();
    postProcessViewPlanV2CandidateSpy.mockReset();
    vi.mocked(structurePolicyData).mockReset();
    vi.mocked(buildTableContextForStructuring).mockReset();
    vi.mocked(extractTableArtifacts).mockReset();
    vi.mocked(parseTableArtifacts).mockReset();
    vi.mocked(extractWithBestOCRProvider).mockReset();
    vi.mocked(extractProjectRecords).mockReset();
    vi.mocked(runRepairPipeline).mockReset();
    buildViewPlanV2FromWorkspaceSpy.mockReturnValue({
      version: 'v2',
      root: {
        id: 'page-root',
        kind: 'page',
        children: [],
      },
    });
    postProcessViewPlanV2CandidateSpy.mockReturnValue({
      status: 'fallback',
      fallback: {
        signal: 'fallback_to_v1',
        targetVersion: 'v1',
        attemptedVersion: 'v2',
        reasonCode: 'validation_failed',
        issues: [],
      },
    });
  });

  it('creates the controller-owned initial workspace shell state', () => {
    const state = createInitialWorkspaceState();

    expect(state.sessionId).toEqual(expect.any(String));
    expect(state.sourceRegistry.length).toBeGreaterThan(0);
    expect(state.documents).toEqual([]);
    expect(state.generatedUI).toBeNull();
    expect(state.activeDeliveryMode).toBe('interactive-browser');
    expect(state.phase).toBe('idle');
    expect(state.isProcessing).toBe(false);
    expect(state.error).toBeNull();
    expect(Number.isNaN(Date.parse(state.lastUpdatedAt))).toBe(false);
  });

  it('appends queued documents and re-enters ingestion from controller state', () => {
    const workspace = {
      ...createInitialWorkspaceState(),
      error: 'stale error',
      phase: 'delivery' as const,
    };
    const document = createDocument('queued.pdf');

    const nextWorkspace = appendWorkspaceDocuments(
      workspace,
      [document],
      '2026-03-11T12:00:00.000Z'
    );

    expect(nextWorkspace.documents).toHaveLength(1);
    expect(nextWorkspace.documents[0]?.id).toBe(document.id);
    expect(nextWorkspace.phase).toBe('ingestion');
    expect(nextWorkspace.error).toBeNull();
    expect(nextWorkspace.lastUpdatedAt).toBe('2026-03-11T12:00:00.000Z');
  });

  it('collects only documents that are ready for briefing generation', () => {
    const queuedDocument = createDocument('queued.pdf');
    const structuredDocument = createDocument('structured.pdf');
    const digestedDocument = createDocument('digest.pdf');
    const projectsDocument = createDocument('projects.pdf');

    structuredDocument.structuredData = {
      title: '地域交通再編計画',
      municipality: '岩手県',
      summary: '住民移動の利便性を改善します。',
      keyPoints: [],
      category: 'infrastructure',
    };
    digestedDocument.documentDigest = {
      title: '公共交通再編',
      municipality: '花巻市',
      overview: '交通施策の再編方針です。',
      category: 'infrastructure',
    };
    projectsDocument.projectRecords = [
      {
        id: 'project-1',
        sourceDocumentId: projectsDocument.id,
        projectName: '地域交通再編事業',
        projectSummary: '移動利便性を改善します。',
        sourceRefs: [],
        indicators: [],
        confidence: 0.84,
        reviewFlags: [],
        publicationStatus: 'ready',
        publicationNotes: [],
      },
    ];

    expect(
      collectGenerationReadyDocuments([
        queuedDocument,
        structuredDocument,
        digestedDocument,
        projectsDocument,
      ]).map((document) => document.id)
    ).toEqual([structuredDocument.id, digestedDocument.id, projectsDocument.id]);
  });

  it('keys generation from document pipeline state, profile, and gemini revision', () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const document = createDocument('policy.pdf');

    document.processing.status = 'completed';
    document.reviewItems = [
      {
        id: 'review-1',
        documentId: document.id,
        severity: 'medium',
        reason: '確認待ち',
        status: 'open',
      },
    ];

    expect(buildGenerationKey([document], profile, 2)).toBe(
      `${document.id}:pending:0:1:completed:0:0:0::resident:summary:desktop:2`
    );
  });

  it('accepts the current fallback generation result shape and promotes it to workspace delivery state', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const generatedUI = createGeneratedUICompatibilityFixture();
    const document = createGeneratedUIConsumerDocument();
    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      documents: [document],
      phase: 'understanding' as const,
    };

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: generatedUI,
    });
    buildViewPlanV2FromWorkspaceSpy.mockReturnValue({ version: 'v2', root: { id: 'page-root', kind: 'page', children: [] } });
    postProcessViewPlanV2CandidateSpy.mockReturnValue({
      status: 'ready',
      version: 'v2',
      plan: {
        version: 'v2',
        root: {
          id: 'page-root',
          kind: 'page',
          children: [],
        },
      },
    });

    const setViewPlanV2 = vi.fn();
    const setPlannerFallback = vi.fn();

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 3,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2,
        setPlannerFallback,
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await waitFor(() => {
      expect(generateWorkspaceViewSpy).toHaveBeenCalledWith([document], profile, {
        sourceRegistry: initialWorkspace.sourceRegistry,
      });
      expect(preservedSearchCapabilityBaseline.forwardsSourceRegistryIntoGeneration).toBe(true);
      expect(buildViewPlanV2FromWorkspaceSpy).toHaveBeenCalledWith(
        [document],
        profile,
        initialWorkspace.sourceRegistry
      );
      expect(setViewPlanV2).toHaveBeenCalledWith({
        version: 'v2',
        root: {
          id: 'page-root',
          kind: 'page',
          children: [],
        },
      });
      expect(setPlannerFallback).toHaveBeenCalledWith(null);
      expect(result.current.workspace.generatedUI).toEqual(generatedUI);
      expect(result.current.workspace.phase).toBe('delivery');
      expect(result.current.workspace.isProcessing).toBe(false);
      expect(result.current.workspace.error).toBeNull();
    });
  });

  it('stores deterministic route decisions on documents after extraction evidence is available', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const queuedDocument = createDocument('route-decision.pdf');
    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      documents: [queuedDocument],
      phase: 'ingestion',
    };

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: createGeneratedUICompatibilityFixture(),
    });
    vi.mocked(extractWithBestOCRProvider).mockResolvedValue({
      provider: 'backend',
      text: 'OCR text',
      structuringText: 'Structuring text',
      rawLayoutText: 'Raw layout text',
      rawJson: null,
      rawCsv: '項目,値\n計画名,地域交通再編計画',
      classification: 'digital_text_pdf',
      classificationConfidence: 0.98,
      pathUsed: 'pdf_text_fast_path',
      pages: 1,
    });
    vi.mocked(extractTableArtifacts).mockReturnValue([]);
    vi.mocked(parseTableArtifacts).mockResolvedValue([]);
    vi.mocked(buildTableContextForStructuring).mockReturnValue('');
    vi.mocked(structurePolicyData).mockResolvedValue({
      success: true,
      policy: {
        title: '地域交通再編計画',
        municipality: '岩手県',
        summary: '住民移動の利便性を改善します。',
        keyPoints: [],
        category: 'infrastructure',
      },
      provider: 'gemini',
      model: 'test-model',
    });
    vi.mocked(extractProjectRecords).mockResolvedValue({
      success: true,
      documentDigest: {
        title: '地域交通再編計画',
        municipality: '岩手県',
        overview: '住民移動の利便性を改善します。',
        category: 'infrastructure',
      },
      candidateRows: [],
      rawCandidateRows: [],
      rowDecisions: [],
      normalizedRows: [],
      projects: [],
      reviewItems: [],
      provider: 'heuristic',
      model: 'heuristic-project-extractor',
    });

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 1,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await waitFor(() => {
      expect(result.current.workspace.documents[0]?.processing.status).toBe('completed');
    });

    expect(result.current.workspace.documents[0]?.routeDecision).toEqual({
      route: 'direct',
      reason: 'raw_csv_without_viable_rows',
      confidence: 'weak',
      evidence: {
        rawCsvPresent: true,
        parsedTableCount: 0,
        tableArtifactCount: 0,
        candidateRowCount: 0,
        projectCandidateRowCount: 0,
        viableCandidateRowCount: 0,
      },
    });
  });

  it('moves direct-document files to generation-ready state without project or repair outputs', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const queuedDocument = createDocument('direct-briefing.pdf');
    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      documents: [queuedDocument],
      phase: 'ingestion',
    };

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: createGeneratedUICompatibilityFixture(),
    });
    vi.mocked(extractWithBestOCRProvider).mockResolvedValue({
      provider: 'backend',
      text: 'OCR text',
      structuringText: 'Structuring text',
      rawLayoutText: 'Raw layout text',
      rawJson: null,
      rawCsv: '項目,値\n計画名,地域交通再編計画',
      classification: 'digital_text_pdf',
      classificationConfidence: 0.96,
      pathUsed: 'pdf_text_fast_path',
      pages: 1,
    });
    vi.mocked(extractTableArtifacts).mockReturnValue([]);
    vi.mocked(parseTableArtifacts).mockResolvedValue([]);
    vi.mocked(buildTableContextForStructuring).mockReturnValue('');
    vi.mocked(structurePolicyData).mockResolvedValue({
      success: true,
      policy: createStructuredPolicy(),
      provider: 'gemini',
      model: 'test-model',
    });
    vi.mocked(extractProjectRecords).mockResolvedValue({
      success: true,
      documentDigest: {
        title: '地域交通再編計画',
        municipality: '岩手県',
        overview: '住民移動の利便性を改善します。',
        category: 'infrastructure',
      },
      candidateRows: [],
      rawCandidateRows: [],
      rowDecisions: [],
      normalizedRows: [],
      projects: [],
      reviewItems: [],
      provider: 'heuristic',
      model: 'heuristic-project-extractor',
    });

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 1,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await waitFor(() => {
      expect(result.current.workspace.documents[0]?.processing.status).toBe('completed');
      expect(generateWorkspaceViewSpy).toHaveBeenCalled();
    });

    expect(vi.mocked(runRepairPipeline)).not.toHaveBeenCalled();
    expect(result.current.workspace.documents[0]).toMatchObject({
      routeDecision: {
        route: 'direct',
        reason: 'raw_csv_without_viable_rows',
      },
      candidateRows: [],
      projectRecords: [],
      reviewItems: [],
      repairStatus: 'idle',
      documentDigest: {
        title: '地域交通再編計画',
        municipality: '岩手県',
        overview: '住民移動の利便性を改善します。',
        category: 'infrastructure',
      },
      processing: {
        status: 'completed',
        message: '文書の要約準備が完了しました',
      },
    });
    expect(collectGenerationReadyDocuments(result.current.workspace.documents).map((document) => document.id)).toEqual([
      queuedDocument.id,
    ]);
    expect(generateWorkspaceViewSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ id: queuedDocument.id, routeDecision: expect.objectContaining({ route: 'direct' }) })],
      profile,
      { sourceRegistry: initialWorkspace.sourceRegistry }
    );
  });

  it('keeps mixed workspaces route-aware so direct documents and table documents generate together deterministically', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const directDocument = createDocument('mixed-direct.pdf');
    directDocument.processing = {
      ...directDocument.processing,
      status: 'completed',
      progress: 100,
      message: '文書の要約準備が完了しました',
    };
    directDocument.structuredData = createStructuredPolicy();
    directDocument.documentDigest = {
      title: '地域交通再編計画',
      municipality: '岩手県',
      overview: '住民移動の利便性を改善します。',
      category: 'infrastructure',
    };
    directDocument.routeDecision = {
      route: 'direct',
      reason: 'no_tabular_evidence',
      confidence: 'strong',
      evidence: {
        rawCsvPresent: false,
        parsedTableCount: 0,
        tableArtifactCount: 0,
        candidateRowCount: 0,
        projectCandidateRowCount: 0,
        viableCandidateRowCount: 0,
      },
    };

    const tableDocument = createDocument('mixed-table.pdf');
    tableDocument.processing = {
      ...tableDocument.processing,
      status: 'completed',
      progress: 100,
      message: '処理完了',
    };
    tableDocument.structuredData = createStructuredPolicy();
    tableDocument.documentDigest = {
      title: '地域交通再編計画',
      municipality: '岩手県',
      overview: '住民移動の利便性を改善します。',
      category: 'infrastructure',
    };
    tableDocument.routeDecision = {
      route: 'table',
      reason: 'viable_candidate_rows',
      confidence: 'strong',
      evidence: {
        rawCsvPresent: true,
        parsedTableCount: 1,
        tableArtifactCount: 1,
        candidateRowCount: 1,
        projectCandidateRowCount: 1,
        viableCandidateRowCount: 1,
      },
    };
    tableDocument.candidateRows = [createProjectCandidateRow(tableDocument.id)];
    tableDocument.projectRecords = [
      {
        id: 'project-1',
        sourceDocumentId: tableDocument.id,
        projectName: '地域交通再編事業',
        projectSummary: '交通網を再編する事業です。',
        sourceRefs: [],
        indicators: [],
        confidence: 0.84,
        reviewFlags: [],
        publicationStatus: 'ready',
        publicationNotes: [],
      },
    ];
    tableDocument.tableResults = [
      {
        status: 'parsed',
        table: {
          id: 'table-1',
          artifactId: 'artifact-1',
          parserId: 'backend_csv_passthrough',
          headers: ['番号', '事業名', '概要'],
          rows: [['1-1', '地域交通再編事業', '交通網を再編する事業です。']],
          csv: '番号,事業名,概要',
          json: [{ 番号: '1-1', 事業名: '地域交通再編事業', 概要: '交通網を再編する事業です。' }],
          issues: [],
        },
        decision: {
          parserId: 'backend_csv_passthrough',
          confidence: 0.9,
          fallbackParserIds: ['no_parse'],
          provider: 'test',
          model: 'test',
        },
      },
    ];

    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      documents: [directDocument, tableDocument],
      sourceRegistry: [
        {
          id: 'registry-iwate',
          municipality: '岩手県',
          label: '岩手県 政策評価 viewer',
          sourceUrl: 'https://example.test/iwate',
          discoveryStrategy: 'viewer-kintone',
          status: 'review',
          notes: 'seed source',
        },
      ],
      phase: 'understanding',
    };

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: createGeneratedUICompatibilityFixture(),
    });

    renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 2,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await waitFor(() => {
      expect(generateWorkspaceViewSpy).toHaveBeenCalledTimes(1);
    });

    const generationDocuments = generateWorkspaceViewSpy.mock.calls[0]?.[0] as WorkspaceDocument[];
    expect(generationDocuments.map((document) => ({ id: document.id, route: document.routeDecision?.route }))).toEqual([
      { id: directDocument.id, route: 'direct' },
      { id: tableDocument.id, route: 'table' },
    ]);
    expect(generationDocuments[0]).toMatchObject({
      id: directDocument.id,
      candidateRows: [],
      projectRecords: [],
      documentDigest: {
        title: '地域交通再編計画',
      },
    });
    expect(generationDocuments[1]).toMatchObject({
      id: tableDocument.id,
      candidateRows: [expect.objectContaining({ sourceDocumentId: tableDocument.id })],
      projectRecords: [expect.objectContaining({ sourceDocumentId: tableDocument.id })],
      routeDecision: expect.objectContaining({ route: 'table' }),
    });
    expect(generateWorkspaceViewSpy).toHaveBeenCalledWith(generationDocuments, profile, {
      sourceRegistry: initialWorkspace.sourceRegistry,
    });
  });

  it('preserves the current table-driven project view sections when promoting delivery state', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const document = createGeneratedUIConsumerDocument();
    const generatedUI = {
      id: 'table-driven-ui',
      title: '地域交通再編計画',
      summary: '1件の事業を、収集台帳・事業一覧・説明ビューとして再編成しました。',
      timestamp: '2026-03-12T10:00:00.000Z',
      provider: 'canonical-store' as const,
      model: 'heuristic-project-view',
      schema: {
        layout: {
          density: 'comfortable' as const,
          emphasis: 'summary' as const,
          heroStyle: 'dashboard' as const,
        },
        sections: [
          {
            id: 'overview',
            kind: 'hero' as const,
            title: '地域交通再編計画',
            description: '住民向けに主要指標と公開可否を整理した briefing です。',
            accent: 'sky' as const,
            items: [
              { label: '文書数', value: '1件', emphasis: 'strong' as const },
              { label: '事業数', value: '1件', emphasis: 'strong' as const },
              { label: '公開可', value: '1件' },
              { label: '要確認', value: '0件' },
              { label: '公開保留', value: '0件' },
            ],
          },
          {
            id: 'collection-registry',
            kind: 'documents' as const,
            title: '収集台帳',
            description: '自治体ごとの取得元と収集方式です。',
            accent: 'slate' as const,
            table: {
              columns: ['自治体', '取得元', '方式', '状態'],
              rows: [
                ['岩手県', 'https://example.test/iwate', 'viewer-kintone', 'review'],
                ['岩手県', '手動アップロード', 'manual-upload', 'manual'],
              ],
            },
          },
          {
            id: 'project-explorer',
            kind: 'data-table' as const,
            title: '事業一覧',
            description: '事業名をクリックすると指標と出典メモを確認できます。',
            accent: 'emerald' as const,
            table: {
              columns: ['事業', '自治体', '活動指標', '成果指標', '公開状態', '要確認'],
              rows: [['1-1 地域交通再編事業', '岩手県', '0件', '1件', '公開可', 'なし']],
              rowSectionIds: ['detail-project-1'],
              rowLinkColumnIndex: 0,
            },
          },
          {
            id: 'detail-project-1',
            kind: 'documents' as const,
            title: '案件詳細: 地域交通再編事業',
            description: '出典メモ付きの事業詳細です。',
            accent: 'slate' as const,
            items: [
              { label: '事業番号', value: '1-1' },
              { label: '事業名', value: '地域交通再編事業', emphasis: 'strong' as const },
              { label: '文書', value: document.name },
              { label: '公開状態', value: '公開可' },
              { label: '出典メモ', value: 'page-1-table-1:row-1' },
            ],
          },
        ],
      },
    };
    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      documents: [document],
      sourceRegistry: [
        {
          id: 'registry-iwate',
          municipality: '岩手県',
          label: '岩手県 政策評価 viewer',
          sourceUrl: 'https://example.test/iwate',
          discoveryStrategy: 'viewer-kintone',
          status: 'review',
          notes: 'seed source',
        },
      ],
      phase: 'understanding' as const,
    };

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: generatedUI,
    });
    postProcessViewPlanV2CandidateSpy.mockReturnValue({
      status: 'ready',
      version: 'v2',
      plan: {
        version: 'v2',
        root: {
          id: 'page-root',
          kind: 'page',
          children: [],
        },
      },
    });

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 5,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await waitFor(() => {
      expect(result.current.workspace.generatedUI).toEqual(generatedUI);
      expect(result.current.workspace.generatedUI?.schema.sections.map((section) => section.id)).toEqual([
        'overview',
        'collection-registry',
        'project-explorer',
        'detail-project-1',
      ]);
      expect(result.current.workspace.generatedUI?.schema.sections[1]?.table?.rows).toEqual([
        ['岩手県', 'https://example.test/iwate', 'viewer-kintone', 'review'],
        ['岩手県', '手動アップロード', 'manual-upload', 'manual'],
      ]);
      expect(result.current.workspace.generatedUI?.schema.sections[2]?.table?.rows[0]).toEqual([
        '1-1 地域交通再編事業',
        '岩手県',
        '0件',
        '1件',
        '公開可',
        'なし',
      ]);
    });
  });

  it('keeps zip export on the v1 generated UI contract during v2 coexistence', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const generatedUI = createGeneratedUICompatibilityFixture();
    const document = createGeneratedUIConsumerDocument();
    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: generatedUI,
    });
    exportWorkspaceAsZipSpy.mockResolvedValue(undefined);
    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      generatedUI,
      documents: [document],
      phase: 'delivery' as const,
    };

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 3,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await act(async () => {
      await result.current.controller.handleDeliveryMode('zip-export');
    });

    expect(exportWorkspaceAsZipSpy).toHaveBeenCalledWith(generatedUI, [document], profile);
  });

  it('submits a fresh prompt without requiring a document route', async () => {
    const profile: UserProfile = {
      audience: 'resident',
      readingPreference: 'summary',
      displayConstraint: 'desktop',
    };
    const generatedUI = createGeneratedUICompatibilityFixture();

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: generatedUI,
    });
    postProcessViewPlanV2CandidateSpy.mockReturnValue({
      status: 'ready',
      version: 'v2',
      plan: {
        version: 'v2',
        root: {
          id: 'page-root',
          kind: 'page',
          children: [],
        },
      },
    });

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(createInitialWorkspaceState());

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 1,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await act(async () => {
      const promptResult = await result.current.controller.submitPromptQuestion({
        prompt: '地域交通の争点を住民向けに説明して',
        mode: 'fresh',
        session: {
          turns: [],
          attachment: null,
        },
      });

      expect(promptResult?.messages).toEqual([
        { role: 'user', content: '地域交通の争点を住民向けに説明して' },
        { role: 'assistant', content: `Briefing を更新しました: ${generatedUI.title}` },
      ]);
      expect(promptResult?.session).toEqual({
        turns: [
          { role: 'user', content: '地域交通の争点を住民向けに説明して' },
          { role: 'assistant', content: `Briefing を更新しました: ${generatedUI.title}` },
        ],
        attachment: null,
      });
    });

      expect(generateWorkspaceViewSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ routeDecision: expect.objectContaining({ route: 'direct' }) })],
        profile,
        expect.objectContaining({
          sourceRegistry: expect.any(Array),
        promptRequest: {
          prompt: '地域交通の争点を住民向けに説明して',
          mode: 'fresh',
            messages: [],
            contextDocumentId: null,
          },
        })
      );
  });

  it('keeps PDF context and prior turns during follow-up prompt generation', async () => {
    const profile: UserProfile = {
      audience: 'researcher',
      readingPreference: 'detail',
      displayConstraint: 'desktop',
    };
    const contextDocument = createGeneratedUIConsumerDocument('context.pdf');
    contextDocument.processing.status = 'completed';
    contextDocument.processing.progress = 100;
    contextDocument.routeDecision = {
      route: 'table',
      reason: 'viable_candidate_rows',
      confidence: 'strong',
      evidence: {
        rawCsvPresent: true,
        parsedTableCount: 1,
        tableArtifactCount: 1,
        candidateRowCount: 1,
        projectCandidateRowCount: 1,
        viableCandidateRowCount: 1,
      },
    };
    const initialWorkspace: WorkspaceState = {
      ...createInitialWorkspaceState(),
      documents: [contextDocument],
      phase: 'delivery',
    };

    generateWorkspaceViewSpy.mockResolvedValue({
      success: true,
      ui: createGeneratedUICompatibilityFixture(),
    });

    const { result } = renderHook(() => {
      const [workspace, setWorkspace] = useState(initialWorkspace);

      const controller = useWorkspacePipelineController({
        workspace,
        setWorkspace,
        backendState: {
          apiUrl: 'http://127.0.0.1:8000',
          ready: true,
          error: null,
          mismatchReason: null,
          probeKind: 'policyeval-backend',
        },
        userProfile: profile,
        geminiApiKeySaved: 'test-key',
        geminiConfigRevision: 1,
        setSelectedDocumentId: vi.fn(),
        setViewPlanV2: vi.fn(),
        setPlannerFallback: vi.fn(),
        onRequireGeminiSettings: vi.fn(),
      });

      return { controller, workspace };
    });

    await act(async () => {
      await result.current.controller.submitPromptQuestion({
        prompt: '次は議員向けに比較ポイントを絞って',
        mode: 'follow-up',
        session: {
          turns: [
            { role: 'user', content: '地域交通の争点を説明して' },
            { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
          ],
          attachment: {
            id: 'attachment-context',
            kind: 'pdf',
            name: contextDocument.name,
            sourceDocumentId: contextDocument.id,
          },
        },
      });
    });

    expect(generateWorkspaceViewSpy).toHaveBeenCalledWith(
      [expect.objectContaining({ id: contextDocument.id })],
      profile,
      expect.objectContaining({
        sourceRegistry: initialWorkspace.sourceRegistry,
        promptRequest: {
          prompt: '次は議員向けに比較ポイントを絞って',
          mode: 'follow-up',
          messages: [
            { role: 'user', content: '地域交通の争点を説明して' },
            { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
          ],
          contextDocumentId: contextDocument.id,
        },
      })
    );
  });
});
