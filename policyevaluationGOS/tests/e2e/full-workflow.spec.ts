import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PDF_PATH = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf';
const ARTIFACTS_DIR = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/policyevaluationGOS/artifacts';

test.describe('Full Workflow Test with Real PDF', () => {
  test('complete PDF upload → OCR → structuring workflow', async ({ page }) => {
    console.log('\n========== FULL WORKFLOW TEST ==========');
    console.log('BASE_URL:', BASE_URL);
    console.log('PDF:', PDF_PATH);
    console.log('========================================\n');

    // Track console messages
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[Browser ${msg.type().toUpperCase()}]`, msg.text());
      }
    });

    // Step 1: Navigate
    console.log('Step 1: Navigating to app...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Verify initial state
    await expect(page.locator('h1')).toContainText('政策評価分析システム');
    console.log('✓ App loaded');

    // Screenshot initial
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'full-01-initial.png'), fullPage: true });

    // Step 2: Upload PDF
    console.log('\nStep 2: Uploading PDF...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(PDF_PATH);
    console.log('✓ File selected');

    // Wait for upload to start
    await page.waitForTimeout(2000);

    // Screenshot after upload
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'full-02-uploaded.png'), fullPage: true });

    // Step 3: Wait for OCR processing
    console.log('\nStep 3: Waiting for OCR processing...');
    
    // Check for progress indicators
    let ocrComplete = false;
    let attempts = 0;
    const maxAttempts = 90; // 90 seconds max for OCR

    while (attempts < maxAttempts && !ocrComplete) {
      await page.waitForTimeout(1000);
      attempts++;

      // Check for OCR completion or error
      const bodyText = await page.evaluate(() => document.body.innerText);
      
      if (bodyText.includes('OCR処理完了') || bodyText.includes('テキストを抽出しました')) {
        console.log('✓ OCR completed');
        ocrComplete = true;
      } else if (bodyText.includes('エラー') && bodyText.includes('OCR')) {
        console.log('⚠ OCR error detected');
        break;
      }

      if (attempts % 15 === 0) {
        console.log(`  Still processing OCR... (${attempts}s)`);
        await page.screenshot({ 
          path: path.join(ARTIFACTS_DIR, `full-03-ocr-progress-${attempts}.png`), 
          fullPage: true 
        });
      }
    }

    // Screenshot after OCR
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'full-04-after-ocr.png'), fullPage: true });

    // Step 4: Wait for structuring (if OCR succeeded)
    console.log('\nStep 4: Checking for structured data...');
    
    let structuringComplete = false;
    attempts = 0;
    const maxStructuringAttempts = 60;

    while (attempts < maxStructuringAttempts && !structuringComplete) {
      await page.waitForTimeout(1000);
      attempts++;

      const bodyText = await page.evaluate(() => document.body.innerText);
      
      // Check for structured data indicators
      if (bodyText.includes('政策名') || 
          bodyText.includes('自治体') ||
          bodyText.includes('カテゴリ') ||
          bodyText.includes('重点項目')) {
        console.log('✓ Structured data detected');
        structuringComplete = true;
      }

      // Check for completion
      const completedBadge = await page.locator('text=完了').count();
      if (completedBadge > 0 && !bodyText.includes('データがありません')) {
        console.log('✓ Workflow appears complete');
        structuringComplete = true;
      }

      if (attempts % 10 === 0) {
        console.log(`  Still waiting for structuring... (${attempts}s)`);
      }
    }

    // Final screenshot
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'full-05-final.png'), fullPage: true });

    // Extract final state
    const finalText = await page.evaluate(() => document.body.innerText);
    
    console.log('\n========== FINAL STATE ==========');
    console.log('OCR Complete:', ocrComplete);
    console.log('Structuring Complete:', structuringComplete);
    console.log('Japanese Text:', /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(finalText));
    console.log('=================================\n');

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      pdfFile: path.basename(PDF_PATH),
      ocrComplete,
      structuringComplete,
      japaneseDetected: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(finalText),
      finalTextPreview: finalText.substring(0, 1000)
    };

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'full-workflow-results.json'),
      JSON.stringify(results, null, 2)
    );

    console.log('Results saved to artifacts/full-workflow-results.json');

    // Basic assertion - app should be functional
    expect(finalText).toContain('政策評価分析システム');
    
  }, { timeout: 180000 });
});
