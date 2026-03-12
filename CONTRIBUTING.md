# Contributing

## Before opening a pull request

- Confirm the change fits the public scope of PolicyGOS
- Prefer small, reviewable pull requests
- Include verification commands in the PR description

## Local verification

```bash
cd policyevaluationGOS
npm run type-check
npm test
npm run build
```

If your change affects the real PDF flow, also run:

```bash
cd policyevaluationGOS
npx playwright test tests/e2e/workspace-real-pdf.spec.ts
```

## Pull request guidance

- Explain the user-facing impact first
- Note any backend/environment requirements
- Avoid committing local artifacts, credentials, screenshots, or agent-specific files
