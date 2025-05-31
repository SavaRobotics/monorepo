#!/usr/bin/env python3
"""
🔥🔥🔥 SIMPLIFIED OBNOXIOUS UNFOLDER TEST 🔥🔥🔥
This bypasses the TypeScript build issues and tests the unfolder directly
"""

import os
import sys
import json
import asyncio
import tempfile
from pathlib import Path
import httpx
from datetime import datetime

# Add the unfolder server directory to path
sys.path.insert(0, '/Users/alessiotoniolo/Desktop/monorepo/brain/src/mcp_servers/unfolder')

# Import the unfolder functions directly
from server import unfold_step_file, upload_to_supabase_storage

print("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")
print("🚀 STARTING THE PYTHON DIRECT UNFOLDER TEST 🚀")
print("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")

STEP_FILE_URL = 'https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/stepfiles/test.step'
K_FACTOR = 0.38
TARGET_BUCKET = 'dxffiles'

async def test_unfolder_workflow():
    print(f"\n💥💥💥 TESTING UNFOLDER WORKFLOW 💥💥💥")
    print(f"📁 STEP FILE URL: {STEP_FILE_URL}")
    print(f"⚙️  K-FACTOR: {K_FACTOR}")
    print(f"🪣 TARGET BUCKET: {TARGET_BUCKET}")

    # Check environment variables
    print("\n🔍 CHECKING ENVIRONMENT VARIABLES...")
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_KEY')
    
    if not supabase_url or not supabase_key:
        print("❌💀 MISSING SUPABASE CREDENTIALS! 💀❌")
        print("Make sure SUPABASE_URL and SUPABASE_KEY are set in your environment")
        return False
    
    print("✅ SUPABASE credentials found")
    
    # Set environment variables for the unfolder
    os.environ['SUPABASE_URL'] = supabase_url
    os.environ['SUPABASE_KEY'] = supabase_key
    os.environ['OUTPUT_DIR'] = '/tmp/unfolder_output'
    os.environ['K_FACTOR'] = str(K_FACTOR)
    
    try:
        # STEP 1: UNFOLD THE STEP FILE
        print("\n" + "="*80)
        print("🥇 STEP 1: UNFOLDING THE LEGENDARY STEP FILE")
        print("="*80)
        
        print("🔥 CALLING unfold_step_file function directly...")
        unfold_result = await unfold_step_file(
            step_url=STEP_FILE_URL,
            k_factor=K_FACTOR
        )
        
        print("📊 UNFOLD RESULT:")
        print(json.dumps(unfold_result, indent=2))
        
        if not unfold_result.get('success'):
            print("❌💀 UNFOLD FAILED! 💀❌")
            print(f"Error: {unfold_result.get('error')}")
            return False
        
        print("✅🎉 UNFOLD SUCCESS! 🎉✅")
        dxf_path = unfold_result['dxf_path']
        print(f"📁 DXF PATH: {dxf_path}")
        
        # STEP 2: UPLOAD TO SUPABASE
        print("\n" + "="*80)
        print("🥈 STEP 2: UPLOADING DXF TO SUPABASE")
        print("="*80)
        
        print("🔥 CALLING upload_to_supabase_storage function directly...")
        upload_result = await upload_to_supabase_storage(
            dxf_path=dxf_path,
            bucket_name=TARGET_BUCKET
        )
        
        print("📊 UPLOAD RESULT:")
        print(json.dumps(upload_result, indent=2))
        
        if not upload_result.get('success'):
            print("❌💀 UPLOAD FAILED! 💀❌")
            print(f"Error: {upload_result.get('error')}")
            return False
        
        print("✅🎉 UPLOAD SUCCESS! 🎉✅")
        public_url = upload_result['public_url']
        print(f"🌐 PUBLIC URL: {public_url}")
        
        # FINAL RESULTS
        print("\n" + "🏆"*40)
        print("🏆 WORKFLOW COMPLETED SUCCESSFULLY! 🏆")
        print("🏆"*40)
        
        print("\n📋 FINAL RESULTS SUMMARY:")
        print(f"✅ STEP FILE: {STEP_FILE_URL}")
        print(f"✅ DXF CREATED: {unfold_result['filename']}")
        print(f"✅ DXF UPLOADED: {public_url}")
        print(f"✅ BUCKET: {upload_result['bucket']}")
        print(f"✅ FILE SIZE: {upload_result['file_size']} bytes")
        
        print("\n🎊🎊🎊 PYTHON DIRECT TEST TRIUMPHED! 🎊🎊🎊")
        return True
        
    except Exception as e:
        print(f"\n💀💀💀 CATASTROPHIC FAILURE! 💀💀💀")
        print(f"💥 ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🔥 STARTING ASYNC TEST...")
    success = asyncio.run(test_unfolder_workflow())
    
    if success:
        print("\n🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")
        print("🎉 PYTHON DIRECT UNFOLDER TEST COMPLETED SUCCESSFULLY! 🎉")
        print("🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥")
        sys.exit(0)
    else:
        print("\n💀💀💀 TEST FAILED! 💀💀💀")
        sys.exit(1)