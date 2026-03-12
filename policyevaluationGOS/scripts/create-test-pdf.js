/**
 * Create a test PDF with Japanese text content
 * This is a simple PDF with actual Japanese policy document content
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const text = `Tokyo Metropolitan Environmental Policy Basic Plan

Category: Environmental Policy
Municipality: Tokyo Metropolis

Summary:
This policy establishes basic guidelines for environmental protection
and sustainable urban development in Tokyo.

Key Points:
1. Greenhouse gas reduction target: 30% reduction by 2030
2. Promotion of renewable energy adoption
3. Development of green infrastructure

KPI Indicators:
- CO2 emissions: FY2025 target 10 million tons
- Renewable energy ratio: FY2030 target 50%

Budget: 10 billion yen
Implementation period: FY2025 - FY2030`;

  page.drawText(text, {
    x: 50,
    y: 750,
    size: 12,
    font: font,
    color: rgb(0, 0, 0),
    lineHeight: 18,
  });

  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);

  const outputPath = path.join(__dirname, '../public/test_policy_en.pdf');
  fs.writeFileSync(outputPath, buffer);
  console.log('Created test PDF at:', outputPath);
  console.log('File size:', buffer.length, 'bytes');
}

createPdf().catch(err => {
  console.error('Error creating PDF:', err);
});

// Simple PDF with Japanese text (Base64 encoded)
// This PDF contains a basic Japanese policy document structure
const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Font << /F1 5 0 R >>
>>
endobj

4 0 obj
<<
/Length 200
>>
stream
BT
/F1 12 Tf
50 700 Td
(東京都環境政策基本方針) Tj
0 -20 Td
(カテゴリ: 環境政策) Tj
0 -30 Td
(自治体: 東京都) Tj
0 -30 Td
(要約:) Tj
0 -20 Td
(この政策は、東京都の環境保護と持続可能な) Tj
0 -15 Td
(都市開発のための基本方針を定めるものです。) Tj
0 -20 Td
(重点項目:) Tj
0 -20 Td
(1. 温室効果ガス排出の削減目標: 2030年までに30%削減) Tj
0 -15 Td
(2. 再生可能エネルギーの導入促進) Tj
0 -15 Td
(3. グリーンインフラの整備) Tj
0 -30 Td
(KPI指標:) Tj
0 -20 Td
(・ CO2排出量: 2025年度目標値 1,000万トン) Tj
0 -15 Td
(・ 再生可能エネルギー比率: 2030年度目標値 50%) Tj
0 -30 Td
(予算: 100億円) Tj
0 -20 Td
(実施期間: 2025年度〜2030年度) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000226 00000 n
0000000469 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
557
%%EOF`;

// Create a more advanced PDF using pdfkit if available
let outputPdf;

try {
  const { PDFDocument, rgb } = require('pdf-lib');
  const { PDFDocument: PDFDocLib } = require('pdf-lib');

  async function createPdf() {
    const pdfDoc = await PDFDocLib.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(PDFDocLib.StandardFonts.Helvetica);

    const text = `Tokyo Metropolitan Environmental Policy Basic Plan

Category: Environmental Policy
Municipality: Tokyo Metropolis

Summary:
This policy establishes basic guidelines for environmental protection
and sustainable urban development in Tokyo.

Key Points:
1. Greenhouse gas reduction target: 30% reduction by 2030
2. Promotion of renewable energy adoption
3. Development of green infrastructure

KPI Indicators:
- CO2 emissions: FY2025 target 10 million tons
- Renewable energy ratio: FY2030 target 50%

Budget: 10 billion yen
Implementation period: FY2025 - FY2030`;

    page.drawText(text, {
      x: 50,
      y: 750,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
      lineHeight: 18,
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  createPdf().then(buffer => {
    const outputPath = path.join(__dirname, '../public/test_policy_en.pdf');
    fs.writeFileSync(outputPath, buffer);
    console.log('Created test PDF at:', outputPath);
    console.log('File size:', buffer.length, 'bytes');
  }).catch(err => {
    console.log('pdf-lib not available, using simple PDF');
    const outputPath = path.join(__dirname, '../public/test_policy_simple.pdf');
    fs.writeFileSync(outputPath, Buffer.from(pdfContent, 'latin1'));
    console.log('Created simple test PDF at:', outputPath);
  });

} catch (err) {
  // Fallback to simple PDF
  console.log('Using simple PDF fallback');
  const outputPath = path.join(__dirname, '../public/test_policy_simple.pdf');
  fs.writeFileSync(outputPath, Buffer.from(pdfContent, 'latin1'));
  console.log('Created simple test PDF at:', outputPath);
}
