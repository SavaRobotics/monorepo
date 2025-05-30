from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import shutil
from datetime import datetime
from typing import Optional
import logging

from .config import (
    app_config, 
    ConversionRequest, 
    MaterialConfig, 
    ToolConfig, 
    TabConfig,
    CuttingConfig,
    DXFProcessingConfig
)
from .dxf_processor import DXFProcessor
from .toolpath_generator import ToolpathGenerator
from .gcode_exporter import GCodeExporter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title=app_config.app_name,
    version=app_config.version,
    description="Convert nested DXF files to G-code for CNC routing"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure temp directory exists
os.makedirs(app_config.temp_dir, exist_ok=True)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": app_config.app_name,
        "version": app_config.version,
        "endpoints": {
            "convert": "/convert",
            "validate": "/validate",
            "materials": "/materials",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.get("/materials")
async def get_materials():
    """Get available material presets"""
    return {
        "presets": app_config.material_presets,
        "material_types": ["plywood", "mdf", "aluminum", "acrylic", "steel", "custom"]
    }

@app.post("/validate")
async def validate_dxf(file: UploadFile = File(...)):
    """Validate a DXF file"""
    if not file.filename.lower().endswith('.dxf'):
        raise HTTPException(status_code=400, detail="File must be a DXF file")
    
    # Save uploaded file temporarily
    temp_path = os.path.join(app_config.temp_dir, f"validate_{file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process DXF
        processor = DXFProcessor()
        result = processor.load_dxf(temp_path, layer_filter="LargestFace")
        
        return {
            "valid": True,
            "filename": file.filename,
            "parts_count": result["parts_count"],
            "sheet_boundary": result["sheet_boundary"],
            "layers": result["layers"],
            "total_entities": result["total_entities"]
        }
        
    except Exception as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid DXF file: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/convert")
async def convert_dxf_to_gcode(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    material_preset: Optional[str] = None,
    material_thickness: Optional[float] = None,
    feed_rate: Optional[float] = None,
    spindle_speed: Optional[int] = None,
    tool_diameter: Optional[float] = None,
    enable_tabs: bool = True,
    tab_height: Optional[float] = None,
    tab_width: Optional[float] = None,
    tab_spacing: Optional[float] = None,
    corner_exclusion_zone: Optional[float] = None,
    corner_angle_threshold: Optional[float] = None,
    output_format: str = "linuxcnc"
):
    """Convert DXF file to G-code"""
    
    if not file.filename.lower().endswith('.dxf'):
        raise HTTPException(status_code=400, detail="File must be a DXF file")
    
    # Generate unique filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    input_filename = f"input_{timestamp}_{file.filename}"
    output_filename = f"output_{timestamp}_{file.filename.replace('.dxf', '.gcode')}"
    
    input_path = os.path.join(app_config.temp_dir, input_filename)
    output_path = os.path.join(app_config.temp_dir, output_filename)
    
    try:
        # Save uploaded file
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Configure material settings
        if material_preset and material_preset in app_config.material_presets:
            material_config = app_config.material_presets[material_preset].model_copy()
        else:
            material_config = MaterialConfig()
        
        # Override with custom values if provided
        if material_thickness is not None:
            material_config.thickness = material_thickness
        if feed_rate is not None:
            material_config.feed_rate = feed_rate
        if spindle_speed is not None:
            material_config.spindle_speed = spindle_speed
        
        # Configure tool settings
        tool_config = ToolConfig()
        if tool_diameter is not None:
            tool_config.diameter = tool_diameter
        
        # Configure tab settings
        tab_config = TabConfig(enabled=enable_tabs)
        if tab_height is not None:
            tab_config.height = tab_height
        if tab_width is not None:
            tab_config.width = tab_width
        if tab_spacing is not None:
            tab_config.spacing = tab_spacing
        if corner_exclusion_zone is not None:
            tab_config.corner_exclusion_zone = corner_exclusion_zone
        if corner_angle_threshold is not None:
            tab_config.corner_angle_threshold = corner_angle_threshold
        
        # Create cutting configuration
        cutting_config = CuttingConfig(
            material=material_config,
            tool=tool_config,
            tabs=tab_config
        )
        
        # Process DXF
        logger.info(f"Processing DXF file: {input_filename}")
        processor = DXFProcessor()
        dxf_info = processor.load_dxf(input_path, layer_filter="LargestFace")
        
        if not processor.parts:
            raise HTTPException(status_code=400, detail="No parts found in DXF file")
        
        # Generate toolpaths
        logger.info("Generating toolpaths")
        toolpath_generator = ToolpathGenerator(cutting_config)
        toolpaths = toolpath_generator.generate_toolpaths(processor.parts)
        
        if not toolpaths:
            raise HTTPException(status_code=400, detail="Failed to generate toolpaths")
        
        # Export G-code
        logger.info("Exporting G-code")
        exporter = GCodeExporter(cutting_config, dialect=output_format)
        exporter.export(toolpaths, output_path)
        
        # Schedule cleanup after response
        background_tasks.add_task(cleanup_temp_files, [input_path, output_path], delay=300)
        
        # Return the file
        return FileResponse(
            output_path,
            media_type='text/plain',
            filename=output_filename,
            headers={
                "Content-Disposition": f"attachment; filename={output_filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Conversion error: {str(e)}")
        # Cleanup on error
        for path in [input_path, output_path]:
            if os.path.exists(path):
                os.remove(path)
        
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

@app.post("/convert/advanced")
async def convert_dxf_advanced(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    request: ConversionRequest = ...
):
    """Convert DXF with advanced configuration"""
    
    if not file.filename.lower().endswith('.dxf'):
        raise HTTPException(status_code=400, detail="File must be a DXF file")
    
    # Generate unique filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    input_filename = f"input_{timestamp}_{file.filename}"
    output_filename = f"output_{timestamp}_{file.filename.replace('.dxf', '.gcode')}"
    
    input_path = os.path.join(app_config.temp_dir, input_filename)
    output_path = os.path.join(app_config.temp_dir, output_filename)
    
    try:
        # Save uploaded file
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create cutting configuration
        cutting_config = CuttingConfig(
            material=request.material_config,
            tool=request.tool_config,
            tabs=request.tab_config
        )
        
        # Process DXF
        logger.info(f"Processing DXF file: {input_filename}")
        processor = DXFProcessor(tolerance=request.processing_config.tolerance)
        dxf_info = processor.load_dxf(
            input_path, 
            layer_filter=request.processing_config.layer_filter
        )
        
        if not processor.parts:
            raise HTTPException(status_code=400, detail="No parts found in DXF file")
        
        # Generate toolpaths
        logger.info("Generating toolpaths")
        toolpath_generator = ToolpathGenerator(cutting_config)
        toolpaths = toolpath_generator.generate_toolpaths(processor.parts)
        
        if not toolpaths:
            raise HTTPException(status_code=400, detail="Failed to generate toolpaths")
        
        # Export G-code
        logger.info("Exporting G-code")
        exporter = GCodeExporter(cutting_config, dialect=request.output_format)
        exporter.export(toolpaths, output_path)
        
        # Schedule cleanup after response
        background_tasks.add_task(cleanup_temp_files, [input_path, output_path], delay=300)
        
        # Return the file
        return FileResponse(
            output_path,
            media_type='text/plain',
            filename=output_filename,
            headers={
                "Content-Disposition": f"attachment; filename={output_filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Conversion error: {str(e)}")
        # Cleanup on error
        for path in [input_path, output_path]:
            if os.path.exists(path):
                os.remove(path)
        
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")

def cleanup_temp_files(file_paths: list, delay: int = 0):
    """Clean up temporary files after a delay"""
    import time
    
    if delay > 0:
        time.sleep(delay)
    
    for path in file_paths:
        try:
            if os.path.exists(path):
                os.remove(path)
                logger.info(f"Cleaned up temp file: {path}")
        except Exception as e:
            logger.error(f"Failed to clean up {path}: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)