"""
Convenience script to start the CNC Controller FastAPI server
This script handles environment setup and starts the server
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    print("=== CNC Controller Server Startup ===")
    
    # Get the script directory
    script_dir = Path(__file__).parent
    
    # Check if required files exist
    fastapi_server = script_dir / "fastapi_server.py"
    simple_controller = script_dir / "simple_controller.py"
    
    if not fastapi_server.exists():
        print(f"❌ FastAPI server script not found: {fastapi_server}")
        return 1
    
    if not simple_controller.exists():
        print(f"❌ Simple controller script not found: {simple_controller}")
        return 1
    
    # Set default environment variables if not already set
    env_vars = {
        "CNC_SERVER_HOST": "0.0.0.0",
        "CNC_SERVER_PORT": "8001",
    }
    
    for var, default_value in env_vars.items():
        if var not in os.environ:
            os.environ[var] = default_value
            print(f"🔧 Set {var}={default_value}")
    
    # Display configuration
    print(f"🖥️  Server Host: {os.environ['CNC_SERVER_HOST']}")
    print(f"🔌 Server Port: {os.environ['CNC_SERVER_PORT']}")
    print(f"📁 Controller Script: {simple_controller}")
    print(f"🐍 Python Executable: {sys.executable}")
    
    # Check if Mach3 might be running (basic check)
    try:
        import psutil
        mach3_processes = [p for p in psutil.process_iter(['pid', 'name']) 
                          if 'mach' in p.info['name'].lower()]
        if mach3_processes:
            print(f"✅ Found potential Mach3 process: {mach3_processes[0].info['name']}")
        else:
            print("⚠️  No Mach3 process detected - make sure Mach3 is running")
    except ImportError:
        print("ℹ️  Install psutil for process detection: pip install psutil")
    except Exception as e:
        print(f"ℹ️  Could not check for Mach3 process: {e}")
    
    print("\n🚀 Starting CNC Controller FastAPI Server...")
    print("📱 Access the API docs at: http://localhost:8000/docs")
    print("🔗 Health check: http://localhost:8000/health")
    print("🛑 Press Ctrl+C to stop the server\n")
    
    try:
        # Start the FastAPI server
        subprocess.run([
            sys.executable, 
            str(fastapi_server)
        ], cwd=script_dir)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        return 0
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 