# Document OCR Backend

この backend は PolicyEval GOS 向けの document ingestion / OCR API です。現行実装は `PyMuPDF + PaddleOCR` を使います。

## 役割

- born-digital PDF の高速抽出
- 画像 PDF / 画像入力の OCR
- normalized JSON / markdown / csv の返却
- frontend から利用する async job API の提供

## 抽出戦略

1. `PyMuPDF`
   - plain text
   - layout text
   - `page.find_tables()` による表候補
2. `PaddleOCR`
   - 画像入力
   - text extraction fallback
3. `Tesseract`
   - PaddleOCR が使えない環境での最後の fallback

## 必要条件

- Python 3.12
- `pip install -r requirements.txt`
- 推奨:

```bash
pip install paddlepaddle paddleocr 'paddlex[ocr]'
```

## 起動

```bash
python main.py
```

または:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

## 主な endpoint

- `GET /health`
- `GET /ready`
- `GET /formats`
- `POST /analyze`
- `POST /analyze/async`
- `GET /jobs/{job_id}`

## JSON shape

`output_format=json` は normalized document shape を返します。

```json
{
  "schema_version": "ocr-backend-v1",
  "classification": "digital_text_pdf",
  "path_used": "pdf_text_fast_path",
  "engine": {
    "primary": "pymupdf",
    "ocr": "paddleocr"
  },
  "pages": [
    {
      "page_number": 1,
      "text": "...",
      "layout_text": "...",
      "text_blocks": [],
      "tables": []
    }
  ]
}
```

## 運用メモ

- `PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True` を既定で使うと model host connectivity check を短絡できます
- 初回の PaddleOCR / PP-Structure 系起動では model download が走ることがあります
- frontend 側の debug script は `policyevaluationGOS/scripts/debug-yomitoku-json.mjs` を使います
