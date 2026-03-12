import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3012';
const webServerURL = new URL(baseURL);
const webServerPort = webServerURL.port || '3012';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/workspace-real-pdf.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  timeout: 180000, // 3 minute global timeout for LLM processing
  webServer: {
    command: `npm run dev -- --host ${webServerURL.hostname} --port ${webServerPort}`,
    url: webServerURL.origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
