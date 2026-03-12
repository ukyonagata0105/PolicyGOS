import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportWorkspaceAsZip } from '@/lib/exporters';
import type { ViewPlanV2 } from '@/lib/viewPlanV2';
import {
  createGeneratedUICompatibilityFixture,
  createGeneratedUIConsumerDocument,
  generatedUICompatibilityProfile,
} from '@/test/generatedUICompat';

describe('exportWorkspaceAsZip compatibility', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('exports the current v1 GeneratedUI contract into html and manifest artifacts', async () => {
    const generatedUI = createGeneratedUICompatibilityFixture();
    const workspaceDocument = createGeneratedUIConsumerDocument();
    const viewPlanV2: ViewPlanV2 = {
      version: 'v2',
      root: {
        id: 'page-root',
        kind: 'page',
        title: 'Runtime Briefing',
        description: 'route-aware briefing for resident',
        children: [],
      },
    };
    let capturedBlob: Blob | null = null;
    const appendedNodes: Node[] = [];

    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        capturedBlob = blob;
      }
      return 'blob:generated-ui-compat';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
      appendedNodes.push(node);
      return node;
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await exportWorkspaceAsZip({
      generatedUI,
      documents: [workspaceDocument],
      userProfile: generatedUICompatibilityProfile,
      viewPlanV2,
      sourceRegistry: [workspaceDocument.collectionSource],
      promptSession: {
        messages: [
          { role: 'user', content: '地域交通の争点を説明して' },
          { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
        ],
        contextDocumentId: workspaceDocument.id,
      },
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendedNodes[0]).toBeInstanceOf(HTMLAnchorElement);
    expect((appendedNodes[0] as HTMLAnchorElement).download).toBe('地域交通再編計画ビュー.zip');
    expect(capturedBlob).toBeInstanceOf(Blob);

    const zip = await JSZip.loadAsync(capturedBlob!);
    const indexHtml = await zip.file('index.html')?.async('string');
    const runtimeV1Html = await zip.file('runtime-v1.html')?.async('string');
    const runtimeV2Html = await zip.file('runtime-v2.html')?.async('string');
    const manifest = JSON.parse((await zip.file('manifest.json')?.async('string')) || '{}');
    const sourceJson = await zip.file('sources/region-policy.pdf.json')?.async('string');
    const sourceCsv = await zip.file('sources/region-policy.pdf-project-rows.csv')?.async('string');

    expect(indexHtml).toContain('<!DOCTYPE html>');
    expect(indexHtml).toContain('<title>Runtime Briefing</title>');
    expect(indexHtml).toContain('generated-view-v2');
    expect(runtimeV1Html).toContain('<title>地域交通再編計画ビュー</title>');
    expect(runtimeV1Html).toContain('generated-view__canvas');
    expect(runtimeV2Html).toContain('route-aware briefing for resident');
    expect(manifest).toMatchObject({
      generatedAt: generatedUI.timestamp,
      title: generatedUI.title,
      provider: generatedUI.provider,
      model: generatedUI.model,
      userProfile: generatedUICompatibilityProfile,
      runtime: {
        selected: 'v2',
        available: { v1: true, v2: true },
      },
      promptSession: {
        turnCount: 2,
        lastUserPrompt: '地域交通の争点を説明して',
        contextDocumentId: workspaceDocument.id,
        contextDocumentName: workspaceDocument.name,
      },
      routes: {
        direct: 0,
        table: 0,
        pending: 1,
      },
      sourceRegistry: [
        expect.objectContaining({
          municipality: workspaceDocument.collectionSource.municipality,
          sourceUrl: workspaceDocument.collectionSource.sourceUrl,
        }),
      ],
      documents: [
        expect.objectContaining({
          name: workspaceDocument.name,
          structuredTitle: '地域交通再編計画',
          ocrAvailable: false,
          routeDecision: workspaceDocument.routeDecision,
        }),
      ],
    });
    expect(sourceJson).toContain('"projectName": "地域交通再編事業"');
    expect(sourceCsv).toContain('source_reference,section_path,municipality,project_number,project_name');
    expect(sourceCsv).toContain('page-1-table-1:row-1,交通政策,岩手県,1-1,地域交通再編事業');
  });

  it('exports derived candidate bundle metadata for zero-candidate documents', async () => {
    const generatedUI = createGeneratedUICompatibilityFixture();
    const workspaceDocument = createGeneratedUIConsumerDocument();
    let capturedBlob: Blob | null = null;

    workspaceDocument.candidateRows = [];
    workspaceDocument.normalizedRows = [];
    workspaceDocument.rawCsv = '番号,事業名\n';
    workspaceDocument.rawLayoutText = 'page 1 layout preview';
    workspaceDocument.structuredData = {
      title: '候補なし文書',
      municipality: workspaceDocument.structuredData?.municipality || workspaceDocument.collectionSource.municipality || '未抽出',
      summary: '候補行が空でもエクスポートにはメタデータを残す。',
      keyPoints: workspaceDocument.structuredData?.keyPoints || [],
      category: workspaceDocument.structuredData?.category || 'other',
    };

    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) {
        capturedBlob = blob;
      }
      return 'blob:zero-candidate';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node: Node) => node);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await exportWorkspaceAsZip(generatedUI, [workspaceDocument], generatedUICompatibilityProfile);

    const zip = await JSZip.loadAsync(capturedBlob!);
    const sourceJson = JSON.parse((await zip.file('sources/region-policy.pdf.json')?.async('string')) || '{}');

    expect(sourceJson.candidateBundle).toMatchObject({
      documentId: workspaceDocument.id,
      documentName: workspaceDocument.name,
      municipalityHint: workspaceDocument.collectionSource.municipality,
      titleHint: '候補なし文書',
      overviewHint: '候補行が空でもエクスポートにはメタデータを残す。',
      candidateRows: [],
      fieldGlossary: {},
      neighborRows: [],
      rawCsvPreview: '番号,事業名\n',
      layoutPreview: 'page 1 layout preview',
    });
  });
});
