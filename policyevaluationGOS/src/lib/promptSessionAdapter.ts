import {
  buildPromptConversation,
  createPromptWorkspaceDocument,
} from '@/lib/promptGeneration';
import type {
  GeneratedUI,
  PromptGenerationRequest,
  PromptSession,
  PromptSessionSubmission,
  UserProfile,
  WorkspaceDocument,
} from '@/types';

export interface PromptGenerationAdapterInput {
  submission: PromptSessionSubmission;
  availableDocuments: WorkspaceDocument[];
  userProfile: UserProfile;
}

export interface PromptGenerationAdapterOutput {
  generationDocuments: WorkspaceDocument[];
  exportDocuments: WorkspaceDocument[];
  promptRequest: PromptGenerationRequest;
}

export function adaptPromptSessionToGenerationInput({
  submission,
  availableDocuments,
  userProfile,
}: PromptGenerationAdapterInput): PromptGenerationAdapterOutput {
  const trimmedPrompt = submission.prompt.trim();
  const promptRequest = createPromptGenerationRequest(submission, trimmedPrompt);
  const contextDocument = resolvePromptAttachmentDocument(
    submission.session.attachment,
    availableDocuments
  );

  if (submission.session.attachment && !contextDocument) {
    throw new Error(`添付 PDF "${submission.session.attachment.name}" を参照できません。`);
  }

  const generationDocuments = contextDocument
    ? [contextDocument]
    : [createPromptWorkspaceDocument(promptRequest, userProfile)];

  return {
    generationDocuments,
    exportDocuments: generationDocuments,
    promptRequest,
  };
}

export function advancePromptSession(
  submission: PromptSessionSubmission,
  generatedUi: GeneratedUI
): PromptSession {
  const promptRequest = createPromptGenerationRequest(submission, submission.prompt.trim());

  return {
    turns: buildPromptConversation(promptRequest, generatedUi),
    attachment: submission.session.attachment,
  };
}

export function normalizePromptSessionSubmission(
  request: PromptSessionSubmission | PromptGenerationRequest,
  availableDocuments: WorkspaceDocument[]
): PromptSessionSubmission {
  if ('session' in request) {
    return request;
  }

  const attachment = request.contextDocumentId
    ? buildPromptSessionAttachment(request.contextDocumentId, availableDocuments)
    : null;

  return {
    prompt: request.prompt,
    mode: request.mode,
    session: {
      turns: request.messages,
      attachment,
    },
  };
}

function createPromptGenerationRequest(
  submission: PromptSessionSubmission,
  prompt: string
): PromptGenerationRequest {
  return {
    prompt,
    mode: submission.mode,
    messages: submission.session.turns,
    contextDocumentId: submission.session.attachment?.sourceDocumentId || null,
  };
}

function resolvePromptAttachmentDocument(
  attachment: PromptSession['attachment'],
  availableDocuments: WorkspaceDocument[]
): WorkspaceDocument | null {
  if (!attachment) {
    return null;
  }

  return availableDocuments.find((document) => document.id === attachment.sourceDocumentId) || null;
}

function buildPromptSessionAttachment(
  sourceDocumentId: string,
  availableDocuments: WorkspaceDocument[]
): PromptSession['attachment'] {
  const document = availableDocuments.find((entry) => entry.id === sourceDocumentId);

  return {
    id: sourceDocumentId,
    kind: 'pdf',
    name: document?.name || 'attached.pdf',
    sourceDocumentId,
  };
}
