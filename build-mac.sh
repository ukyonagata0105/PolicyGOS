#!/bin/bash

echo "========================================="
echo "  PolicyEval GOS macOS Dev/Build Script  "
echo "========================================="

set -e

ROOT_DIR=$(pwd)
BACKEND_DIR="$ROOT_DIR/document_ocr_api"
FRONTEND_DIR="$ROOT_DIR/policyevaluationGOS"

echo ""
echo "[1/3] Setting up and building Backend (Python)..."
cd "$BACKEND_DIR"

# Check if venv exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv and install dependencies
echo "Installing backend dependencies..."
source venv/bin/activate
pip install -r requirements.txt
pip install pyinstaller

# Run PyInstaller script
echo "Building backend executable..."
python build_backend.py

# Deactivate venv
deactivate

echo ""
echo "[2/3] Setting up and building Frontend (React/Electron)..."
cd "$FRONTEND_DIR"

# We need to copy the built backend into the Electron resources folder
RESOURCES_DIR="$FRONTEND_DIR/resources"
mkdir -p "$RESOURCES_DIR"

BACKEND_SRC="$BACKEND_DIR/dist/backend"
BACKEND_DEST="$RESOURCES_DIR/backend"

echo "Copying backend executable to frontend resources..."
if [ -d "$BACKEND_DEST" ]; then
    rm -rf "$BACKEND_DEST"
fi
cp -R "$BACKEND_SRC" "$BACKEND_DEST"

echo "Installing frontend dependencies..."
npm install

echo ""
echo "[3/3] Running Electron Application (Development Mode)..."
# Start the app in dev mode to test it on Mac
npm run electron:dev

# If you want to package it for Mac instead of just running it, use:
# npm run electron:build
# This will create a .dmg or .app in policyevaluationGOS/release

echo ""
echo "========================================="
echo "  Script Complete!                       "
echo "========================================="

cd "$ROOT_DIR"
