@echo off
setlocal

set ROOT_DIR=%~dp0..
set APP_DIR=%ROOT_DIR%\policyevaluationGOS
set BACKEND_DIR=%ROOT_DIR%\document_ocr_api
set BACKEND_VENV=%BACKEND_DIR%\venv312

echo PolicyEval GOS installer

where py >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python launcher ^(py^) が必要です
  exit /b 1
)

cd /d "%APP_DIR%"
call npm install || exit /b 1

cd /d "%BACKEND_DIR%"
if not exist "%BACKEND_VENV%" (
  py -3.12 -m venv "%BACKEND_VENV%" || exit /b 1
)

call "%BACKEND_VENV%\Scripts\activate.bat" || exit /b 1
python -m pip install --upgrade pip || exit /b 1
pip install -r requirements.txt || exit /b 1
pip install paddlepaddle paddleocr "paddlex[ocr]"
if errorlevel 1 (
  echo [WARN] PaddleOCR extras の自動導入に失敗しました。PyMuPDF 主系と Tesseract fallback では動作します。
)

cd /d "%APP_DIR%"
call npm run build || exit /b 1

if not exist "%ROOT_DIR%\logs" mkdir "%ROOT_DIR%\logs"

if not exist "%ROOT_DIR%\.env" (
  (
    echo VITE_OLLAMA_API_URL=http://localhost:11434
    echo VITE_OLLAMA_MODEL=gemma3:27b
    echo # Optional override. Leave unset for the verified random-port startup flow.
    echo # POLICYEVAL_BACKEND_URL=http://127.0.0.1:8000
  ) > "%ROOT_DIR%\.env"
)

(
echo @echo off
echo set PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
echo cd /d "%APP_DIR%"
echo call npm run debug:full
) > "%ROOT_DIR%\start.bat"

echo Complete
echo recommended startup: cd /d "%APP_DIR%" ^&^& npm run debug:full
echo external backend override: set POLICYEVAL_BACKEND_URL before startup after verifying the backend target
pause
