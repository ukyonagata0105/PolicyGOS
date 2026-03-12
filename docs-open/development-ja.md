# PolicyGOS 開発手順

## 前提

- Node.js 18+
- Python 3.12

## frontend

```bash
cd policyevaluationGOS
npm install
```

## backend

```bash
cd document_ocr_api
/opt/homebrew/bin/python3.12 -m venv venv312
source venv312/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install paddlepaddle paddleocr 'paddlex[ocr]'
```

## 推奨起動

```bash
cd policyevaluationGOS
npm run debug:full
```

この起動は backend identity を確認し、ローカル backend を空いている 5 桁 port で起動します。

## 検証

```bash
cd policyevaluationGOS
npm run type-check
npm test
npm run build
npx playwright test tests/e2e/workspace-real-pdf.spec.ts
```
