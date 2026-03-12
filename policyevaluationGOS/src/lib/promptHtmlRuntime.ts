import { generateHtmlWithFallback } from '@/lib/llmProviders';
import { deriveCandidateBundle, deriveProjectRowsCsv } from '@/lib/projectExtractor';
import { resolveWorkspaceDocumentDigest } from '@/lib/pipelineContracts';
import { createPromptWorkspaceDocument } from '@/lib/promptGeneration';
import { buildAudienceLead, buildPromptContext, buildWorkspaceSummary } from '@/lib/workspace';
import type { GeneratedUI, PromptGenerationRequest, UserProfile, WorkspaceDocument } from '@/types';

interface PromptHtmlRuntimeResult {
  success: boolean;
  ui?: GeneratedUI;
  error?: string;
  rawResponse?: string;
  provider?: string;
  model?: string;
}

export async function generatePromptHtmlRuntime(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  promptRequest: PromptGenerationRequest
): Promise<PromptHtmlRuntimeResult> {
  const runtimeDocuments =
    documents.length > 0 ? documents : [createPromptWorkspaceDocument(promptRequest, userProfile)];
  const promptContext = buildPromptContext(runtimeDocuments, userProfile, promptRequest);
  const providerResult = await generateHtmlWithFallback({
    systemPrompt: buildPromptHtmlSystemPrompt(userProfile, promptRequest),
    prompt: buildPromptHtmlUserPrompt(runtimeDocuments, userProfile, promptRequest, promptContext),
    temperature: 0.7,
    maxTokens: 8192,
  });

  if (!providerResult.success || !providerResult.html) {
    const fallbackUi = buildPromptHtmlFallbackUi(
      runtimeDocuments,
      userProfile,
      promptRequest,
      providerResult.error || 'HTML generation failed'
    );

    return {
      success: true,
      ui: fallbackUi,
      error: providerResult.error,
      rawResponse: providerResult.rawText,
      provider: providerResult.provider,
      model: providerResult.model,
    };
  }

  const htmlDocument = ensureHtmlDocument(providerResult.html, buildPromptTitle(promptRequest.prompt));
  const metadata = extractHtmlMetadata(htmlDocument, promptRequest.prompt);

  return {
    success: true,
    ui: {
      id: crypto.randomUUID(),
      title: metadata.title,
      summary: metadata.description,
      schema: {
        layout: {
          density: userProfile.displayConstraint === 'mobile' ? 'compact' : 'comfortable',
          emphasis: userProfile.readingPreference,
          heroStyle: userProfile.displayConstraint === 'presentation' ? 'presentation' : 'editorial',
        },
        sections: [],
      },
      timestamp: new Date().toISOString(),
      provider: providerResult.provider,
      model: providerResult.model,
      prompt: promptContext,
      htmlDocument,
      renderMode: 'html',
      warnings: [],
    },
      rawResponse: providerResult.rawText,
      provider: providerResult.provider,
      model: providerResult.model,
  };
}

function buildPromptHtmlSystemPrompt(
  userProfile: UserProfile,
  promptRequest: PromptGenerationRequest
): string {
  return [
    'You generate a complete HTML document for a Japanese policy briefing app.',
    'Return exactly one complete HTML document beginning with <!DOCTYPE html>.',
    'Do not return JSON, markdown, explanations, or schema objects.',
    'Use Japanese for visible copy unless quoted source text requires otherwise.',
    'Design the page for both desktop and mobile.',
    'The output should feel like a polished briefing surface, not a generic dashboard.',
    'Preserve conversation continuity across follow-up turns.',
    'When PDF context exists, reflect that source explicitly in the page.',
    'When exact metric values are present in the extracted policy context, use those exact values and do not replace them with placeholders or guessed brackets.',
    'If exact values are not present in the provided context, explicitly say the value could not be confirmed instead of inventing one.',
    `Audience: ${userProfile.audience}`,
    `Reading preference: ${userProfile.readingPreference}`,
    `Display constraint: ${userProfile.displayConstraint}`,
    `Prompt mode: ${promptRequest.mode}`,
  ].join('\n');
}

function buildPromptHtmlUserPrompt(
  documents: WorkspaceDocument[],
  userProfile: UserProfile,
  promptRequest: PromptGenerationRequest,
  promptContext: string
): string {
  const contextDocument = promptRequest.contextDocumentId
    ? documents.find((document) => document.id === promptRequest.contextDocumentId) || null
    : null;
  const conversationSummary = promptRequest.messages.length > 0
    ? promptRequest.messages.map((message, index) => `${index + 1}. ${message.role}: ${message.content}`).join('\n')
    : 'No prior conversation turns.';
  const documentContext = documents
    .map((document, index) => {
      const digest = resolveWorkspaceDocumentDigest(document);
      const layoutExcerpt = normalizeInlineText(document.rawLayoutText || document.structuringText || document.ocrText || '').slice(0, 1800);
      const metricsContext = buildMetricsContext(document);
      const csvPreview = buildCsvPreview(document);
      return [
        `Document ${index + 1}: ${document.name}`,
        `Municipality: ${digest?.municipality || document.collectionSource.municipality || '未抽出'}`,
        `Overview: ${digest?.overview || document.structuredData?.summary || document.processing.message}`,
        `Route: ${document.routeDecision?.route || 'pending'}`,
        `Ingestion path: ${document.ingestionPath || 'unknown'}`,
        `Document type: ${document.documentType || 'unknown'}`,
        `Key points: ${(document.structuredData?.keyPoints || []).map((point) => point.text).join(' / ') || 'none'}`,
        `Excerpt: ${layoutExcerpt || 'none'}`,
        metricsContext ? `Exact metrics:\n${metricsContext}` : 'Exact metrics: none',
        csvPreview ? `Structured rows CSV:\n${csvPreview}` : 'Structured rows CSV: none',
      ].join('\n');
    })
    .join('\n\n');

  return [
    `User profile lead: ${buildAudienceLead(buildWorkspaceSummary(documents), userProfile)}`,
    `Current prompt: ${promptRequest.prompt.trim()}`,
    `Conversation history:\n${conversationSummary}`,
    `Attached PDF context: ${contextDocument ? contextDocument.name : 'none'}`,
    contextDocument ? `Attached PDF digest:\n${documentContext}` : `Available context:\n${documentContext}`,
    `Workspace prompt context:\n${promptContext}`,
    'Build a complete responsive HTML briefing with a strong headline, a concise lead, key takeaways, source/context references, and clear sections.',
    'Make the page visually intentional with embedded CSS and, if useful, lightweight inline JavaScript only for simple interactions.',
    'If the prompt is a follow-up, revise the full page to reflect the new user intent instead of appending raw notes.',
    'Return the final HTML document now.',
  ].join('\n\n');
}

function buildPromptHtmlFallbackUi(
  runtimeDocuments: WorkspaceDocument[],
  userProfile: UserProfile,
  promptRequest: PromptGenerationRequest,
  generationError: string
): GeneratedUI {
  const summary = buildWorkspaceSummary(runtimeDocuments);
  const contextDocument = promptRequest.contextDocumentId
    ? runtimeDocuments.find((document) => document.id === promptRequest.contextDocumentId) || null
    : null;
  const paragraphs = [
    `現在の質問: ${promptRequest.prompt.trim()}`,
    promptRequest.messages.length > 0
      ? `会話履歴: ${promptRequest.messages.filter((message) => message.role === 'user').map((message) => message.content).join(' / ')}`
      : '会話履歴: なし',
    contextDocument ? `PDFコンテキスト: ${contextDocument.name}` : 'PDFコンテキスト: なし',
    `HTML生成に失敗したため、構造化 briefing fallback を表示しています。理由: ${generationError}`,
  ];

  return {
    id: crypto.randomUUID(),
    title: buildPromptTitle(promptRequest.prompt),
    summary: 'HTML provider generation failed; showing explicit schema fallback.',
    schema: {
      layout: {
        density: userProfile.displayConstraint === 'mobile' ? 'compact' : 'comfortable',
        emphasis: userProfile.readingPreference,
        heroStyle: userProfile.displayConstraint === 'presentation' ? 'presentation' : 'editorial',
      },
      sections: [
        {
          id: 'overview',
          kind: 'hero',
          title: buildPromptTitle(promptRequest.prompt),
          description: buildAudienceLead(summary, userProfile),
          accent: 'amber',
          items: [
            { label: '文書数', value: `${runtimeDocuments.length}件`, emphasis: 'strong' },
            { label: '自治体', value: summary.municipalities.join('・') || '未抽出' },
            { label: '添付PDF', value: contextDocument?.name || 'なし' },
          ],
          paragraphs,
        },
      ],
    },
    timestamp: new Date().toISOString(),
    provider: 'fallback',
    model: 'prompt-html-fallback',
    prompt: buildPromptContext(runtimeDocuments, userProfile, promptRequest),
    renderMode: 'schema',
    warnings: [`HTML generation failed: ${generationError}`],
  };
}

function buildPromptTitle(prompt: string): string {
  const normalized = normalizeInlineText(prompt);
  const title = normalized.slice(0, 48).trim();
  return title || 'Prompt Briefing';
}

function ensureHtmlDocument(html: string, title: string): string {
  const trimmed = html.trim();
  if (/<!DOCTYPE html>/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return trimmed;
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${escapeHtml(title)}</title>`,
    '</head>',
    `<body>${trimmed}</body>`,
    '</html>',
  ].join('\n');
}

function extractHtmlMetadata(htmlDocument: string, fallbackPrompt: string): { title: string; description: string } {
  const titleMatch = htmlDocument.match(/<title>([\s\S]*?)<\/title>/i);
  const metaDescriptionMatch = htmlDocument.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>(?:\s*)/i);
  const h1Match = htmlDocument.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const bodyText = stripHtmlTags(h1Match?.[1] || metaDescriptionMatch?.[1] || '').trim();

  return {
    title: stripHtmlTags(titleMatch?.[1] || '').trim() || buildPromptTitle(fallbackPrompt),
    description: bodyText || `${buildPromptTitle(fallbackPrompt)} のHTML briefing`,
  };
}

function stripHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildMetricsContext(document: WorkspaceDocument): string {
  const metricLines: string[] = [];

  for (const project of document.projectRecords.slice(0, 12)) {
    const indicators = project.indicators
      .map((indicator) => {
        const values = [
          indicator.plannedValue ? `計画=${indicator.plannedValue}` : '',
          indicator.actualValue ? `実績=${indicator.actualValue}` : '',
          indicator.targetValue ? `目標=${indicator.targetValue}` : '',
          indicator.achievement ? `達成度=${indicator.achievement}` : '',
        ].filter(Boolean);

        return values.length > 0
          ? `- ${indicator.indicatorType}: ${indicator.name}${indicator.unit ? ` (${indicator.unit})` : ''} / ${values.join(' / ')}`
          : '';
      })
      .filter(Boolean);

    if (indicators.length > 0) {
      metricLines.push(`[${project.projectName}]`);
      metricLines.push(...indicators);
    }
  }

  if (metricLines.length > 0) {
    return clampPromptBlock(metricLines.join('\n'), 4000);
  }

  const bundle = deriveCandidateBundle(document);
  if (!bundle || bundle.candidateRows.length === 0) {
    return '';
  }

  const candidateLines = bundle.candidateRows
    .slice(0, 20)
    .map((row) => {
      const values = [
        row.activityIndicatorName ? `活動指標=${row.activityIndicatorName}` : '',
        row.indicatorUnit ? `単位=${row.indicatorUnit}` : '',
        row.actualValue ? `実績=${row.actualValue}` : '',
        row.targetValue ? `目標=${row.targetValue}` : '',
      ].filter(Boolean);
      return values.length > 0 ? `- ${row.projectNameCandidate || row.projectSummaryCandidate || row.sourceReference}: ${values.join(' / ')}` : '';
    })
    .filter(Boolean);

  return clampPromptBlock(candidateLines.join('\n'), 4000);
}

function buildCsvPreview(document: WorkspaceDocument): string {
  const csv = deriveProjectRowsCsv(document) || document.rawCsv || '';
  if (!csv.trim()) {
    return '';
  }
  return clampPromptBlock(csv, 3200);
}

function clampPromptBlock(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trim()}\n...[truncated]`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
