#!/bin/bash

# ============================================================================
# Gemma Models Pull Script
# ============================================================================
# This script downloads the required Gemma models from Ollama:
# - gemma:27b - For high-quality data structuring (default model)
# - gemma:3b  - For UI generation tasks (lightweight model)
# ============================================================================
# Make sure Ollama is running before executing this script.
# ============================================================================

set -e

echo "========================================"
echo "Gemma Models Pull Script"
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

echo "Ollama is running."
echo ""

# Pull gemma:27b model (primary model for data structuring)
echo "========================================"
echo "Pulling gemma:27b model..."
echo "========================================"
echo "This is the primary model for data structuring."
echo "Size: ~16GB"
echo "This may take 10-20 minutes depending on your connection..."
echo ""

ollama pull gemma:27b

echo ""
echo "gemma:27b pull complete!"
echo ""

# Pull gemma:3b model (lightweight model for UI generation)
echo "========================================"
echo "Pulling gemma:3b model..."
echo "========================================"
echo "This is a lightweight model for UI generation tasks."
echo "Size: ~2GB"
echo ""

ollama pull gemma:3b

echo ""
echo "gemma:3b pull complete!"
echo ""

# Display available models
echo "========================================"
echo "All models pulled successfully!"
echo "========================================"
echo ""
echo "Available models:"
ollama list
echo ""
echo "========================================"
echo "Model Summary"
echo "========================================"
echo "• gemma:27b - Use for data structuring (default)"
echo "• gemma:3b  - Use for UI generation"
echo ""
echo "Test gemma:27b:"
echo "  ollama run gemma:27b"
echo ""
echo "Test gemma:3b:"
echo "  ollama run gemma:3b"
echo ""
