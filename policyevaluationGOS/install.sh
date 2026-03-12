#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${ROOT_DIR}/policyevaluationGOS"
BACKEND_DIR="${ROOT_DIR}/document_ocr_api"
BACKEND_VENV="${BACKEND_DIR}/venv312"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

pick_python() {
  if command -v python3.12 >/dev/null 2>&1; then
    command -v python3.12
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi
  return 1
}

echo -e "${GREEN}PolicyEval GOS installer${NC}"

PYTHON_BIN="$(pick_python)" || {
  echo -e "${RED}Python 3.12 もしくは python3 が必要です${NC}"
  exit 1
}

echo -e "${YELLOW}Using Python: ${PYTHON_BIN}${NC}"

cd "${APP_DIR}"
npm install

cd "${BACKEND_DIR}"
if [ ! -d "${BACKEND_VENV}" ]; then
  "${PYTHON_BIN}" -m venv "${BACKEND_VENV}"
fi

source "${BACKEND_VENV}/bin/activate"
python -m pip install --upgrade pip
pip install -r requirements.txt

if ! pip install paddlepaddle paddleocr 'paddlex[ocr]'; then
  echo -e "${YELLOW}PaddleOCR extras の自動導入に失敗しました。PyMuPDF 主系と Tesseract fallback では動作します。${NC}"
fi

cd "${APP_DIR}"
npm run build

mkdir -p "${ROOT_DIR}/logs"

cat > "${ROOT_DIR}/start.sh" <<'EOF'
#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="${PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:-True}"
cd "${ROOT_DIR}/policyevaluationGOS"
npm run debug:full
EOF
chmod +x "${ROOT_DIR}/start.sh"

if [ ! -f "${ROOT_DIR}/.env" ]; then
  cat > "${ROOT_DIR}/.env" <<'EOF'
VITE_OLLAMA_API_URL=http://localhost:11434
VITE_OLLAMA_MODEL=gemma3:27b
# Optional override. Leave unset for the verified random-port startup flow.
# POLICYEVAL_BACKEND_URL=http://127.0.0.1:8000
EOF
fi

echo -e "${GREEN}完了${NC}"
echo "recommended startup: cd ${APP_DIR} && npm run debug:full"
echo "external backend override: set POLICYEVAL_BACKEND_URL before startup after verifying the backend target"
