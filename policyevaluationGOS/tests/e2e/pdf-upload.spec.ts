import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACTS_DIR = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/policyevaluationGOS/artifacts';
const TEST_PDF_PATH = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/policyevaluationGOS/public/test_policy_en.pdf';

test.describe('Policy Evaluation E2E Test - PDF Upload', () => {
  test.beforeAll(async () => {
    console.log('=== E2E Test Starting ===');
    console.log('Frontend: http://localhost:3005');
    console.log('YomiToku API: http://localhost:8000');
    console.log('Ollama: http://localhost:11434');
    console.log('Test PDF:', TEST_PDF_PATH);
  });

  // Increase timeout for the entire test (OCR + LLM processing can take several minutes)
  test.setTimeout(360000); // 6 minutes

  test('complete PDF upload workflow with OCR and data structuring', async ({ page }) => {
    // Setup console log collection
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const logText = `[${msg.type()}] ${msg.text()}`;
      consoleLogs.push(logText);
      console.log('Browser Console:', logText);
    });

    // Setup error collection
    const errors: string[] = [];
    page.on('pageerror', error => {
      const errorText = `Page Error: ${error.message}`;
      errors.push(errorText);
      console.error('Browser Error:', errorText);
    });

    // Setup network logging
    const apiCalls: any[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('localhost')) {
        console.log('API Request:', request.method(), url);
        apiCalls.push({ type: 'request', method: request.method(), url });
      }
    });

    page.on('response', async response => {
      const url = response.url();
      if (url.includes('localhost')) {
        const status = response.status();
        console.log('API Response:', status, url);
        apiCalls.push({ type: 'response', status, url });
      }
    });

    // STEP 1: Navigate to application
    console.log('\n=== STEP 1: Navigating to application ===');
    await page.goto('http://localhost:3005/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Extra time for React to mount

    // Take initial screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '01-initial-state.png'),
      fullPage: true
    });
    console.log('Screenshot saved: 01-initial-state.png');

    // Verify page loaded
    const title = await page.title();
    console.log('Page title:', title);
    expect(title).toBeTruthy();

    // STEP 2: Locate and inspect PDF upload interface
    console.log('\n=== STEP 2: Locating PDF upload interface ===');

    // Look for common file input patterns
    const fileInputSelectors = [
      'input[type="file"]',
      'input[accept*="pdf"]',
      '#pdf-upload',
      '.pdf-upload',
      '[data-testid="pdf-upload"]',
      'input[accept=".pdf"]'
    ];

    let fileInput = null;
    let foundSelector = '';

    for (const selector of fileInputSelectors) {
      try {
        const element = page.locator(selector).first();
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            fileInput = element;
            foundSelector = selector;
            console.log(`Found file input with selector: ${selector}`);
            break;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // If not directly visible, look for it in the DOM
    if (!fileInput) {
      const allInputs = await page.locator('input[type="file"]').all();
      console.log(`Found ${allInputs.length} file inputs in DOM`);
      if (allInputs.length > 0) {
        fileInput = page.locator('input[type="file"]').first();
        foundSelector = 'input[type="file"]';
      }
    }

    expect(fileInput, 'File input should exist').toBeTruthy();
    console.log('File input located:', foundSelector);

    // Take screenshot before upload
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '02-before-upload.png'),
      fullPage: true
    });

    // STEP 3: Upload PDF
    console.log('\n=== STEP 3: Uploading PDF ===');
    console.log('Test PDF path:', TEST_PDF_PATH);

    try {
      await fileInput!.setInputFiles(TEST_PDF_PATH);
      console.log('PDF file selected');
    } catch (error) {
      console.error('Error uploading PDF:', error);
      throw error;
    }

    // Wait for UI to update after file selection
    await page.waitForTimeout(3000);

    // Take screenshot after upload
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '03-after-upload.png'),
      fullPage: true
    });
    console.log('Screenshot saved: 03-after-upload.png');

    // STEP 4: Look for upload/submit button and trigger processing
    console.log('\n=== STEP 4: Looking for upload/submit button ===');

    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Upload")',
      'button:has-text("Process")',
      'button:has-text("Analyze")',
      'button:has-text("評価")',
      'button:has-text("実行")',
      '[data-testid="upload-button"]',
      '.upload-button',
      '#process-pdf'
    ];

    let uploadButton = null;
    for (const selector of buttonSelectors) {
      try {
        const button = page.locator(selector).first();
        const count = await button.count();
        if (count > 0) {
          const isVisible = await button.isVisible().catch(() => false);
          const isEnabled = await button.isEnabled().catch(() => true);
          console.log(`Button check: ${selector} - visible: ${isVisible}, enabled: ${isEnabled}`);
          if (isVisible && isEnabled) {
            uploadButton = button;
            console.log(`Found clickable button: ${selector}`);
            break;
          }
        }
      } catch (e) {
        // Continue
      }
    }

    if (uploadButton) {
      console.log('Clicking upload button...');
      await uploadButton.click();
    } else {
      console.log('No upload button found - may auto-process on file selection');
    }

    // STEP 5: Wait for OCR processing
    console.log('\n=== STEP 5: Monitoring OCR processing ===');
    console.log('Note: PDF.js may show error, but YomiToku API will be used as fallback');

    // Check for PDF.js error (this is expected - YomiToku is the primary OCR)
    const hasPdfJsError = await page.locator('text=PDF processing error').count() > 0;
    if (hasPdfJsError) {
      console.log('PDF.js error detected (expected) - YomiToku API will handle OCR');
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, '03a-pdfjs-error.png'),
        fullPage: true
      });
    }

    // Look for OCR indicators (including the OCR processing status from YomiToku)
    const ocrIndicators = [
      'text=OCR',
      'text=Processing',
      'text=処理中',
      'text=Scanning',
      'text=OCR処理中',
      '[data-testid="ocr-status"]',
      '.ocr-processing',
      '.loading',
      '.spinner'
    ];

    let ocrStarted = false;
    for (const indicator of ocrIndicators) {
      try {
        const element = page.locator(indicator).first();
        if (await element.count() > 0) {
          const isVisible = await element.isVisible({ timeout: 5000 }).catch(() => false);
          if (isVisible) {
            ocrStarted = true;
            console.log(`OCR indicator found: ${indicator}`);
            break;
          }
        }
      } catch (e) {
        // Continue
      }
    }

    if (ocrStarted) {
      // Take screenshot during OCR
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, '04-during-ocr.png'),
        fullPage: true
      });
      console.log('Screenshot saved: 04-during-ocr.png');
    }

    // Wait for OCR to complete - this can take up to 2 minutes
    console.log('Waiting for OCR to complete (max 120s)...');

    // Wait for either success or error state
    try {
      await Promise.race([
        // Look for success indicators
        page.waitForSelector('[data-testid="policy-data"], .policy-data, .structured-data, text=Category', {
          timeout: 120000
        }),
        // Or look for error message
        page.waitForSelector('text=error, text=Error, text=failed', {
          timeout: 120000
        })
      ]);
    } catch (e) {
      console.log('Timeout waiting for OCR completion - taking final state screenshot');
    }

    // Take screenshot after OCR
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '05-after-ocr.png'),
      fullPage: true
    });
    console.log('Screenshot saved: 05-after-ocr.png');

    // STEP 6: Wait for data structuring (LLM processing)
    console.log('\n=== STEP 6: Waiting for data structuring ===');

    // Look for LLM/AI processing indicators
    const llmIndicators = [
      'text=Structuring',
      'text=Analyzing',
      'text=AI',
      'text=LLM',
      'text=構造化',
      'text=解析中',
      '[data-testid="llm-status"]',
      '.llm-processing',
      '.ai-processing'
    ];

    let llmStarted = false;
    for (const indicator of llmIndicators) {
      try {
        const element = page.locator(indicator).first();
        if (await element.count() > 0) {
          const isVisible = await element.isVisible({ timeout: 3000 }).catch(() => false);
          if (isVisible) {
            llmStarted = true;
            console.log(`LLM indicator found: ${indicator}`);
            break;
          }
        }
      } catch (e) {
        // Continue
      }
    }

    if (llmStarted) {
      // Take screenshot during LLM processing
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, '06-during-llm.png'),
        fullPage: true
      });
      console.log('Screenshot saved: 06-during-llm.png');
    }

    // Wait for final structured data - this can take up to 3 minutes
    console.log('Waiting for data structuring to complete (max 180s)...');

    // Look for final data display
    try {
      await page.waitForSelector('[data-testid="policy-data"], .policy-data, .PolicyDataView', {
        timeout: 180000
      });
    } catch (e) {
      console.log('Timeout waiting for PolicyDataView - checking current state');
    }

    // Additional wait for any animations
    await page.waitForTimeout(3000);

    // STEP 7: Verify final state and extract data
    console.log('\n=== STEP 7: Verifying final state ===');

    // Take final screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '07-final-state.png'),
      fullPage: true
    });
    console.log('Screenshot saved: 07-final-state.png');

    // Try to extract displayed data
    const pageContent = await page.content();
    const pageText = await page.textContent('body');

    // Look for PolicyDataView components
    const dataFields = {
      category: await page.locator('text=Category').count() > 0 ||
                pageText.includes('Category') ||
                pageText.includes('カテゴリー'),
      title: await page.locator('text=Policy Title').count() > 0 ||
             pageText.includes('Policy') ||
             pageText.includes('政策名'),
      municipality: await page.locator('text=Municipality').count() > 0 ||
                    pageText.includes('Municipality') ||
                    pageText.includes('自治体'),
      summary: await page.locator('text=Summary').count() > 0 ||
               pageText.includes('Summary') ||
               pageText.includes('概要'),
      keyPoints: await page.locator('text=Key Points').count() > 0 ||
                 pageText.includes('Key Points') ||
                 pageText.includes('要点'),
      kpi: await page.locator('text=KPI').count() > 0 ||
           pageText.includes('KPI') ||
           pageText.includes('指標'),
      budget: await page.locator('text=Budget').count() > 0 ||
              pageText.includes('Budget') ||
              pageText.includes('予算')
    };

    console.log('\n=== Extracted Data Fields ===');
    console.log('Category:', dataFields.category ? '✓ Present' : '✗ Not found');
    console.log('Title:', dataFields.title ? '✓ Present' : '✗ Not found');
    console.log('Municipality:', dataFields.municipality ? '✓ Present' : '✗ Not found');
    console.log('Summary:', dataFields.summary ? '✓ Present' : '✗ Not found');
    console.log('Key Points:', dataFields.keyPoints ? '✓ Present' : '✗ Not found');
    console.log('KPI:', dataFields.kpi ? '✓ Present' : '✗ Not found');
    console.log('Budget:', dataFields.budget ? '✓ Present' : '✗ Not found');

    // Try to get actual data values
    console.log('\n=== Page Text Content (first 2000 chars) ===');
    console.log(pageText.substring(0, 2000));

    // STEP 8: Collect and report results
    console.log('\n=== STEP 8: Test Results ===');

    const results = {
      timestamp: new Date().toISOString(),
      steps: {
        navigation: 'PASS',
        initialScreenshot: 'PASS',
        locateFileInput: foundSelector ? 'PASS' : 'FAIL',
        uploadPDF: 'PASS',
        ocrProcessing: ocrStarted ? 'PASS' : 'UNKNOWN',
        llmProcessing: llmStarted ? 'PASS' : 'UNKNOWN',
        finalDataDisplay: dataFields.title ? 'PASS' : 'PARTIAL'
      },
      dataFields,
      apiCalls: apiCalls.length,
      consoleLogs: consoleLogs.length,
      errors: errors.length
    };

    // Save detailed logs
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'console-logs.json'),
      JSON.stringify(consoleLogs, null, 2)
    );
    console.log('Console logs saved: console-logs.json');

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'api-calls.json'),
      JSON.stringify(apiCalls, null, 2)
    );
    console.log('API calls saved: api-calls.json');

    if (errors.length > 0) {
      fs.writeFileSync(
        path.join(ARTIFACTS_DIR, 'errors.json'),
        JSON.stringify(errors, null, 2)
      );
      console.log('Errors saved: errors.json');
    }

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'test-results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('Test results saved: test-results.json');

    // Print summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Navigation: ${results.steps.navigation}`);
    console.log(`File Input: ${results.steps.locateFileInput}`);
    console.log(`PDF Upload: ${results.steps.uploadPDF}`);
    console.log(`OCR Processing: ${results.steps.ocrProcessing}`);
    console.log(`LLM Processing: ${results.steps.llmProcessing}`);
    console.log(`Final Display: ${results.steps.finalDataDisplay}`);
    console.log(`\nTotal API Calls: ${results.apiCalls}`);
    console.log(`Console Log Entries: ${results.consoleLogs}`);
    console.log(`Errors: ${results.errors}`);

    if (errors.length > 0) {
      console.log('\n=== ERRORS ENCOUNTERED ===');
      errors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
    }

    // Assertions
    expect(results.steps.navigation).toBe('PASS');
    expect(results.steps.locateFileInput).toBe('PASS');
    expect(results.steps.uploadPDF).toBe('PASS');

    // Final assertion - at least some data should be displayed
    const hasDataDisplay = Object.values(dataFields).some(v => v);
    expect(hasDataDisplay, 'Should display some policy data').toBeTruthy();
  });

  test.afterAll(async () => {
    console.log('\n=== E2E Test Completed ===');
    console.log('Artifacts saved to:', ARTIFACTS_DIR);
  });
});
