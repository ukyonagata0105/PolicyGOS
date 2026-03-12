/**
 * Policy Data View Component
 * Displays structured policy data dynamically rendered from JSON
 * This is the data-UI separated version that directly uses StructuredPolicy data
 */

import { useRef } from 'react';
import type { StructuredPolicy } from '@/types';

interface PolicyDataViewProps {
  structuredData: StructuredPolicy | null;
  isProcessing: boolean;
  ocrResult?: string | null; // Raw OCR text for export
  pdfFileName?: string; // Original PDF filename for export
}

const CATEGORY_LABELS: Record<string, string> = {
  environment: '環境',
  welfare: '福祉',
  education: '教育',
  infrastructure: 'インフラ',
  healthcare: '医療・保健',
  economy: '経済',
  'public-safety': '防災・安全',
  culture: '文化・観光',
  agriculture: '農業',
  digital: 'デジタル',
  other: 'その他',
};

const IMPORTANCE_COLORS = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

// ============================================================================
// Export Utility Functions
// ============================================================================

/**
 * Download data as a file (cross-platform compatible)
 */
function downloadFile(content: string, fileName: string, mimeType: string) {
  // Create blob with content
  const blob = new Blob([content], { type: mimeType });

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert structured policy data to HTML for export
 */
function policyToHtml(data: StructuredPolicy, ocrText?: string | null, pdfFileName?: string): string {
  const CATEGORY_COLORS: Record<string, string> = {
    welfare: '#fce7f3',
    education: '#dbeafe',
    environment: '#dcfce7',
    infrastructure: '#ffedd5',
    healthcare: '#fee2e2',
    economy: '#fef3c7',
    'public-safety': '#e0e7ff',
    culture: '#fae8ff',
    agriculture: '#ecfccb',
    digital: '#e0f2fe',
    other: '#f3f4f6',
  };

  const categoryColor = CATEGORY_COLORS[data.category] || CATEGORY_COLORS.other;
  const categoryLabel = CATEGORY_LABELS[data.category] || data.category;
  const timestamp = new Date(data.extractedAt || Date.now()).toLocaleString('ja-JP');

  let html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title} - 政策評価分析</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f9fafb;
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
    .category-badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .title { font-size: 28px; font-weight: 700; color: #111827; margin-bottom: 8px; }
    .municipality { font-size: 16px; color: #6b7280; }
    .timestamp { font-size: 12px; color: #9ca3af; margin-top: 8px; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 16px; font-weight: 700; color: #374151; margin-bottom: 12px; }
    .summary { font-size: 15px; line-height: 1.8; color: #1f2937; }
    .info-box { padding: 16px; border-radius: 8px; border-left: 4px solid; margin-bottom: 20px; }
    .info-box.budget { background: #f0fdf4; border-color: #22c55e; }
    .info-box.period { background: #faf5ff; border-color: #a855f7; }
    .key-point { padding: 12px 16px; border-radius: 6px; margin-bottom: 8px; border: 1px solid; }
    .key-point.high { background: #fef2f2; border-color: #fca5a5; }
    .key-point.medium { background: #fefce8; border-color: #fde047; }
    .key-point.low { background: #f0fdf4; border-color: #86efac; }
    .kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .kpi-card { padding: 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; }
    .stakeholder-tag { display: inline-block; padding: 6px 14px; background: #f3e8ff; color: #7c3aed; border-radius: 9999px; margin-right: 8px; margin-bottom: 8px; font-size: 14px; }
    .tag { display: inline-block; padding: 4px 10px; background: #f3f4f6; color: #4b5563; border-radius: 4px; font-size: 12px; margin-right: 6px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
    .ocr-section { margin-top: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; }
    .ocr-title { font-size: 14px; font-weight: 700; color: #374151; margin-bottom: 12px; }
    .ocr-text { font-size: 12px; line-height: 1.8; color: #4b5563; white-space: pre-wrap; max-height: 400px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="category-badge" style="background: ${categoryColor}">${categoryLabel}</span>
      ${data.tags && data.tags.length > 0 ? data.tags.map(t => `<span class="tag">#${t}</span>`).join('') : ''}
      <h1 class="title">${data.title || '政策タイトルなし'}</h1>
      <p class="municipality">${data.municipality}</p>
      <p class="timestamp">抽出日時: ${timestamp}</p>
    </div>`;

  // Summary
  html += `
    <div class="section">
      <h2 class="section-title">概要</h2>
      <p class="summary">${data.summary}</p>
    </div>`;

  // Budget
  if (data.budget) {
    html += `
    <div class="info-box budget">
      <h2 class="section-title">💰 予算</h2>`;
    if (data.budget.amount) {
      html += `<p><strong>金額:</strong> ${data.budget.amount.toLocaleString()} 円</p>`;
    }
    if (data.budget.fiscalYear) {
      html += `<p><strong>年度:</strong> ${data.budget.fiscalYear}年度</p>`;
    }
    if (data.budget.description) {
      html += `<p style="font-size: 14px; margin-top: 8px;">${data.budget.description}</p>`;
    }
    html += `</div>`;
  }

  // Implementation Period
  if (data.implementationPeriod) {
    html += `
    <div class="info-box period">
      <h2 class="section-title">📅 実施期間</h2>`;
    if (data.implementationPeriod.startDate) {
      html += `<p><strong>開始:</strong> ${data.implementationPeriod.startDate}</p>`;
    }
    if (data.implementationPeriod.endDate) {
      html += `<p><strong>終了:</strong> ${data.implementationPeriod.endDate}</p>`;
    }
    if (data.implementationPeriod.duration) {
      html += `<p><strong>期間:</strong> ${data.implementationPeriod.duration}</p>`;
    }
    html += `</div>`;
  }

  // Key Points
  if (data.keyPoints.length > 0) {
    html += `
    <div class="section">
      <h2 class="section-title">📌 重要ポイント</h2>`;
    data.keyPoints.forEach((point, i) => {
      const importanceClass = point.importance ?? 'medium';
      html += `<div class="key-point ${importanceClass}"><strong>#${i + 1}</strong> ${point.text}</div>`;
    });
    html += `</div>`;
  }

  // KPIs
  if (data.kpis && data.kpis.length > 0) {
    html += `
    <div class="section">
      <h2 class="section-title">📊 KPI・指標</h2>
      <div class="kpi-grid">`;
    data.kpis.forEach(kpi => {
      html += `
        <div class="kpi-card">
          <div style="font-size: 13px; color: #6b7280;">${kpi.name}</div>
          <div style="font-size: 18px; font-weight: 700; color: #1f2937;">
            ${kpi.currentValue || '-'} ${kpi.targetValue ? `→ ${kpi.targetValue}` : ''} ${kpi.unit || ''}
          </div>
        </div>`;
    });
    html += `</div></div>`;
  }

  // Stakeholders
  if (data.stakeholders && data.stakeholders.length > 0) {
    html += `
    <div class="section">
      <h2 class="section-title">👥 関係部署・ステークホルダー</h2>`;
    data.stakeholders.forEach(s => {
      html += `<span class="stakeholder-tag">${s.name}</span>`;
    });
    html += `</div>`;
  }

  // OCR Text (if available)
  if (ocrText) {
    html += `
    <div class="ocr-section">
      <h2 class="ocr-title">📄 OCR抽出テキスト</h2>
      <div class="ocr-text">${ocrText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>`;
  }

  // Footer
  html += `
    <div class="footer">
      政策評価分析システム | Powered by Generative UI + OCR Backend
      ${data.model ? `<br>Model: ${data.model}` : ''}
      ${pdfFileName ? `<br>ソースファイル: ${pdfFileName}` : ''}
    </div>
  </div>
</body>
</html>`;

  return html;
}

// ============================================================================
// Main Component
// ============================================================================

export function PolicyDataView({ structuredData, isProcessing, ocrResult, pdfFileName }: PolicyDataViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Export as JSON
  const exportJson = () => {
    if (!structuredData) return;

    const exportData = {
      policy: structuredData,
      ocrText: ocrResult || null,
      sourceFile: pdfFileName || null,
      exportedAt: new Date().toISOString(),
    };

    const fileName = `${structuredData.title?.replace(/[\\/:*?"<>|]/g, '_') || 'policy'}_${Date.now()}.json`;
    downloadFile(JSON.stringify(exportData, null, 2), fileName, 'application/json');
  };

  // Export as HTML
  const exportHtml = () => {
    if (!structuredData) return;

    const html = policyToHtml(structuredData, ocrResult, pdfFileName);
    const fileName = `${structuredData.title?.replace(/[\\/:*?"<>|]/g, '_') || 'policy'}_${Date.now()}.html`;
    downloadFile(html, fileName, 'text/html');
  };

  // Export OCR text only
  const exportOcrText = () => {
    if (!ocrResult) return;

    const fileName = `ocr_text_${Date.now()}.txt`;
    downloadFile(ocrResult, fileName, 'text/plain');
  };

  // Request fullscreen on the container
  const requestNativeFullscreen = () => {
    // Check if fullscreen is supported
    const doc = document as any;
    const fullscreenElement = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (fullscreenElement) {
      // Exit fullscreen
      const exitFn = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitFn) {
        exitFn.call(doc).catch((err: unknown) => {
          console.log('Fullscreen exit failed:', err);
        });
      }
    } else {
      // Enter fullscreen - try the policy data view container first, then fallback to document element
      const target = containerRef.current || doc.documentElement;
      const requestFn = target.requestFullscreen || target.webkitRequestFullscreen || target.mozRequestFullScreen || target.msRequestFullscreen;

      if (requestFn) {
        requestFn.call(target).catch((err: unknown) => {
          console.log('Fullscreen request failed:', err);
          // Fallback: open in new window for print/export
          window.print();
        });
      } else {
        // Fallback for browsers without fullscreen support
        console.log('Fullscreen API not supported, opening print dialog instead');
        window.print();
      }
    }
  };

  // Action buttons component
  const ActionButtons = () => (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <button
        onClick={exportJson}
        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
      >
        <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        JSON
      </button>
      <button
        onClick={exportHtml}
        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
      >
        <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        HTML
      </button>
      {ocrResult && (
        <button
          onClick={exportOcrText}
          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          OCRテキスト
        </button>
      )}
      <button
        onClick={requestNativeFullscreen}
        className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 ml-auto"
      >
        <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        全画面
      </button>
    </div>
  );
  if (isProcessing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-center">
          <svg
            className="animate-spin h-6 w-6 text-blue-500 mr-3"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <h3 className="text-lg font-medium text-blue-800">データ構造化中...</h3>
        </div>
        <p className="mt-2 text-blue-700">Gemma3:27Bが政策データを分析しています</p>
      </div>
    );
  }

  if (!structuredData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-700">データがありません</h3>
        <p className="mt-2 text-sm text-gray-500">
          PDFをアップロードしてデータを構造化してください
        </p>
      </div>
    );
  }

  const categoryLabel = CATEGORY_LABELS[structuredData.category] || structuredData.category;

  return (
    <div ref={containerRef} className="bg-white border border-gray-200 rounded-lg p-6">
      {/* Action Buttons */}
      <ActionButtons />

      {/* Header */}
      <div className={`flex items-center justify-between mb-6 pb-4 border-b border-gray-200`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${structuredData.category === 'welfare' ? 'bg-pink-100 text-pink-800' :
                structuredData.category === 'education' ? 'bg-blue-100 text-blue-800' :
                  structuredData.category === 'environment' ? 'bg-green-100 text-green-800' :
                    structuredData.category === 'infrastructure' ? 'bg-orange-100 text-orange-800' :
                      structuredData.category === 'healthcare' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
              }`}>
              {categoryLabel}
            </span>
            {structuredData.tags && structuredData.tags.length > 0 && (
              <div className="flex gap-1">
                {structuredData.tags.map((tag, i) => (
                  <span key={i} className="inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <h2 className="text-xl font-bold text-gray-900">{structuredData.title || '政策タイトルなし'}</h2>
          <p className="text-sm text-gray-600">{structuredData.municipality}</p>
        </div>
        {structuredData.extractedAt && (
          <span className="text-xs text-gray-500">
            {new Date(structuredData.extractedAt).toLocaleString('ja-JP')}
          </span>
        )}
      </div>

      {/* Summary */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">概要</h3>
        <p className="text-sm text-gray-800 leading-relaxed">{structuredData.summary}</p>
      </div>

      {/* Budget */}
      {structuredData.budget && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <svg className="h-4 w-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6l-8-8z" />
            </svg>
            予算
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {structuredData.budget.amount && (
              <div>
                <span className="text-gray-600">金額:</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {structuredData.budget.amount.toLocaleString()} 円
                </span>
              </div>
            )}
            {structuredData.budget.fiscalYear && (
              <div>
                <span className="text-gray-600">年度:</span>
                <span className="ml-2 font-semibold text-gray-900">{structuredData.budget.fiscalYear}年度</span>
              </div>
            )}
          </div>
          {structuredData.budget.description && (
            <p className="text-xs text-gray-600 mt-2">{structuredData.budget.description}</p>
          )}
        </div>
      )}

      {/* Implementation Period */}
      {structuredData.implementationPeriod && (
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <svg className="h-4 w-4 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v14a1 1 0 001 1h2a1 1 0 001-1V3a1 1 0 00-1-1H3a1 1 0 00-1 1v14a1 1 0 001 1h2a1 1 0 001-1V3a1 1 0 00-1-1H3a1 1 0 00-1 1z M4 6h10M4 10h10m-10 4h10" clipRule="evenodd" />
            </svg>
            実施期間
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {structuredData.implementationPeriod.startDate && (
              <div>
                <span className="text-gray-600">開始:</span>
                <span className="ml-1 font-semibold text-gray-900">{structuredData.implementationPeriod.startDate}</span>
              </div>
            )}
            {structuredData.implementationPeriod.endDate && (
              <div>
                <span className="text-gray-600">終了:</span>
                <span className="ml-1 font-semibold text-gray-900">{structuredData.implementationPeriod.endDate}</span>
              </div>
            )}
            {structuredData.implementationPeriod.duration && (
              <div>
                <span className="text-gray-600">期間:</span>
                <span className="ml-1 font-semibold text-gray-900">{structuredData.implementationPeriod.duration}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Points */}
      {structuredData.keyPoints.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">重要ポイント</h3>
          <ul className="space-y-2">
            {structuredData.keyPoints.map((point, index) => (
              <li
                key={index}
                className={`flex items-start p-3 rounded-lg border ${IMPORTANCE_COLORS[point.importance ?? 'medium']
                  }`}
              >
                <span className="mr-3 text-gray-400">#{index + 1}</span>
                <span className="text-sm text-gray-800">{point.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      {structuredData.kpis && structuredData.kpis.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <svg className="h-4 w-4 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4a1 1 0 011-1zm5.657 1.757a1 1 0 010-1.414L10 9.414 7.586 7.586a1 1 0 010-1.414l-1.172 1.171z" />
            </svg>
            KPI・指標
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {structuredData.kpis.map((kpi, index) => (
              <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">{kpi.name}</div>
                <div className="flex items-baseline gap-2">
                  {kpi.currentValue && (
                    <span className="text-lg font-bold text-gray-900">{kpi.currentValue}</span>
                  )}
                  {kpi.targetValue && (
                    <>
                      <span className="text-gray-400">→</span>
                      <span className="text-lg font-bold text-blue-600">{kpi.targetValue}</span>
                    </>
                  )}
                  {kpi.unit && <span className="text-xs text-gray-500">{kpi.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stakeholders */}
      {structuredData.stakeholders && structuredData.stakeholders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <svg className="h-4 w-4 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zm5 2a3 3 0 11-6 0 3 3 0 016 0zM7 9a2 2 0 11-4 0 2 2 0 014 0zm8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            関係部署・ステークホルダー
          </h3>
          <div className="flex flex-wrap gap-2">
            {structuredData.stakeholders.map((stakeholder, index) => (
              <span
                key={index}
                className="inline-block px-3 py-1 text-sm bg-purple-100 text-purple-800 rounded-full"
              >
                {stakeholder.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {structuredData.model && (
        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Powered by {structuredData.model} | データ抽出: {new Date(structuredData.extractedAt || Date.now()).toLocaleString('ja-JP')}
          </p>
        </div>
      )}
    </div>
  );
}
