import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llmProviders', () => ({
  generateJsonWithFallback: vi.fn(async () => ({
    success: false,
    provider: 'fallback',
    model: 'none',
    error: 'unavailable',
  })),
}));

import { generateJsonWithFallback } from '@/lib/llmProviders';

import {
  buildTableContextForStructuring,
  extractTableArtifacts,
  parseTableArtifacts,
} from '@/lib/tableParsing';

describe('tableParsing', () => {
  it('extracts markdown-style table artifacts from OCR text', () => {
    const ocrText = [
      '## Page 1',
      '',
      '| 項目 | 金額 |',
      '| --- | --- |',
      '| 事業費 | 100 |',
      '| 補助金 | 20 |',
    ].join('\n');

    const artifacts = extractTableArtifacts(ocrText, 'doc-1');

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.page).toBe(1);
    expect(artifacts[0]?.preview).toContain('項目');
  });

  it('builds artifacts directly from backend CSV output when available', () => {
    const artifacts = extractTableArtifacts('noisy ocr text', 'doc-csv', {
      rawCsv: [
        '# Page 1 Table 1',
        '"項目","金額"',
        '"事業費","100"',
        '',
        '# Page 2 Table 1',
        '"項目","評価"',
        '"健康増進","A"',
      ].join('\n'),
      sourcePath: 'backend_ocr',
    });

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.sourceType).toBe('backend_csv');
    expect(artifacts[0]?.page).toBe(1);
    expect(artifacts[0]?.rawCsv).toContain('"項目","金額"');
    expect(artifacts[1]?.page).toBe(2);
  });

  it('parses backend CSV artifacts without calling the LLM selector', async () => {
    const artifacts = extractTableArtifacts('ignored', 'doc-backend-csv', {
      rawCsv: ['# Page 1 Table 1', '"事業名","評価"', '"健康増進事業","A"'].join('\n'),
      sourcePath: 'backend_ocr',
    });

    const results = await parseTableArtifacts(artifacts);

    expect(results[0]?.status).toBe('parsed');
    expect(vi.mocked(generateJsonWithFallback)).not.toHaveBeenCalled();
  });

  it('parses markdown tables with rule-based fallback and builds structuring context', async () => {
    const artifacts = extractTableArtifacts(
      [
        '| 項目 | 金額 |',
        '| --- | --- |',
        '| 事業費 | 100 |',
        '| 補助金 | 20 |',
      ].join('\n'),
      'doc-2'
    );

    const results = await parseTableArtifacts(artifacts);
    const parsed = results[0];

    expect(parsed?.status).toBe('parsed');
    if (parsed?.status === 'parsed') {
      expect(parsed.table.headers).toEqual(['項目', '金額']);
      expect(parsed.table.rows[0]).toEqual(['事業費', '100']);
    }

    const context = buildTableContextForStructuring(results);
    expect(context).toContain('Headers: 項目 | 金額');
  });

  it('prefers fixed-width parsing for budget tables instead of key-value rows', async () => {
    const layoutText = [
      '## Page 1',
      '事業名                              最終予算額    決算額    評価',
      '健康増進事業                         1,200        1,180     A',
      '高齢者支援事業                       980          950       B',
      'こども居場所づくり事業               640          620       A',
    ].join('\n');

    const artifacts = extractTableArtifacts(layoutText, 'doc-fixed', {
      sourceType: 'pdf_layout_text',
      sourcePath: 'pdf_text_fast_path',
    });

    const results = await parseTableArtifacts(artifacts);
    const parsed = results[0];

    expect(parsed?.status).toBe('parsed');
    if (parsed?.status === 'parsed') {
      expect(parsed.table.parserId).not.toBe('key_value_rows');
      expect(parsed.table.parserId).toBe('ledger_budget_table');
      expect(parsed.table.headers.join(' ')).toContain('最終予算額');
      expect(parsed.table.rows[0]?.[0]).toContain('健康増進事業');
    }
  });

  it('falls back to llm repair when rule-based parsers fail', async () => {
    vi.mocked(generateJsonWithFallback)
      .mockResolvedValueOnce({
        success: false,
        provider: 'fallback',
        model: 'none',
        error: 'selector unavailable',
      })
      .mockResolvedValueOnce({
        success: true,
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite',
        data: {
          headers: ['事業名', '評価'],
          rows: [
            ['健康増進事業', 'A'],
            ['高齢者支援事業', 'B'],
          ],
          notes: 'repaired from sparse OCR table',
        },
      });

    const artifacts = [
      {
        id: 'doc-llm-table-1',
        sourceDocumentId: 'doc-llm',
        page: 1,
        tableIndex: 1,
        sourceType: 'ocr_text' as const,
        preview: '健康増進 ??? A\n高齢者支援 ??? B',
        rawText: '健康増進 ??? A\n高齢者支援 ??? B',
      },
    ];

    const results = await parseTableArtifacts(artifacts);
    const parsed = results[0];

    expect(parsed?.status).toBe('parsed');
    if (parsed?.status === 'parsed') {
      expect(parsed.table.parserId).toBe('llm_repair');
      expect(parsed.table.headers).toEqual(['事業名', '評価']);
      expect(parsed.table.rows[1]).toEqual(['高齢者支援事業', 'B']);
    }
  });
});
