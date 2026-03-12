import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const PDF_PATH =
  process.env.REAL_PDF_PATH ||
  '/Volumes/UNTITLED/Obsidian/Projects/policyevgos/R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf';
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ARTIFACTS_DIR =
  process.env.E2E_ARTIFACTS_DIR ||
  path.resolve(process.cwd(), 'artifacts');

test.describe('Policy Generative Workspace - Real PDF', () => {
  test('shows a prompt-first landing shell before any real-PDF processing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('政策PDFを、静かな説明面へ。');
    await expect(page.getByRole('heading', { name: '質問から briefing を始める', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('知りたいことや作りたい briefing を書いてください。')).toBeVisible();
    await expect(page.getByRole('button', { name: 'PDFを選択', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '参考PDFを添付', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Briefing preview', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '抽出確認は必要なときだけ開く', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '出典と収集導線をあとから辿れるように保つ', exact: true })).toBeVisible();
    await expect(page.getByText('Briefing preview はまだありません')).toBeVisible();
    await expect(page.getByTestId('briefing-preview-shell')).toBeVisible();
    await expect(page.getByTestId('generated-runtime-version')).toHaveText('v1');
    await expect(page.getByRole('heading', { name: '読み込み状況', exact: true })).toHaveCount(0);
    await expect(page.getByText('Prompt flow', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Source discovery', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Project Explorer', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Debug trace', exact: true })).toHaveCount(0);
  });

  test('keeps prompt-led direct briefings briefing-first while preserving source discovery access', async ({ page }) => {
    await page.addInitScript((apiKey) => {
      window.localStorage.setItem('policyevgos.geminiApiKey', apiKey);
    }, GEMINI_API_KEY || 'test-key');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('知りたいことや作りたい briefing を書いてください。').fill('地域交通の争点を住民向けに説明して');
    await page.getByRole('button', { name: '新規で生成' }).click();

    await expect(page.getByText('Briefing を更新しました:')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: '質問から briefing を始める', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '出典と収集導線をあとから辿れるように保つ', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '抽出確認は必要なときだけ開く', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '読み込み状況', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Review Workspace', exact: true })).toHaveCount(0);
    await expect(page.getByText('Prompt flow', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Project Explorer', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Debug trace', exact: true })).toHaveCount(0);

    await page.locator('summary').filter({ hasText: '出典と収集導線をあとから辿れるように保つ' }).click();
    await expect(page.getByText('Prompt flow', { exact: true })).toBeVisible();
    await expect(page.getByText('Source discovery', { exact: true })).toBeVisible();
    await expect(page.getByText('Source rows: 4')).toBeVisible();
    await expect(page.getByText('Provenance refs: 2')).toBeVisible();

    await page.locator('summary').filter({ hasText: '抽出確認は必要なときだけ開く' }).click();
    await expect(page.getByRole('heading', { name: 'Review Workspace', exact: true })).toBeVisible();
  });

  test('attaches a real policy PDF inline with the composer and renders the generated UI through fast path', async ({ page }) => {
    test.skip(!GEMINI_API_KEY, 'Gemini API key is required for the real-PDF end-to-end flow.');

    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    const pdfName = path.basename(PDF_PATH);

    await page.addInitScript((apiKey) => {
      window.localStorage.setItem('policyevgos.geminiApiKey', apiKey);
    }, GEMINI_API_KEY);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('政策PDFを、静かな説明面へ。');
    await expect(page.getByRole('heading', { name: '質問から briefing を始める', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PDFを選択', exact: true })).toBeVisible();
    await expect(page.getByText('Briefing preview はまだありません')).toBeVisible();
    await safeCapture(page, path.join(ARTIFACTS_DIR, 'workspace-real-01-initial.png'));

    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByRole('article').getByText(pdfName, { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('article').getByText('処理中', { exact: true })).toHaveCount(0, { timeout: 180000 });
    await page.getByPlaceholder('知りたいことや作りたい briefing を書いてください。').fill('添付した政策PDFの要点を住民向け briefing にして');
    await expect(page.getByRole('button', { name: '新規で生成' })).toBeEnabled({ timeout: 180000 });
    await page.getByRole('button', { name: '新規で生成' }).click();

    await safeCapture(page, path.join(ARTIFACTS_DIR, 'workspace-real-02-uploaded.png'));

    await expect(page.getByText('Briefing を更新しました:')).toBeVisible({ timeout: 180000 });
    await expect(page.getByRole('heading', { name: '読み込み状況', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Project Explorer', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Debug trace', exact: true })).toHaveCount(0);

    const runtimeVersion = await page.getByTestId('generated-runtime-version').innerText();
    expect(['v1', 'v2', 'html']).toContain(runtimeVersion);
    await expect(page.getByRole('heading', { name: '出典と収集導線をあとから辿れるように保つ', exact: true })).toBeVisible({ timeout: 120000 });
    await expect(page.getByRole('heading', { name: '抽出確認は必要なときだけ開く', exact: true })).toBeVisible();

    await safeCapture(page, path.join(ARTIFACTS_DIR, 'workspace-real-03-generated-ui.png'));

    await page.locator('summary').filter({ hasText: '出典と収集導線をあとから辿れるように保つ' }).click();
    const provenanceInspector = page.getByRole('group').filter({ hasText: '出典と収集導線をあとから辿れるように保つ' });
    await expect(provenanceInspector.getByText('Prompt flow', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(provenanceInspector.getByText('Surface: prompt-led', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(provenanceInspector.getByText(/Source rows: \d+/)).toBeVisible({ timeout: 30000 });
    await expect(provenanceInspector.getByText(/Provenance refs: \d+/)).toBeVisible({ timeout: 30000 });

    await page.locator('summary').filter({ hasText: '抽出確認は必要なときだけ開く' }).click();
    await page.getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('button', { name: 'Project Explorer', exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Debug trace', exact: true }).click();
    await expect(page.getByText('Parsed tables', { exact: true }).first()).toBeVisible({ timeout: 30000 });
    await safeCapture(page, path.join(ARTIFACTS_DIR, 'workspace-real-04-debugger-open.png'));

    const parsedTableCards = await page.locator('table').count();
    const bodyText = await page.locator('body').innerText();

    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'workspace-real-results.json'),
      JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            pdfName,
            routingPathDetected: bodyText.includes('path: pdf_text_fast_path'),
            documentTypeDetected: bodyText.includes('type: digital_text_pdf'),
            runtimeVersion,
            plannerFallbackReason: await page.getByTestId('planner-fallback-reason').count()
              ? await page.getByTestId('planner-fallback-reason').innerText()
              : null,
            generatedUiVisible:
              bodyText.includes('生成ランタイム v2') ||
              bodyText.includes('Generated briefing') ||
              bodyText.includes('HTML runtime'),
            reviewWorkspaceVisible: bodyText.includes('Review Workspace'),
            projectExplorerTabVisible: bodyText.includes('Project Explorer'),
            structuredPolicyTabVisible: bodyText.includes('Structured policy'),
            projectExplorerVisible: bodyText.includes('事業一覧') || bodyText.includes('審議対象の事業一覧'),
            parsedTableCards,
          },
          null,
        2
      )
    );

    expect(parsedTableCards).toBeGreaterThan(0);
    expect(['v1', 'v2', 'html']).toContain(runtimeVersion);
  });
});

async function safeCapture(page: Page, outputPath: string) {
  try {
    await page.screenshot({
      path: outputPath,
      fullPage: false,
    });
  } catch (error) {
    console.warn(`Skipping screenshot ${outputPath}:`, error);
  }
}
