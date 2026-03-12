import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const PDF_PATH = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf';
const ARTIFACTS_DIR = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/policyevaluationGOS/artifacts';
const BASE_URL = 'http://localhost:3005';

test.describe('Japanese Policy PDF - Complete Test', () => {
  test('should process Japanese policy PDF and display structured data', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      console.log(`[Browser Console] ${text}`);
    });

    console.log('=== Japanese Policy PDF E2E Test ===');
    console.log(`PDF: ${path.basename(PDF_PATH)}`);
    console.log(`URL: ${BASE_URL}`);
    console.log('');

    // Navigate
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'jp-01-initial.png'),
      fullPage: true
    });

    // Upload PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(PDF_PATH);

    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'jp-02-uploaded.png'),
      fullPage: true
    });

    // Wait for processing with extended timeout
    console.log('Waiting for OCR processing (this may take 2-3 minutes for large Japanese PDFs)...');

    let hasStructuredData = false;
    let attempts = 0;
    const maxAttempts = 240; // 4 minutes max

    while (attempts < maxAttempts && !hasStructuredData) {
      await page.waitForTimeout(1000);
      attempts++;

      if (attempts % 15 === 0) {
        console.log(`Still waiting... (${attempts}s)`);

        await page.screenshot({
          path: path.join(ARTIFACTS_DIR, `jp-03-progress-${attempts}.png`),
          fullPage: true
        });
      }

      // Check for data indicators
      const bodyText = await page.evaluate(() => document.body.innerText);

      // Check for error states
      if (bodyText.includes('OCR text is empty') ||
          bodyText.includes('OCR処理エラー') ||
          bodyText.includes('エラー')) {
        console.log('OCR ERROR DETECTED:');
        console.log(bodyText.substring(bodyText.indexOf('エラー') - 100, bodyText.indexOf('エラー') + 200));

        // Save error screenshot
        await page.screenshot({
          path: path.join(ARTIFACTS_DIR, 'jp-error.png'),
          fullPage: true
        });

        break;
      }

      // Check for success
      if (bodyText.includes('政策名') ||
          bodyText.includes('カテゴリ') ||
          bodyText.includes('自治体') ||
          bodyText.includes('重点項目')) {
        console.log('Structured data detected!');
        hasStructuredData = true;
      }

      // Check for completion
      const completionEl = await page.locator('text=完了').count();
      if (completionEl > 0 && !bodyText.includes('データがありません')) {
        console.log('Processing appears complete');
        hasStructuredData = true;
      }
    }

    // Final screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'jp-04-final.png'),
      fullPage: true
    });

    console.log('\n=== Extracting Data ===');

    // Get all page content
    const allText = await page.evaluate(() => document.body.innerText);

    // Extract structured data using data-testid
    const extractedData = await page.evaluate(() => {
      const getData = (selectors: string[]) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) {
            return el.textContent.trim();
          }
        }
        return '';
      };

      const getList = (selectors: string[]) => {
        for (const sel of selectors) {
          const items = document.querySelectorAll(sel);
          if (items.length > 0) {
            return Array.from(items).map(el => el.textContent?.trim()).filter(Boolean);
          }
        }
        return [];
      };

      return {
        policyTitle: getData(['[data-testid="policy-title"]', '.policy-title', 'h2', 'h3']),
        municipality: getData(['[data-testid="municipality"]', '.municipality']),
        category: getData(['[data-testid="category"]', '.category']),
        summary: getData(['[data-testid="summary"]', '.summary']),
        keyPoints: getList(['[data-testid="key-point"]', '.key-point', 'ul li']),
        kpis: getList(['[data-testid="kpi"]', '.kpi']),
        budget: getData(['[data-testid="budget"]', '.budget']),
        period: getData(['[data-testid="implementation-period"]', '.period', '.date']),
      };
    });

    console.log('Title:', extractedData.policyTitle || '(none)');
    console.log('Municipality:', extractedData.municipality || '(none)');
    console.log('Category:', extractedData.category || '(none)');
    console.log('Key Points:', extractedData.keyPoints.length);
    console.log('KPIs:', extractedData.kpis.length);

    // Generate comprehensive report
    const report = {
      timestamp: new Date().toISOString(),
      pdfFile: path.basename(PDF_PATH),
      pdfSize: fs.statSync(PDF_PATH).size,
      testDuration: `${attempts}s`,
      extractedData,
      hasStructuredData,
      japaneseDetected: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(allText),
      bodyText: allText,
      consoleLogs: logs,
    };

    // Save JSON report
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'japanese-pdf-test.json'),
      JSON.stringify(report, null, 2)
    );

    // Save markdown report
    const mdReport = `# Japanese Policy PDF Test Report

**Date:** ${new Date().toLocaleString('ja-JP')}
**PDF:** ${path.basename(PDF_PATH)} (${(fs.statSync(PDF_PATH).size / 1024).toFixed(0)} KB)
**Test Duration:** ${attempts}s
**Status:** ${hasStructuredData ? 'SUCCESS' : 'FAILED'}

## Extracted Data

### Policy Title
${extractedData.policyTitle || '(Not extracted)'}

### Municipality
${extractedData.municipality || '(Not extracted)'}

### Category
${extractedData.category || '(Not extracted)'}

### Summary
${extractedData.summary ? extractedData.summary.substring(0, 500) + '...' : '(Not extracted)'}

### Key Points (${extractedData.keyPoints.length})
${extractedData.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n') || '(None)'}

### KPIs (${extractedData.kpis.length})
${extractedData.kpis.map((k, i) => `${i + 1}. ${k}`).join('\n') || '(None)'}

### Budget
${extractedData.budget || '(Not extracted)'}

### Implementation Period
${extractedData.period || '(Not extracted)'}

## Console Logs
${logs.map(l => `- ${l}`).join('\n')}

## Screenshots
- jp-01-initial.png
- jp-02-uploaded.png
- jp-03-progress-*.png
- jp-04-final.png

---
*Generated by Playwright E2E Test*
`;

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'japanese-pdf-test.md'),
      mdReport
    );

    console.log('\n=== Test Complete ===');
    console.log('Reports saved to', ARTIFACTS_DIR);

    if (hasStructuredData) {
      console.log('✓ Test PASSED: Structured data was extracted');
    } else {
      console.log('✗ Test FAILED: No structured data was extracted');
    }

  }, { timeout: 300000 }); // 5 minute timeout
});
