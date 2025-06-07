"""
FastAPI Server for CNC Controller
Receives G-code URLs and triggers Mach3 automation via simple_controller.py
"""

import os
import sys
import subprocess
import logging
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('cnc_server.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# FastAPI app instance
app = FastAPI(
    title="CNC Controller API",
    description="API server for triggering Mach3 CNC operations via G-code URLs",
    version="1.0.0"
)

# Pydantic models for request/response
class GcodeRequest(BaseModel):
    url: HttpUrl
    description: Optional[str] = None

class GcodeResponse(BaseModel):
    success: bool
    message: str
    job_id: Optional[str] = None
    error: Optional[str] = None

# Configuration
CONTROLLER_SCRIPT = Path(__file__).parent / "simple_controller.py"
PYTHON_EXECUTABLE = sys.executable

# Global job tracking (simple in-memory store)
active_jobs = {}

def validate_gcode_url(url: str) -> bool:
    """Validate that the URL appears to be a valid G-code file URL"""
    try:
        parsed = urlparse(url)
        
        # Check if it's a proper URL
        if not parsed.scheme in ['http', 'https']:
            return False
        
        # Check if it has a valid hostname
        if not parsed.netloc:
            return False
        
        # Check if it looks like a G-code file (optional check)
        path = parsed.path.lower()
        if path.endswith('.gcode') or path.endswith('.nc') or path.endswith('.tap'):
            return True
        
        # Allow URLs without extension (some storage services don't show extensions)
        return True
        
    except Exception:
        return False

def run_controller_script(gcode_url: str, job_id: str):
    """Run the simple_controller.py script with the G-code URL"""
    try:
        logger.info(f"Starting CNC job {job_id} with URL: {gcode_url}")
        active_jobs[job_id] = {"status": "running", "url": gcode_url}
        
        # Run the controller script
        result = subprocess.run(
            [PYTHON_EXECUTABLE, str(CONTROLLER_SCRIPT), gcode_url],
            capture_output=True,
            text=True,
            timeout=1800  # 30 minute timeout
        )
        
        if result.returncode == 0:
            logger.info(f"CNC job {job_id} completed successfully")
            active_jobs[job_id] = {"status": "completed", "url": gcode_url}
        else:
            logger.error(f"CNC job {job_id} failed: {result.stderr}")
            active_jobs[job_id] = {"status": "failed", "url": gcode_url, "error": result.stderr}
            
    except subprocess.TimeoutExpired:
        logger.error(f"CNC job {job_id} timed out")
        active_jobs[job_id] = {"status": "timeout", "url": gcode_url}
    except Exception as e:
        logger.error(f"CNC job {job_id} error: {str(e)}")
        active_jobs[job_id] = {"status": "error", "url": gcode_url, "error": str(e)}

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "CNC Controller API is running", "status": "healthy"}

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "controller_script_exists": CONTROLLER_SCRIPT.exists(),
        "python_executable": PYTHON_EXECUTABLE,
        "active_jobs": len(active_jobs)
    }

@app.get("/run-gcode")
async def run_gcode_get(url: str, background_tasks: BackgroundTasks):
    """
    Trigger G-code execution via GET request (for simple integration)
    
    Parameters:
    - url: The URL of the G-code file to download and run
    """
    try:
        # Validate the URL
        if not validate_gcode_url(url):
            raise HTTPException(status_code=400, detail="Invalid G-code URL format")
        
        # Check if controller script exists
        if not CONTROLLER_SCRIPT.exists():
            raise HTTPException(
                status_code=500, 
                detail=f"Controller script not found at {CONTROLLER_SCRIPT}"
            )
        
        # Generate job ID
        import time
        job_id = f"job_{int(time.time())}"
        
        # Start the controller script in background
        background_tasks.add_task(run_controller_script, url, job_id)
        
        logger.info(f"Received G-code run request: {url} (Job ID: {job_id})")
        
        return GcodeResponse(
            success=True,
            message="G-code job started successfully",
            job_id=job_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing G-code request: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.post("/run-gcode")
async def run_gcode_post(request: GcodeRequest, background_tasks: BackgroundTasks):
    """
    Trigger G-code execution via POST request (for structured data)
    """
    return await run_gcode_get(str(request.url), background_tasks)

@app.get("/job-status/{job_id}")
async def get_job_status(job_id: str):
    """Get the status of a specific job"""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return active_jobs[job_id]

@app.get("/jobs")
async def list_jobs():
    """List all jobs and their statuses"""
    return {"jobs": active_jobs}

@app.delete("/jobs")
async def clear_jobs():
    """Clear job history"""
    active_jobs.clear()
    return {"message": "Job history cleared"}

if __name__ == "__main__":
    # Get configuration from environment variables
    host = os.getenv("CNC_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("CNC_SERVER_PORT", "8000"))
    
    logger.info(f"Starting CNC Controller API server on {host}:{port}")
    logger.info(f"Controller script path: {CONTROLLER_SCRIPT}")
    logger.info(f"Python executable: {PYTHON_EXECUTABLE}")
    
    # Run the server
    uvicorn.run(
        "fastapi_server:app",
        host=host,
        port=port,
        reload=False,  # Disable reload in production
        log_level="info"
    ) 