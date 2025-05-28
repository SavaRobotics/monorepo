#!/usr/bin/env python3
"""Demonstration of the multi-step nesting workflow."""

import os
import json
import tempfile
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
import httpx

# Load environment variables
load_dotenv()

# Add the brain directory to Python path
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from mcp_servers.nesting.nest import DXFNester

async def download_dxf(url: str, filepath: str):
    """Download a DXF file from URL."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        with open(filepath, 'wb') as f:
            f.write(response.content)

async def demo_workflow():
    """Demonstrate the complete nesting workflow."""
    print("🤖 LLM Nesting Coordinator Demo")
    print("=" * 60)
    print("\nI am an LLM with access to two MCP servers:")
    print("1. Supabase MCP - for querying the parts database")
    print("2. Nesting MCP - for arranging DXF parts on sheets\n")
    
    # Step 1: Query Supabase
    print("📊 Step 1: Querying parts table for DXF URLs...")
    print("   Executing: SELECT id, dxf_url FROM parts WHERE dxf_url IS NOT NULL")
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("❌ Error: Missing Supabase credentials")
        return
    
    supabase = create_client(url, key)
    
    try:
        # Query parts table
        result = supabase.table("parts").select("id, dxf_url, part_name").not_.is_("dxf_url", "null").execute()
        
        if not result.data:
            print("❌ No parts with DXF URLs found")
            return
        
        print(f"\n✅ Found {len(result.data)} parts with DXF URLs:")
        
        # Count URLs for quantity tracking
        url_counts = {}
        for part in result.data:
            dxf_url = part.get('dxf_url')
            if dxf_url:
                url_counts[dxf_url] = url_counts.get(dxf_url, 0) + 1
                print(f"   - Part {part['id']}: {part.get('part_name', 'Unnamed')} -> {Path(dxf_url).name}")
        
        # Step 2: Process URLs for quantities
        print(f"\n📦 Step 2: Processing quantities...")
        dxf_urls = []
        for url, count in url_counts.items():
            dxf_urls.extend([url] * count)
            if count > 1:
                print(f"   - {Path(url).name} appears {count} times (quantity: {count})")
        
        # Add some duplicates for demo
        if len(dxf_urls) > 0:
            print(f"   - Adding 2 more of {Path(dxf_urls[0]).name} for demo")
            dxf_urls.extend([dxf_urls[0], dxf_urls[0]])
        
        print(f"\n   Total parts to nest: {len(dxf_urls)}")
        
        # Step 3: Call nesting service
        print(f"\n🔧 Step 3: Calling nesting service...")
        print(f"   Parameters: sheet_width=1000mm, sheet_height=500mm, spacing=2mm")
        
        # Create temp directory for downloads
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download DXF files
            print("\n   Downloading DXF files...")
            downloaded_files = []
            
            for i, url in enumerate(dxf_urls):
                filename = f"part_{i}_{Path(url).name}"
                if not filename.endswith('.dxf'):
                    filename += '.dxf'
                
                filepath = os.path.join(temp_dir, filename)
                
                try:
                    await download_dxf(url, filepath)
                    downloaded_files.append(filepath)
                    print(f"   ✅ Downloaded {filename}")
                except Exception as e:
                    print(f"   ❌ Failed to download: {e}")
            
            # Run nesting
            print(f"\n   Running nesting algorithm on {len(downloaded_files)} files...")
            nester = DXFNester(sheet_width=1000, sheet_height=500, spacing=2.0)
            
            # Set output directory
            output_dir = tempfile.mkdtemp()
            os.environ['OUTPUT_DIR'] = output_dir
            
            result = nester.nest_parts(downloaded_files)
            
            # Step 4: Report results
            print("\n" + "="*60)
            print("📊 FINAL REPORT")
            print("="*60)
            print(f"\nNesting operation completed successfully!")
            print(f"\n🎯 Results:")
            print(f"   - Sheet utilization: {result['utilization']:.1f}%")
            print(f"   - Parts placed: {result.get('placed_count', 0)} out of {len(dxf_urls)}")
            print(f"   - Parts that didn't fit: {len(result.get('unfittable_parts', []))}")
            
            if result.get('nested_dxf'):
                print(f"\n📄 Output:")
                print(f"   - Nested DXF file: {result['nested_dxf']}")
                if os.path.exists(result['nested_dxf']):
                    size = os.path.getsize(result['nested_dxf'])
                    print(f"   - File size: {size:,} bytes")
            
            if result['utilization'] < 50:
                print(f"\n💡 Recommendation: With {result['utilization']:.1f}% utilization, "
                      f"you might want to use a smaller sheet or add more parts.")
            
            print("\n✅ Workflow completed successfully!")
            
    except Exception as e:
        print(f"\n❌ Error during workflow: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 Starting Nesting Workflow Demo\n")
    asyncio.run(demo_workflow())