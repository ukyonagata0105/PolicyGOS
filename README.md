# PolicyGOS

PolicyGOS は、行政・政策関連 PDF をもとに、住民向けや議員向けの briefing を生成するためのローカル実行型 OSS です。

このリポジトリは、試作コードの置き場ではなく、実際に clone して動かせる公開用リポジトリとして整備しています。

![PolicyGOS prompt-first shell](docs-open/images/prompt-first-shell.png)

## 1. 何ができるか

- prompt-first の composer から briefing を起動する
- PDF を composer に添付して、質問と一緒に扱う
- OCR / repair / source discovery を使って PDF を処理する
- browser / fullscreen / ZIP export の各出力を扱う
- 実 PDF を使った E2E で主要フローを確認する

## 2. 想定する利用者

- 行政資料を住民向けに説明したい人
- 政策 PDF の論点や評価指標を briefing として整理したい人
- PDF を添付して質問起点の説明ページを作りたい人

## 3. ユースケース

PolicyGOS は、自治体や公共団体の情報提供面に組み込むことを強く意識しています。たとえば自治体の Web サイトに組み込み、住民からの問い合わせや政策に関する質問に対して、単なるチャットのテキスト応答ではなく、図表・要点整理・出典・補足説明を含む briefing surface として、よりグラフィカルかつ網羅的に返す使い方を想定しています。

また、政策 PDF や事業一覧表を添付したうえで「この文書の要点を住民向けに整理して」「評価指標だけを抜き出して」といった質問を送ることで、問い合わせ対応、住民説明、議会説明、内部検討のたたき台を作る用途にも向いています。

### iframe 組み込みについて

現時点では、PolicyGOS はアプリ内部で生成 HTML を iframe 表示する構成になっています。Vite / Electron 側にも埋め込みを明示的に禁止する `X-Frame-Options` や `Content-Security-Policy: frame-ancestors` は入っていないため、公開時の hosting 設定で同種の制限を加えなければ、外部サイトへ iframe で組み込むことは可能です。

ただし、現在は iframe 埋め込み専用の軽量ビルドや postMessage API、親サイトとの連携イベントはまだ用意していません。そのため「技術的には埋め込めるが、埋め込み特化の製品形にはまだなっていない」という位置づけです。

## 4. リポジトリ構成

- `policyevaluationGOS/`
  - React + Vite + Electron ベースの frontend
  - prompt-first の composer UI
  - PDF 添付、preview、export、E2E テスト
- `document_ocr_api/`
  - FastAPI ベースの backend
  - PDF 読み込み、OCR fallback、repair、source discovery
- `docs-open/`
  - 公開向けドキュメント

## 5. クイックスタート

### 4.1 frontend 依存関係

```bash
cd policyevaluationGOS
npm install
```

### 4.2 backend 依存関係

```bash
cd document_ocr_api
/opt/homebrew/bin/python3.12 -m venv venv312
source venv312/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install paddlepaddle paddleocr 'paddlex[ocr]'
```

Windows では `py -3.12 -m venv venv312` を使ってください。

### 4.3 推奨起動

```bash
cd policyevaluationGOS
npm run debug:full
```

この起動フローでは backend identity を検証し、ローカル backend は空いている 5 桁 port に自動で立ち上がります。

## 6. よく使うコマンド

```bash
cd policyevaluationGOS
npm run type-check
npm test
npm run build
npx playwright test tests/e2e/workspace-real-pdf.spec.ts
```

## 7. ドキュメント

公開向け文書は `docs-open/` を参照してください。

- `docs-open/overview-ja.md`
- `docs-open/development-ja.md`
- `docs-open/publication-notes-ja.md`

コミュニティ向けファイル:

- `CONTRIBUTING.md`
- `SECURITY.md`

## 8. 注意事項

- 本 OSS はローカル実行を前提としています
- OCR 精度や表構造抽出精度は PDF 品質に依存します
- 一部の flow では Gemini API key など外部 LLM の設定が必要です
- backend の identity を検証しない古い起動方法では、誤った local service に接続する可能性があります

## 9. ライセンス

MIT
