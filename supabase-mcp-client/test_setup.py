#!/usr/bin/env python3
"""
Simple test script to verify the setup is working correctly
"""

import os
import sys
from dotenv import load_dotenv

print("=== Supabase MCP Client Setup Test ===\n")

# Load environment variables
load_dotenv()

# Check Python version
print(f"Python version: {sys.version}")

# Check if required environment variables are set
api_key = os.getenv("ANTHROPIC_API_KEY")
supabase_pat = os.getenv("SUPABASE_PAT")

if api_key:
    print(f"✓ ANTHROPIC_API_KEY is set (length: {len(api_key)})")
else:
    print("✗ ANTHROPIC_API_KEY is not set")

if supabase_pat:
    print(f"✓ SUPABASE_PAT is set (length: {len(supabase_pat)})")
else:
    print("✗ SUPABASE_PAT is not set")

# Try to import required packages
print("\nChecking required packages:")
try:
    import anthropic
    print("✓ anthropic package is installed")
except ImportError:
    print("✗ anthropic package is not installed")

try:
    import mcp
    print("✓ mcp package is installed")
except ImportError:
    print("✗ mcp package is not installed")

try:
    import dotenv
    print("✓ python-dotenv package is installed")
except ImportError:
    print("✗ python-dotenv package is not installed")

# Check if npx is available (required for Supabase MCP server)
import subprocess
try:
    result = subprocess.run(['npx', '--version'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"\n✓ npx is installed (version: {result.stdout.strip()})")
    else:
        print("\n✗ npx is not installed or not in PATH")
except FileNotFoundError:
    print("\n✗ npx is not installed or not in PATH")

print("\n=== Setup test complete ===")
print("\nTo run the main application, use: python client.py")
