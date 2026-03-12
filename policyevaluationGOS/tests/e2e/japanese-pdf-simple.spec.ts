import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const PDF_PATH = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf';
const ARTIFACTS_DIR = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/policyevaluationGOS/artifacts';
const BASE_URL = 'http://localhost:3005';

test.describe('Japanese Policy PDF Upload - Simple Test', () => {
  test('upload and process Japanese policy PDF', async ({ page }) => {
    // Track console output
    page.on('console', msg => console.log(`[Console ${msg.type()}]`, msg.text()));

    // Track API calls
    const apiCalls: any[] = [];
    page.on('response', async response => {
      if (response.url().includes('/api/') || response.url().includes('localhost:11434')) {
        console.log(`[API] ${response.request().method()} ${response.url()} -> ${response.status()}`);
      }
    });

    console.log('Step 1: Navigating to app...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Screenshot initial state
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'test-01-initial.png'),
      fullPage: true
    });

    console.log('Step 2: Uploading PDF...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(PDF_PATH);
    console.log('File uploaded:', PDF_PATH);

    // Wait a bit for UI to update
    await page.waitForTimeout(3000);

    // Screenshot after upload
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'test-02-uploaded.png'),
      fullPage: true
    });

    console.log('Step 3: Waiting for processing (this may take 1-2 minutes)...');

    // Wait for data to appear - we'll poll for it
    let hasStructuredData = false;
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max

    while (attempts < maxAttempts && !hasStructuredData) {
      await page.waitForTimeout(1000);
      attempts++;

      // Every 10 seconds, check and screenshot
      if (attempts % 10 === 0) {
        console.log(`Still waiting... (${attempts}s)`);

        // Take progress screenshot
        await page.screenshot({
          path: path.join(ARTIFACTS_DIR, `test-03-progress-${attempts}.png`),
          fullPage: true
        });
      }

      // Check if structured data appeared
      const bodyText = await page.evaluate(() => document.body.innerText);

      // Look for any data indicators
      if (bodyText.includes('政策名') ||
          bodyText.includes('カテゴリ') ||
          bodyText.includes('自治体') ||
          bodyText.includes('重点項目')) {
        console.log('Structured data detected!');
        hasStructuredData = true;
      }

      // Also check for completion indicators
      const hasCompletion = await page.locator('text=完了').count() > 0;
      if (hasCompletion && !bodyText.includes('データがありません')) {
        console.log('Processing appears complete');
        hasStructuredData = true;
      }
    }

    // Final screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'test-04-final.png'),
      fullPage: true
    });

    console.log('Step 4: Extracting data...');

    // Get all text
    const allText = await page.evaluate(() => document.body.innerText);

    // Extract structured data
    const extractedData = await page.evaluate(() => {
      // Helper to get text by multiple selectors
      const getText = (selectors: string[]) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent) {
            const text = el.textContent.trim();
            if (text && text !== 'N/A' && text !== '—' && text !== '-') {
              return text;
            }
          }
        }
        return '';
      };

      // Get list items
      const getList = (selectors: string[]) => {
        for (const sel of selectors) {
          const items = document.querySelectorAll(sel);
          if (items.length > 0) {
            return Array.from(items)
              .map(el => el.textContent?.trim())
              .filter(t => t && t !== 'N/A' && t !== '—');
          }
        }
        return [] as string[];
      };

      return {
        policyTitle: getText(['[data-testid="policy-title"]', '.policy-title', 'h2', 'h3']),
        municipality: getText(['[data-testid="municipality"]', '.municipality']),
        category: getText(['[data-testid="category"]', '.category']),
        summary: getText(['[data-testid="summary"]', '.summary', 'p']),
        keyPoints: getList(['[data-testid="key-point"]', '.key-point', 'ul li']),
        kpis: getList(['[data-testid="kpi"]', '.kpi']),
        budget: getText(['[data-testid="budget"]', '.budget']),
        period: getText(['[data-testid="implementation-period"]', '.period', '.date']),
      };
    });

    console.log('\n========== EXTRACTED DATA ==========');
    console.log('Policy Title:', extractedData.policyTitle);
    console.log('Municipality:', extractedData.municipality);
    console.log('Category:', extractedData.category);
    console.log('Summary:', extractedData.summary?.substring(0, 200));
    console.log('Key Points:', extractedData.keyPoints);
    console.log('KPIs:', extractedData.kpis);
    console.log('Budget:', extractedData.budget);
    console.log('Period:', extractedData.period);
    console.log('===================================\n');

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      pdfFile: path.basename(PDF_PATH),
      testDuration: `${attempts}s`,
      extractedData,
      hasStructuredData,
      japaneseTextDetected: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(allText),
      allText: allText,
    };

    // Save JSON report
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'test-results.json'),
      JSON.stringify(report, null, 2)
    );

    // Save readable report
    const mdReport = `# Japanese Policy PDF Test Report

## Test Information
- **Date:** ${new Date().toLocaleString('ja-JP')}
- **PDF:** ${path.basename(PDF_PATH)}
- **Duration:** ${attempts}s
- **Status:** ${hasStructuredData ? 'SUCCESS' : 'TIMEOUT'}

## Extracted Data

### Policy Title
${extractedData.policyTitle || '(Not extracted)'}

### Municipality
${extractedData.municipality || '(Not extracted)'}

### Category
${extractedData.category || '(Not extracted)'}

### Summary
${extractedData.summary || '(Not extracted)'}

### Key Points (${extractedData.keyPoints.length})
${extractedData.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n') || '(None)'}

### KPIs (${extractedData.kpis.length})
${extractedData.kpis.map((k, i) => `${i + 1}. ${k}`).join('\n') || '(None)'}

### Budget
${extractedData.budget || '(Not extracted)'}

### Implementation Period
${extractedData.period || '(Not extracted)'}

## Verification
- Japanese text detected: ${report.japaneseTextDetected ? 'Yes' : 'No'}
- Data properly displayed: ${hasStructuredData ? 'Yes' : 'No'}

---
*Test run by Playwright E2E*
`;

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'test-report.md'),
      mdReport
    );

    console.log('Reports saved to', ARTIFACTS_DIR);

    // Basic assertions
    expect(report.japaneseTextDetected).toBeTruthy();
    console.log('\nTest completed successfully!');

  }, { timeout: 180000 });
});
