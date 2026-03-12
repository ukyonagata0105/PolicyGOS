import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseYomiTokuJsonResult } from '@/lib/yomitokuResult';

describe('yomitokuResult', () => {
  it('extracts text blocks and table rows from json output', () => {
    const rawJson = JSON.stringify([
      {
        text_blocks: [
          { text: '政策推進プラン' },
          { text: '主要な事業一覧' },
        ],
        tables: [
          {
            rows: [
              ['項目', '金額'],
              ['事業費', '100'],
              ['補助金', '20'],
            ],
          },
        ],
      },
    ]);

    const result = parseYomiTokuJsonResult(rawJson);

    expect(result.text).toContain('政策推進プラン');
    expect(result.layoutText).toContain('## Page 1');
    expect(result.rawCsv).toContain('"項目","金額"');
    expect(result.hasTables).toBe(true);
  });

  it('reconstructs tables from cell matrices with row and column indexes', () => {
    const rawJson = JSON.stringify([
      {
        cells: [
          { row: 0, col: 0, text: '項目' },
          { row: 0, col: 1, text: '評価' },
          { row: 1, col: 0, text: '健康増進' },
          { row: 1, col: 1, text: 'A' },
        ],
      },
    ]);

    const result = parseYomiTokuJsonResult(rawJson);

    expect(result.rawCsv).toContain('"項目","評価"');
    expect(result.rawCsv).toContain('"健康増進","A"');
  });

  it('supports real YomiToku page shape with paragraphs and cell contents', () => {
    const rawJson = readFileSync(
      path.resolve(process.cwd(), 'tests/fixtures/yomitoku-real-shape.redacted.json'),
      'utf-8'
    );

    const result = parseYomiTokuJsonResult(rawJson);

    expect(result.layoutText).toContain('HEADER_A');
    expect(result.layoutText).toContain('HEADER_D');
    expect(result.text).toContain('HEADER_A');
    expect(result.rawCsv).toContain('"項目","説明","予算","評価"');
    expect(result.rawCsv).toContain('"事業A","説明A","100","A"');
  });

  it('keeps a committed shape summary for the real OCR payload', () => {
    const summaryText = readFileSync(
      path.resolve(process.cwd(), 'tests/fixtures/yomitoku-real-shape.summary.json'),
      'utf-8'
    );
    const summary = JSON.parse(summaryText) as {
      topKeys: string[];
      pageStats: Array<{ page: number; nonEmptyCellCount: number }>;
    };

    expect(summary.topKeys).toEqual(['paragraphs', 'tables', 'words', 'figures']);
    expect(summary.pageStats).toHaveLength(6);
    expect(summary.pageStats[0]?.nonEmptyCellCount).toBeGreaterThan(200);
  });
});
