#!/bin/bash

# ============================================================================
# Ollama Installation Script
# ============================================================================
# This script installs Ollama on macOS or Linux.
# Ollama is required to run local LLM models like Gemma.
# ============================================================================

set -e

echo "========================================"
echo "Ollama Installation Script"
echo "========================================"
echo ""

# Detect OS
OS="$(uname -s)"
case "${OS}" in
    Linux*)     MACHINE=Linux;;
    Darwin*)    MACHINE=Mac;;
    *)          MACHINE="UNKNOWN:${OS}"
esac

echo "Detected OS: ${MACHINE}"
echo ""

# Install Ollama based on OS
if [[ "${MACHINE}" == "Mac" ]]; then
    echo "Installing Ollama for macOS..."
    if command -v brew &> /dev/null; then
        brew install ollama
    else
        echo "Homebrew not found. Installing Ollama directly..."
        curl -fsSL https://ollama.com/install.sh | sh
    fi
elif [[ "${MACHINE}" == "Linux" ]]; then
    echo "Installing Ollama for Linux..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "Unsupported OS. Please install Ollama manually from https://ollama.com"
    exit 1
fi

echo ""
echo "========================================"
echo "Installation complete!"
echo "========================================"
echo ""
echo "Start Ollama service:"
echo "  macOS: Run 'ollama serve' or start from Applications"
echo "  Linux: Run 'ollama serve' or 'systemctl start ollama'"
echo ""
echo "Verify installation:"
echo "  ollama --version"
echo ""
