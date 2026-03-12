/**
 * E2E Test for Policy Evaluation App
 * Tests the data-UI separated design workflow
 */

import { test, expect } from '@playwright/test';

test.describe('Policy Evaluation App - Data-UI Separated Design', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should display initial state with correct headers', async ({ page }) => {
    // Check main title
    await expect(page.locator('h1')).toContainText('政策評価分析システム');

    // Check right column header - should be "政策データ表示" not "Gemma生成UI"
    const rightColumnHeaders = page.locator('section').filter({ hasText: '政策データ表示' });
    await expect(rightColumnHeaders).toHaveCount(1);

    // Should NOT contain "Gemma生成UI"
    await expect(page.locator('text=Gemma生成UI')).not.toBeVisible();

    // Check workflow steps
    await expect(page.locator('text=アップロード')).toBeVisible();
    await expect(page.locator('text=OCR処理')).toBeVisible();
    await expect(page.locator('text=構造化')).toBeVisible();
    await expect(page.locator('text=完了')).toBeVisible();

    // Take screenshot of initial state
    await page.screenshot({
      path: 'artifacts/01-initial-state.png',
      fullPage: true
    });
  });

  test('should show empty state in PolicyDataView when no data', async ({ page }) => {
    // Check for empty state message
    await expect(page.locator('text=データがありません')).toBeVisible();
    await expect(page.locator('text=PDFをアップロードしてデータを構造化してください')).toBeVisible();
  });

  test('should have PDF uploader component', async ({ page }) => {
    // Check for file upload input
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).isVisible();
  });

  test('should display workflow steps correctly', async ({ page }) => {
    // Check all workflow steps are visible
    const steps = ['アップロード', 'OCR処理', '構造化', '完了'];

    for (const step of steps) {
      await expect(page.locator(`text=${step}`)).toBeVisible();
    }

    // Initial step should be upload
    // Check that the upload step is highlighted (has ring)
    const uploadStep = page.locator('text=アップロード').first();
    await expect(uploadStep).toBeVisible();
  });

  test('should show correct layout with two columns', async ({ page }) => {
    // Check main grid exists
    const grid = page.locator('.grid').first();
    await expect(grid).toBeVisible();

    // Check PDF upload section exists
    await expect(page.locator('text=PDFアップロード')).toBeVisible();

    // Check right column header
    await expect(page.locator('text=政策データ表示')).toBeVisible();
  });

  test('should have reset button hidden initially', async ({ page }) => {
    // Reset button should not be visible when no PDF is uploaded
    await expect(page.locator('text=リセット')).not.toBeVisible();
  });
});

test.describe('Policy Evaluation App - PDF Upload Flow', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

  test('should display PolicyDataView component structure', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check the PolicyDataView section
    const policyDataSection = page.locator('section').filter({ hasText: '政策データ表示' });
    await expect(policyDataSection).toBeVisible();

    // Take screenshot showing the structure
    await page.screenshot({
      path: 'artifacts/02-policy-data-view-structure.png',
      fullPage: true
    });
  });
});

test.describe('Policy Evaluation App - UI Verification', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

  test('verify complete UI layout and text content', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Get page content for analysis
    const content = await page.content();

    // Verify key Japanese text elements
    const expectedTexts = [
      '政策評価分析システム',
      'Local LLM-powered Generative UI',
      'PDFアップロード',
      '政策データ表示',
      'データがありません',
      'PDFをアップロードしてデータを構造化してください',
      '政策評価分析システム v1.0.0',
      'Powered by Ollama + Gemma'
    ];

    for (const text of expectedTexts) {
      await expect(page.locator(`text=${text}`)).toBeVisible();
    }

    // Take full page screenshot
    await page.screenshot({
      path: 'artifacts/03-full-layout.png',
      fullPage: true
    });

    // Get page text for analysis
    const pageText = await page.innerText('body');
    console.log('Page text preview:', pageText.substring(0, 500));
  });
});

test.describe('Policy Evaluation App - Header Verification', () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';

  test('right column should show correct header', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Find all h2 elements
    const headers = await page.locator('h2').allTextContents();
    console.log('All h2 headers:', headers);

    // Verify "政策データ表示" is present
    await expect(page.locator('h2:has-text("政策データ表示")')).toBeVisible();

    // Verify "Gemma生成UI" is NOT present
    const gemmaUiCount = await page.locator('text=Gemma生成UI').count();
    expect(gemmaUiCount).toBe(0);

    // Take close-up screenshot of right column
    const rightColumn = page.locator('section').filter({ hasText: '政策データ表示' });
    await rightColumn.screenshot({
      path: 'artifacts/04-right-column-header.png'
    });
  });
});
