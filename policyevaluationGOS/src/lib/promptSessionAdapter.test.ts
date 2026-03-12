import { describe, expect, it } from 'vitest';

import {
  adaptPromptSessionToGenerationInput,
  advancePromptSession,
} from '@/lib/promptSessionAdapter';
import {
  createGeneratedUICompatibilityFixture,
  createGeneratedUIConsumerDocument,
  generatedUICompatibilityProfile,
} from '@/test/generatedUICompat';
import type { PromptSessionSubmission } from '@/types';

describe('promptSessionAdapter', () => {
  it('maps prompt-only submissions into a direct prompt briefing document', () => {
    const submission: PromptSessionSubmission = {
      prompt: '  地域交通の争点を住民向けに説明して  ',
      mode: 'fresh',
      session: {
        turns: [],
        attachment: null,
      },
    };

    const adapted = adaptPromptSessionToGenerationInput({
      submission,
      availableDocuments: [],
      userProfile: generatedUICompatibilityProfile,
    });

    expect(adapted.promptRequest).toEqual({
      prompt: '地域交通の争点を住民向けに説明して',
      mode: 'fresh',
      messages: [],
      contextDocumentId: null,
    });
    expect(adapted.generationDocuments).toHaveLength(1);
    expect(adapted.exportDocuments).toEqual(adapted.generationDocuments);
    expect(adapted.generationDocuments[0]).toMatchObject({
      name: '地域交通の争点を住民向けに説明して.txt',
      routeDecision: {
        route: 'direct',
        reason: 'no_tabular_evidence',
      },
      structuredData: {
        summary: '地域交通の争点を住民向けに説明して',
      },
    });
  });

  it('maps prompt plus attached PDF into an engine request with hidden contextDocumentId', () => {
    const attachedDocument = createGeneratedUIConsumerDocument('attachment.pdf');
    const submission: PromptSessionSubmission = {
      prompt: '添付PDFをもとに briefing を作って',
      mode: 'fresh',
      session: {
        turns: [],
        attachment: {
          id: 'attachment-1',
          kind: 'pdf',
          name: attachedDocument.name,
          sourceDocumentId: attachedDocument.id,
        },
      },
    };

    const adapted = adaptPromptSessionToGenerationInput({
      submission,
      availableDocuments: [attachedDocument],
      userProfile: generatedUICompatibilityProfile,
    });

    expect(adapted.generationDocuments).toEqual([attachedDocument]);
    expect(adapted.exportDocuments).toEqual([attachedDocument]);
    expect(adapted.promptRequest).toEqual({
      prompt: '添付PDFをもとに briefing を作って',
      mode: 'fresh',
      messages: [],
      contextDocumentId: attachedDocument.id,
    });
  });

  it('maps follow-up turns and preserves the attachment in the advanced shell session', () => {
    const attachedDocument = createGeneratedUIConsumerDocument('follow-up.pdf');
    const generatedUi = createGeneratedUICompatibilityFixture();
    const submission: PromptSessionSubmission = {
      prompt: '次は議員向けに比較ポイントを絞って',
      mode: 'follow-up',
      session: {
        turns: [
          { role: 'user', content: '地域交通の争点を説明して' },
          { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
        ],
        attachment: {
          id: 'attachment-2',
          kind: 'pdf',
          name: attachedDocument.name,
          sourceDocumentId: attachedDocument.id,
        },
      },
    };

    const adapted = adaptPromptSessionToGenerationInput({
      submission,
      availableDocuments: [attachedDocument],
      userProfile: generatedUICompatibilityProfile,
    });

    expect(adapted.generationDocuments).toEqual([attachedDocument]);
    expect(adapted.promptRequest).toEqual({
      prompt: '次は議員向けに比較ポイントを絞って',
      mode: 'follow-up',
      messages: [
        { role: 'user', content: '地域交通の争点を説明して' },
        { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
      ],
      contextDocumentId: attachedDocument.id,
    });
    expect(advancePromptSession(submission, generatedUi)).toEqual({
      turns: [
        { role: 'user', content: '地域交通の争点を説明して' },
        { role: 'assistant', content: 'Briefing を更新しました: 地域交通再編計画ビュー' },
        { role: 'user', content: '次は議員向けに比較ポイントを絞って' },
        { role: 'assistant', content: `Briefing を更新しました: ${generatedUi.title}` },
      ],
      attachment: submission.session.attachment,
    });
  });
});
