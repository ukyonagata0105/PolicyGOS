# OCR Backend Debug Policy

## Scope

この文書は `PyMuPDF + PaddleOCR` backend の実データ検証と回帰確認の運用ルールです。

## Commands

- Verified local startup:
  - `cd policyevaluationGOS && npm run debug:full`
- Product E2E:
  - `cd policyevaluationGOS && npm run test:e2e:real`
- OCR backend debug capture:
  - `cd policyevaluationGOS && npm run debug:backend:json`

## Startup Rules

- `npm run debug:full` starts or reuses a verified PolicyEval backend and injects the resolved backend URL into Vite and Electron.
- Self-started local backend flows use a free 5-digit `127.0.0.1` port instead of assuming `8000`.
- `POLICYEVAL_BACKEND_URL` is the preferred manual override for an already running backend.
- External-backend startup must validate `/ready`, `/health`, and `/repair/opencode` before the app is treated as ready.
- A wrong service on `127.0.0.1:8000` must fail fast with a startup mismatch error, not surface later as a repair 404.

## Artifact Policy

- 本番相当 PDF の full raw payload は repo に commit しない
- commit してよいもの:
  - redacted fixture
  - shape summary
  - parser regression test に必要な最小断片
- local scratch path の既定:
  - `/tmp/policyevgos-yomitoku-debug/`

## Backend Checks

- `classification`
- `classification_confidence`
- `path_used`
- `engine.primary`
- `engine.ocr`
- `pages[].tables`
- `pages[].text_blocks`

## Frontend Checks

- `rawCsv` がある場合は table artifact が作られること
- `pdf_text_fast_path` が real PDF で優先されること
- parsed table が 0 件でも Generative UI 全体は失敗しないこと

## Current Expectations

- born-digital PDF:
  - `path_used = pdf_text_fast_path`
- image input:
  - `path_used = backend_ocr`
  - `ocr_engine = paddleocr` を優先
