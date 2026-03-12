#!/bin/bash

# ============================================================================
# Gemma Model Pull Script
# ============================================================================
# This script downloads the gemma:3b model from Ollama.
# Make sure Ollama is running before executing this script.
# ============================================================================

set -e

echo "========================================"
echo "Gemma Model Pull Script"
echo "========================================"
echo ""

# Check if Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Error: Ollama is not running!"
    echo "Please start Ollama first:"
    echo "  ollama serve"
    echo ""
    exit 1
fi

echo "Ollama is running. Pulling gemma:3b model..."
echo ""
echo "This may take a few minutes depending on your connection..."
echo ""

# Pull gemma:3b model
ollama pull gemma:3b

echo ""
echo "========================================"
echo "Model pull complete!"
echo "========================================"
echo ""
echo "Available models:"
ollama list
echo ""
echo "Test the model:"
echo "  ollama run gemma:3b"
echo ""
