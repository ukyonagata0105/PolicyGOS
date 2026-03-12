# PolicyEval GOS

PolicyEval GOS は、行政 PDF を入力として構造化データと Generative UI を生成するローカル実行型の OSS です。現行構成は `PyMuPDF` を主系、`PaddleOCR` を OCR fallback とする document backend と、React/Electron ベースの workspace UI で構成されています。

## 現在の到達点

- 複数 PDF を 1 workspace で処理
- `pdf_text_fast_path` による born-digital PDF の高速処理
- OCR backend の async job API
- Generative UI の browser / fullscreen / ZIP export
- 実 PDF `R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf` での E2E 回帰

## アーキテクチャ

- frontend: `policyevaluationGOS/`
  - React + Vite + Electron
  - workspace/session 管理
  - table parsing / UI generation / export
- backend: `document_ocr_api/`
  - FastAPI
  - PyMuPDF first extraction
  - PaddleOCR fallback
  - normalized JSON / markdown / csv output

## 推奨開発環境

- Node.js 18+
- Python 3.12
- macOS Apple Silicon または Windows
- 任意: Gemini API key または Ollama

`PaddleOCR` は Python 3.14 ではそのまま動かないため、backend は Python 3.12 の仮想環境を既定にしています。

## クイックスタート

### 1. frontend の依存関係

```bash
cd policyevaluationGOS
npm install
```

### 2. backend の依存関係

```bash
cd document_ocr_api
/opt/homebrew/bin/python3.12 -m venv venv312
source venv312/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install paddlepaddle paddleocr 'paddlex[ocr]'
```

Windows では `py -3.12 -m venv venv312` を使ってください。

### 3. backend 起動

```bash
cd policyevaluationGOS
npm run backend:dev
```

### 4. frontend / Electron 起動

ブラウザ UI:

```bash
cd policyevaluationGOS
npm run dev
```

Electron:

```bash
cd policyevaluationGOS
npm run electron:dev:external-backend
```

## よく使うコマンド

```bash
cd policyevaluationGOS
npm run type-check
npm run lint
npm test
npm run test:e2e:real
npm run debug:ocr:json
```

## 実データでの確認状況

対象:

- `R7【政策Ⅰ】政策推進プラン構成事業一覧表.pdf`

確認済み:

- backend JSON: `pdf_text_fast_path`
- 実 PDF E2E: Generative UI 表示まで通過
- 画像入力 smoke test: `ocr_engine = paddleocr`

## 既知の残課題

- スキャン表の構造抽出は `PaddleOCR OCR` だけでは弱く、`PP-StructureV3` 連携を継続改善中
- legacy 互換のため一部の `yomitoku_*` ファイル名や env 名称が残っていますが、backend 本体は `document_ocr_api/` に移行済みです

## ライセンス

MIT
