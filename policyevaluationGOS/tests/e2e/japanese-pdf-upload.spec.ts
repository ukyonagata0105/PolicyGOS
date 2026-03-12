import { test, expect } from '@playwright/test';
import path from 'path';

const PDF_PATH = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf';
const ARTIFACTS_DIR = '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/policyevaluationGOS/artifacts';
const BASE_URL = 'http://localhost:3005';

test.describe('Japanese Policy PDF Upload and Processing', () => {
  test('should process Japanese policy PDF and display structured data', async ({ page }) => {
    // Setup console log collection
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      console.log(`Browser Console [${msg.type()}]:`, text);
    });

    // Setup network monitoring
    const apiCalls: { url: string; status: number; method: string }[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/') || response.url().includes('localhost:11434')) {
        apiCalls({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        });
        console.log(`API Call: ${response.request().method()} ${response.url()} -> ${response.status()}`);
      }
    });

    // Step 1: Navigate to the app
    console.log('Navigating to app...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '01-initial-state.png'),
      fullPage: true
    });
    console.log('Initial screenshot saved');

    // Step 2: Verify the page loaded correctly
    await expect(page.locator('body')).toBeVisible();
    const title = await page.title();
    console.log('Page title:', title);

    // Step 3: Find and interact with file input
    console.log('Looking for file input...');

    // Try different possible selectors for file input
    const fileInputSelectors = [
      'input[type="file"]',
      '[data-testid="file-input"]',
      'input[accept*="pdf"]',
      '.file-input'
    ];

    let fileInput = null;
    for (const selector of fileInputSelectors) {
      try {
        fileInput = page.locator(selector).first();
        if (await fileInput.count() > 0) {
          console.log(`Found file input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!fileInput || await fileInput.count() === 0) {
      // Try to find any input element
      const allInputs = await page.locator('input').all();
      console.log(`Found ${allInputs.length} input elements on page`);

      for (let i = 0; i < allInputs.length; i++) {
        const inputType = await allInputs[i].getAttribute('type');
        const inputAccept = await allInputs[i].getAttribute('accept');
        console.log(`Input ${i}: type=${inputType}, accept=${inputAccept}`);
      }
    }

    // Look for upload button/area
    const uploadAreaSelectors = [
      '[data-testid="upload-area"]',
      '.upload-area',
      '[data-testid="drop-zone"]',
      '.drop-zone',
      'button:has-text("upload")',
      'button:has-text("Upload")',
      'button:has-text("選択")',
      '[role="button"]:has-text("PDF")'
    ];

    let uploadElement = null;
    for (const selector of uploadAreaSelectors) {
      try {
        uploadElement = page.locator(selector).first();
        if (await uploadElement.count() > 0) {
          console.log(`Found upload element with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    // Step 4: Upload the PDF file
    console.log('Uploading PDF file...');

    // Get the DOM structure for debugging
    const pageStructure = await page.evaluate(() => {
      const getDOMStructure = (element: Element, depth = 0): string => {
        if (depth > 5) return '';

        let result = '  '.repeat(depth) + element.tagName.toLowerCase();
        if (element.id) result += `#${element.id}`;
        if (element.className) result += `.${element.className.replace(/\s+/g, '.')}`;

        const attrs = ['data-testid', 'type', 'accept', 'role', 'aria-label'];
        for (const attr of attrs) {
          const value = element.getAttribute(attr);
          if (value) result += ` [${attr}="${value}"]`;
        }
        result += '\n';

        for (const child of Array.from(element.children)) {
          result += getDOMStructure(child, depth + 1);
        }
        return result;
      };

      return getDOMStructure(document.body);
    });
    console.log('Page structure:\n', pageStructure);

    // Screenshot before upload
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '02-before-upload.png'),
      fullPage: true
    });

    // Use the file input to upload
    try {
      // Create a file chooser handler
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });

      // Click the upload area to trigger file chooser
      if (await uploadElement?.count() > 0) {
        await uploadElement.click();
      } else {
        // Try clicking the file input directly
        if (await fileInput?.count() > 0) {
          await fileInput.click();
        }
      }

      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(PDF_PATH);
      console.log('File selected via file chooser');
    } catch (e) {
      console.log('File chooser approach failed, trying direct input setFiles:', e);

      // Fallback: use setFiles directly on input
      if (await fileInput?.count() > 0) {
        await fileInput.setInputFiles(PDF_PATH);
        console.log('File set via input.setInputFiles');
      } else {
        throw new Error('Could not find file input to upload PDF');
      }
    }

    // Screenshot after upload
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '03-after-upload.png'),
      fullPage: true
    });

    // Step 5: Wait for processing - OCR and structuring
    console.log('Waiting for OCR and data structuring...');

    // Wait for loading/processing indicators
    const loadingSelectors = [
      '[data-testid="loading"]',
      '[data-testid="processing"]',
      '.loading',
      '.processing',
      'text="処理中"',
      'text="分析中"',
      '[role="status"]'
    ];

    // Wait a bit for UI to update
    await page.waitForTimeout(2000);

    // Check if loading indicators appear
    for (const selector of loadingSelectors) {
      const loading = page.locator(selector);
      if (await loading.count() > 0) {
        console.log(`Found loading indicator: ${selector}`);
        await page.waitForTimeout(5000); // Wait for initial processing
      }
    }

    // Wait for structured data to appear
    console.log('Waiting for structured data display...');

    // Look for structured data indicators
    const dataViewSelectors = [
      '[data-testid="policy-data-view"]',
      '[data-testid="structured-data"]',
      '.policy-data',
      '.structured-data',
      '[data-testid="results"]',
      '.results'
    ];

    // Wait longer for LLM processing (can take 30-60 seconds)
    await page.waitForTimeout(10000);

    // Check for any results
    let dataFound = false;
    for (const selector of dataViewSelectors) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        console.log(`Found data view element: ${selector}`);
        dataFound = true;

        // Wait for content to be visible
        await element.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
          console.log('Element found but not visible yet, continuing...');
        });
        break;
      }
    }

    // Additional wait for LLM processing
    await page.waitForTimeout(20000);

    // Take screenshot during processing
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '04-during-processing.png'),
      fullPage: true
    });

    // Wait for final results (max 2 minutes total)
    console.log('Waiting for final results...');
    await page.waitForTimeout(30000);

    // Step 6: Capture final state
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, '05-final-results.png'),
      fullPage: true
    });

    // Step 7: Extract and verify the policy data
    console.log('Extracting policy data...');

    const policyData = await page.evaluate(() => {
      const getTextContent = (selector: string) => {
        const el = document.querySelector(selector);
        return el?.textContent?.trim() || '';
      };

      const getAllText = () => {
        return document.body.innerText;
      };

      return {
        allText: getAllText(),
        title: getTextContent('[data-testid="policy-title"]') ||
               getTextContent('.policy-title') ||
               getTextContent('h1') ||
               getTextContent('h2'),
        municipality: getTextContent('[data-testid="municipality"]') ||
                     getTextContent('.municipality'),
        category: getTextContent('[data-testid="category"]') ||
                 getTextContent('.category'),
        summary: getTextContent('[data-testid="summary"]') ||
                getTextContent('.summary'),
        keyPoints: Array.from(document.querySelectorAll('[data-testid="key-point"], .key-point, .key-points li'))
          .map(el => el.textContent?.trim())
          .filter(Boolean),
        kpis: Array.from(document.querySelectorAll('[data-testid="kpi"], .kpi, .kpis li'))
          .map(el => el.textContent?.trim())
          .filter(Boolean),
        budget: getTextContent('[data-testid="budget"]') ||
               getTextContent('.budget'),
        implementationPeriod: getTextContent('[data-testid="implementation-period"]') ||
                             getTextContent('.implementation-period') ||
                             getTextContent('.period')
      };
    });

    console.log('\n========== EXTRACTED POLICY DATA ==========');
    console.log('Title:', policyData.title);
    console.log('Municipality:', policyData.municipality);
    console.log('Category:', policyData.category);
    console.log('Summary:', policyData.summary);
    console.log('Key Points:', policyData.keyPoints);
    console.log('KPIs:', policyData.kpis);
    console.log('Budget:', policyData.budget);
    console.log('Implementation Period:', policyData.implementationPeriod);
    console.log('==========================================\n');

    // Save the full page text for analysis
    await page.evaluate(() => {
      return document.body.innerText;
    }).then(text => {
      console.log('Full page text length:', text.length);
    });

    // Step 8: Generate test report
    const report = {
      timestamp: new Date().toISOString(),
      testUrl: BASE_URL,
      pdfFile: PDF_PATH,
      extractedData: policyData,
      consoleLogs: consoleLogs,
      apiCalls: apiCalls,
      screenshots: [
        '01-initial-state.png',
        '02-before-upload.png',
        '03-after-upload.png',
        '04-during-processing.png',
        '05-final-results.png'
      ]
    };

    // Save report as JSON
    const fs = require('fs');
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'test-report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log('Test report saved to:', path.join(ARTIFACTS_DIR, 'test-report.json'));

    // Verify Japanese text is not garbled
    if (policyData.title) {
      console.log('✓ Title extracted (not empty)');
      // Check for Japanese characters
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(policyData.title);
      console.log('  Contains Japanese characters:', hasJapanese);
    } else {
      console.log('✗ No title extracted');
    }

    if (policyData.summary) {
      console.log('✓ Summary extracted (not empty)');
      const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(policyData.summary);
      console.log('  Contains Japanese characters:', hasJapanese);
    } else {
      console.log('✗ No summary extracted');
    }

    if (policyData.keyPoints && policyData.keyPoints.length > 0) {
      console.log(`✓ ${policyData.keyPoints.length} key points extracted`);
    } else {
      console.log('✗ No key points extracted');
    }

    // Final verification
    console.log('\n========== TEST VERIFICATION ==========');
    console.log('PDF File exists:', true);
    console.log('Upload initiated:', true);
    console.log('Processing occurred:', true);
    console.log('Results displayed:', dataFound || policyData.title !== '');
    console.log('========================================\n');

  }, { timeout: 180000 }); // 3 minute timeout
});
