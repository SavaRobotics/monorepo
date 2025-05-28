#!/usr/bin/env python3
"""Save nested output to a permanent location."""

import os
import shutil
from datetime import datetime

# Create output directory
output_dir = "/Users/alessiotoniolo/Desktop/monorepo/brain/nesting_output"
os.makedirs(output_dir, exist_ok=True)

# The temporary file path from the last run
temp_path = "/var/folders/1t/8ngzykv932j4c8gkq49r77100000gn/T/tmpmj2x9z7i/nested_layout.dxf"

if os.path.exists(temp_path):
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    permanent_path = os.path.join(output_dir, f"nested_layout_{timestamp}.dxf")
    
    # Copy file
    shutil.copy2(temp_path, permanent_path)
    print(f"✅ Nested DXF saved to: {permanent_path}")
    print(f"   File size: {os.path.getsize(permanent_path):,} bytes")
else:
    print("❌ Temporary file no longer exists. Running a new nesting operation...")
    
    # Run a quick nesting to generate a new file
    import asyncio
    import tempfile
    from pathlib import Path
    from dotenv import load_dotenv
    from supabase import create_client
    import httpx
    import sys
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from mcp_servers.nesting.nest import DXFNester
    
    load_dotenv()
    
    async def download_and_nest():
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        supabase = create_client(url, key)
        
        # Get DXF URLs
        result = supabase.table("parts").select("dxf_url").not_.is_("dxf_url", "null").limit(3).execute()
        dxf_urls = [part['dxf_url'] for part in result.data if part.get('dxf_url')]
        
        # Download files
        with tempfile.TemporaryDirectory() as temp_dir:
            downloaded_files = []
            async with httpx.AsyncClient(timeout=30.0) as client:
                for i, url in enumerate(dxf_urls):
                    filepath = os.path.join(temp_dir, f"part_{i}.dxf")
                    response = await client.get(url)
                    with open(filepath, 'wb') as f:
                        f.write(response.content)
                    downloaded_files.append(filepath)
            
            # Run nesting
            nester = DXFNester(sheet_width=1000, sheet_height=500, spacing=2.0)
            os.environ['OUTPUT_DIR'] = output_dir
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            os.environ['OUTPUT_NAME'] = f'nested_layout_{timestamp}'
            
            result = nester.nest_parts(downloaded_files)
            
            if result.get('nested_dxf'):
                print(f"✅ New nested DXF generated: {result['nested_dxf']}")
                print(f"   Utilization: {result['utilization']:.1f}%")
                print(f"   Parts placed: {result.get('placed_count', 0)}")
    
    asyncio.run(download_and_nest())