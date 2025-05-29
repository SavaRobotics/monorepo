"""FastAPI endpoints for DXF to G-code conversion"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
import tempfile
import os
from pathlib import Path

from ..main import DXFToGCodeProcessor

app = FastAPI(title="DXF to Mach3 G-code Converter")

class ProcessingConfig(BaseModel):
    material: str = "aluminum"
    thickness: float = 3.0
    tool_diameter: float = 6.35
    enable_tabs: bool = True
    spindle_speed: Optional[int] = 24000

@app.get("/")
async def root():
    return {
        "service": "DXF to Mach3 G-code Converter",
        "version": "1.0.0",
        "materials": ["aluminum", "galvanized_steel"]
    }

@app.post("/convert")
async def convert_dxf(
    file: UploadFile = File(...),
    material: str = "aluminum",
    thickness: float = 3.0,
    tool_diameter: float = 6.35,
    enable_tabs: bool = True
):
    """Convert uploaded DXF file to Mach3 G-code"""
    
    # Validate file extension
    if not file.filename.lower().endswith('.dxf'):
        raise HTTPException(status_code=400, detail="File must be a DXF")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix='.dxf') as tmp_dxf:
        content = await file.read()
        tmp_dxf.write(content)
        tmp_dxf_path = tmp_dxf.name
    
    try:
        # Process DXF
        processor = DXFToGCodeProcessor(material, tool_diameter)
        result = processor.process_dxf(tmp_dxf_path, thickness, enable_tabs)
        
        if result["success"]:
            # Save G-code to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.nc', mode='w') as tmp_gcode:
                tmp_gcode.write(result["gcode"])
                tmp_gcode_path = tmp_gcode.name
            
            # Return G-code file
            return FileResponse(
                tmp_gcode_path,
                media_type='text/plain',
                filename=f"{Path(file.filename).stem}_mach3.nc",
                headers={
                    "X-Parts-Count": str(result["stats"]["parts_count"]),
                    "X-Material": material,
                    "X-Thickness": str(thickness)
                }
            )
        else:
            raise HTTPException(status_code=500, detail="Processing failed")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temporary files
        if os.path.exists(tmp_dxf_path):
            os.unlink(tmp_dxf_path)

@app.post("/preview")
async def preview_toolpaths(
    file: UploadFile = File(...),
    config: ProcessingConfig = ProcessingConfig()
):
    """Generate toolpath preview data without G-code"""
    
    if not file.filename.lower().endswith('.dxf'):
        raise HTTPException(status_code=400, detail="File must be a DXF")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.dxf') as tmp_dxf:
        content = await file.read()
        tmp_dxf.write(content)
        tmp_dxf_path = tmp_dxf.name
    
    try:
        processor = DXFToGCodeProcessor(config.material, config.tool_diameter)
        # This would return toolpath data for visualization
        # Implementation would need to be added to main.py
        
        return JSONResponse({
            "status": "success",
            "message": "Preview generation not yet implemented"
        })
        
    finally:
        if os.path.exists(tmp_dxf_path):
            os.unlink(tmp_dxf_path)

@app.get("/materials")
async def get_materials():
    """Get available materials and their settings"""
    from ..materials.database import MATERIAL_DATABASE
    
    materials = {}
    for mat_key, mat_data in MATERIAL_DATABASE.items():
        materials[mat_key] = {
            "display_name": mat_data["display_name"],
            "operations": list(mat_data["operations"].keys()),
            "default_thickness": 3.0
        }
    
    return materials

@app.get("/health")
async def health_check():
    return {"status": "healthy"}