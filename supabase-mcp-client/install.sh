#!/bin/bash
# Installation script for Supabase MCP Client

echo "=== Installing Supabase MCP Client Dependencies ==="
echo

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

echo "Python version:"
python3 --version
echo

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "Error: pip3 is not installed. Please install pip3."
    exit 1
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

# Check if Node.js and npm are installed
if ! command -v node &> /dev/null; then
    echo
    echo "Warning: Node.js is not installed. The Supabase MCP server requires Node.js."
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or use Homebrew: brew install node"
else
    echo
    echo "Node.js version:"
    node --version
    echo "npm version:"
    npm --version
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo
    echo "Warning: npx is not available. Installing it globally..."
    npm install -g npx
fi

echo
echo "=== Installation complete ==="
echo
echo "Next steps:"
echo "1. Make sure your .env file contains your API keys"
echo "2. Run: python3 client.py"
echo
