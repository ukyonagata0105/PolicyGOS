import { createPdfFile, createWorkspaceDocument } from '@/lib/workspace';
import type {
  GeneratedUI,
  PromptConversationMessage,
  PromptGenerationRequest,
  UserProfile,
  WorkspaceDocument,
} from '@/types';

export function createPromptWorkspaceDocument(
  request: PromptGenerationRequest,
  userProfile: UserProfile
): WorkspaceDocument {
  const title = buildPromptTitle(request.prompt);
  const file = new File([request.prompt], `${title}.txt`, { type: 'text/plain' });
  const document = createWorkspaceDocument(createPdfFile(file));
  const priorUserTurns = request.messages.filter((message) => message.role === 'user').map((message) => message.content);
  const overview = [
    request.prompt.trim(),
    priorUserTurns.length > 0 ? `これまでの質問: ${priorUserTurns.join(' / ')}` : '',
  ]
    .filter(Boolean)
    .join(' / ');

  document.name = `${title}.txt`;
  document.collectionSource.label = '質問起点 briefing';
  document.collectionSource.notes = `${request.mode} prompt`;
  document.processing = {
    provider: 'prompt-composer',
    status: 'completed',
    progress: 100,
    message: '質問から briefing を生成しました',
  };
  document.routeDecision = {
    route: 'direct',
    reason: 'no_tabular_evidence',
    confidence: 'strong',
    evidence: {
      rawCsvPresent: false,
      parsedTableCount: 0,
      tableArtifactCount: 0,
      candidateRowCount: 0,
      projectCandidateRowCount: 0,
      viableCandidateRowCount: 0,
    },
  };
  document.rawLayoutText = overview;
  document.structuringText = overview;
  document.ocrText = overview;
  document.documentDigest = {
    title,
    municipality: '未抽出',
    overview,
    category: 'other',
  };
  document.structuredData = {
    title,
    municipality: '未抽出',
    summary: overview,
    keyPoints: [
      {
        text: request.prompt.trim(),
        importance: 'high',
      },
      ...priorUserTurns.slice(-2).map((turn) => ({ text: turn, importance: 'medium' as const })),
    ],
    category: 'other',
    tags: [`audience:${userProfile.audience}`, `mode:${request.mode}`],
  };

  return document;
}

export function buildPromptConversation(
  request: PromptGenerationRequest,
  generatedUi: GeneratedUI
): PromptConversationMessage[] {
  const priorMessages = request.mode === 'fresh' ? [] : request.messages;

  return [
    ...priorMessages,
    { role: 'user', content: request.prompt.trim() },
    {
      role: 'assistant',
      content: `Briefing を更新しました: ${generatedUi.title}`,
    },
  ];
}

function buildPromptTitle(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, ' ');
  const title = normalized.slice(0, 28).trim();
  return title || 'prompt-briefing';
}
