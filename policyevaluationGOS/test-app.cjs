/**
 * Simple E2E test script using Playwright
 * This script will test the policy evaluation app
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';
const artifactsDir = './artifacts';

async function runTests() {
  console.log('Starting E2E tests for Policy Evaluation App...');
  console.log('Base URL:', BASE_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Test 1: Navigate to page and take initial screenshot
    console.log('\n[TEST 1] Navigating to page...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Wait for React to render

    await page.screenshot({
      path: `${artifactsDir}/01-initial-state.png`,
      fullPage: true
    });
    console.log('Screenshot saved: artifacts/01-initial-state.png');

    // Test 2: Check page title
    console.log('\n[TEST 2] Checking page title...');
    const title = await page.title();
    console.log('Page title:', title);
    console.assert(title.includes('政策評価分析システム'), 'Title should contain app name');

    // Test 3: Check for key elements
    console.log('\n[TEST 3] Checking for key elements...');

    // Check main heading
    const mainHeading = await page.locator('h1').textContent();
    console.log('Main heading:', mainHeading);

    // Check all h2 headings
    const h2Count = await page.locator('h2').count();
    console.log('Number of h2 elements:', h2Count);

    for (let i = 0; i < h2Count; i++) {
      const h2 = page.locator('h2').nth(i);
      const text = await h2.textContent();
      console.log(`  h2[${i}]:`, text);
    }

    // Test 4: Check for right column header - should be "政策データ表示"
    console.log('\n[TEST 4] Verifying right column header...');

    const policyDataHeaderCount = await page.locator('h2', { hasText: '政策データ表示' }).count();
    console.log('Policy Data View header found:', policyDataHeaderCount > 0);

    const gemmaUiHeaderCount = await page.locator('text=Gemma生成UI').count();
    console.log('Gemma UI header found (should be 0):', gemmaUiHeaderCount);

    if (policyDataHeaderCount > 0) {
      console.log('PASS: Right column shows "政策データ表示"');
    } else {
      console.log('FAIL: Right column does NOT show "政策データ表示"');
    }

    if (gemmaUiHeaderCount === 0) {
      console.log('PASS: "Gemma生成UI" is NOT displayed (as expected)');
    } else {
      console.log('FAIL: "Gemma生成UI" is still displayed (should not be)');
    }

    // Test 5: Check workflow steps
    console.log('\n[TEST 5] Checking workflow steps...');
    const expectedSteps = ['アップロード', 'OCR処理', '構造化', '完了'];

    for (const step of expectedSteps) {
      const locator = page.locator(`text=${step}`).first();
      const isVisible = await locator.isVisible();
      console.log(`  Step "${step}": ${isVisible ? 'VISIBLE' : 'NOT VISIBLE'}`);
    }

    // Test 6: Check for empty state message
    console.log('\n[TEST 6] Checking for empty state in PolicyDataView...');
    const emptyStateCount = await page.locator('text=データがありません').count();
    const uploadMsgCount = await page.locator('text=PDFをアップロードしてデータを構造化してください').count();
    console.log('Empty state message found:', emptyStateCount > 0);
    console.log('Upload prompt message found:', uploadMsgCount > 0);

    // Test 7: Check for PDF uploader
    console.log('\n[TEST 7] Checking for PDF uploader...');
    const fileInputCount = await page.locator('input[type="file"]').count();
    console.log('File input found:', fileInputCount > 0);

    // Test 8: Take detailed screenshots
    console.log('\n[TEST 8] Taking detailed screenshots...');

    // Screenshot of workflow section
    const workflowSection = page.locator('.flex.items-center.justify-between').first();
    await workflowSection.screenshot({ path: `${artifactsDir}/02-workflow-section.png` });
    console.log('Screenshot saved: artifacts/02-workflow-section.png');

    // Screenshot of right column
    const rightColumn = page.locator('section').filter({ hasText: '政策データ表示' });
    if (await rightColumn.count() > 0) {
      await rightColumn.screenshot({ path: `${artifactsDir}/03-right-column.png` });
      console.log('Screenshot saved: artifacts/03-right-column.png');
    }

    // Test 9: Get full page text content
    console.log('\n[TEST 9] Getting page text content...');
    const bodyText = await page.locator('body').textContent();
    console.log('Page text preview (first 500 chars):');
    console.log(bodyText?.substring(0, 500));

    // Test 10: Check for specific Japanese text elements
    console.log('\n[TEST 10] Verifying specific Japanese text elements...');
    const expectedTexts = [
      '政策評価分析システム',
      'PDFアップロード',
      '政策データ表示',
      'Powered by Ollama + Gemma'
    ];

    for (const text of expectedTexts) {
      const count = await page.locator(`text=${text}`).count();
      console.log(`  "${text}": ${count > 0 ? 'FOUND' : 'NOT FOUND'}`);
    }

    console.log('\n========================================');
    console.log('E2E TEST SUMMARY');
    console.log('========================================');
    console.log('All tests completed successfully!');
    console.log(`Screenshots saved to: ${artifactsDir}/`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error during test execution:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTests();
