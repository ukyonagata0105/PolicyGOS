export const promptQuestionCapabilityBaseline = {
  productReference: {
    app: '4295-sibling-web-app',
    questionModes: ['fresh', 'follow-up'],
    responseShape: 'full-html-document',
  },
  freshQuestionFlow: {
    requiresNonEmptyPrompt: true,
    resetsConversation: true,
    clearsPromptAfterSuccess: true,
  },
  followUpFlow: {
    requiresExistingConversation: true,
    carriesForwardMessages: true,
    keepsQuestionAsUserTurn: true,
  },
  optionalPdfContext: {
    enabled: true,
    maxSelectedFiles: 1,
    extractBeforeGenerate: true,
  },
  outputSurface: {
    primaryExperience: 'briefing-first',
    previewSurface: 'generated-html-preview',
  },
} as const;

export const preservedSearchCapabilityBaseline = {
  minimumCapability: 'source-discovery-and-fetch',
  reviewStrategies: ['listing-page', 'viewer-kintone'],
  directFetchStrategies: ['static-pdf-url', 'manual-upload'],
  forwardsSourceRegistryIntoGeneration: true,
  broaderSearchAugmentation: {
    status: 'optional-future-work',
    requiredForCurrentBranch: false,
  },
} as const;
