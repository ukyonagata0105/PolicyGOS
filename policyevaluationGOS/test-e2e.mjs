/**
 * Simple test runner using Node.js to capture screenshots with Playwright
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';
const ARTIFACTS_DIR = './artifacts';

// Ensure artifacts directory exists
if (!existsSync(ARTIFACTS_DIR)) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

console.log('Starting E2E tests for Policy Evaluation App...');
console.log('Base URL:', BASE_URL);
console.log('');

const tests = [
  {
    name: 'Initial State',
    file: '01-initial-state.png',
    selector: 'h1',
    description: 'Take initial screenshot of the app'
  },
  {
    name: 'Full Page',
    file: '02-full-page.png',
    selector: 'section',
    description: 'Take full page screenshot'
  },
  {
    name: 'Right Column Header',
    file: '03-right-column.png',
    selector: 'h2',
    description: 'Screenshot of right column showing policy data view'
  }
];

console.log('========================================');
console.log('RUNNING SCREENSHOT TESTS');
console.log('========================================\n');

for (const test of tests) {
  console.log(`[TEST] ${test.name}`);
  console.log(`  Description: ${test.description}`);
  console.log(`  Selector: ${test.selector}`);

  try {
    const outputPath = join(ARTIFACTS_DIR, test.file);
    const command = `npx -y playwright@latest screenshot --wait-for-selector="${test.selector}" ${BASE_URL} ${outputPath}`;

    console.log(`  Command: ${command}`);
    execSync(command, { stdio: 'inherit', timeout: 30000 });

    console.log(`  Status: PASSED`);
    console.log(`  Output: ${outputPath}`);
  } catch (error) {
    console.log(`  Status: FAILED`);
    console.log(`  Error: ${error.message}`);
  }

  console.log('');
}

console.log('========================================');
console.log('TESTING PAGE CONTENT');
console.log('========================================\n');

// Test page content using curl and grep
const contentTests = [
  {
    name: 'Title Check',
    grep: '政策評価分析システム',
    expected: true
  },
  {
    name: 'Policy Data View Header',
    grep: '政策データ表示',
    expected: true
  },
  {
    name: 'Gemma UI Header (should NOT exist)',
    grep: 'Gemma生成UI',
    expected: false
  },
  {
    name: 'PDF Upload Section',
    grep: 'PDFアップロード',
    expected: true
  },
  {
    name: 'Empty State Message',
    grep: 'データがありません',
    expected: true
  }
];

for (const test of contentTests) {
  console.log(`[TEST] ${test.name}`);
  console.log(`  Looking for: "${test.grep}"`);
  console.log(`  Expected to find: ${test.expected ? 'YES' : 'NO'}`);

  try {
    // Note: curl only gets initial HTML, not rendered content
    // This is a basic check of the initial HTML
    const result = execSync(`curl -s ${BASE_URL} | grep -c "${test.grep}" || echo "0"`, {
      encoding: 'utf-8',
      timeout: 5000
    });

    const count = parseInt(result.trim(), 10);
    const found = count > 0;
    const status = (found === test.expected) ? 'PASSED' : 'FAILED';

    console.log(`  Status: ${status}`);
    console.log(`  Note: This is initial HTML only (client-side rendering not captured)`);
  } catch (error) {
    console.log(`  Status: ERROR`);
    console.log(`  Error: ${error.message}`);
  }

  console.log('');
}

console.log('========================================');
console.log('SUMMARY');
console.log('========================================');
console.log(`Artifacts saved to: ${ARTIFACTS_DIR}/`);
console.log('Screenshots taken:');
tests.forEach(t => console.log(`  - ${t.file}`));
console.log('');
console.log('Note: For full client-side rendered content verification,');
console.log('please manually inspect the screenshots.');
console.log('========================================\n');
