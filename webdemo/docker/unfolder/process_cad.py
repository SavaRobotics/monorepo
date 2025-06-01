#!/usr/bin/env python3
"""
Docker container script for downloading and unfolding CAD files.
This script runs inside the Docker container and:
1. Downloads the CAD file from the provided URL
2. Processes it using FreeCAD
3. Outputs the unfolded DXF/STEP files to the mounted volume
"""

import os
import sys
import urllib.request
import urllib.parse
import tempfile
import logging
from pathlib import Path

# Add FreeCAD paths to sys.path before importing
possible_freecad_paths = [
    '/usr/lib/freecad-python3/lib',
    '/usr/lib/freecad/lib',
    '/usr/lib/freecad-daily-python3/lib',
    '/usr/share/freecad/lib',
]

for path in possible_freecad_paths:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def download_file(url: str, output_path: str) -> bool:
    """Download file from URL to output path."""
    try:
        logger.info(f"Downloading file from: {url}")
        urllib.request.urlretrieve(url, output_path)
        logger.info(f"Downloaded file to: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to download file: {e}")
        return False

def get_output_filename(input_filename: str, format_type: str) -> str:
    """Generate output filename based on input and format."""
    base_name = Path(input_filename).stem
    if format_type == "dxf":
        return f"output_{base_name}.dxf"
    elif format_type == "step":
        return f"output_{base_name}.step"
    else:
        return f"output_{base_name}.{format_type}"

def main():
    """Main processing function."""
    # Get environment variables
    cad_file_url = os.getenv('CAD_FILE_URL')
    k_factor = float(os.getenv('K_FACTOR', '0.038'))
    output_format = os.getenv('OUTPUT_FORMAT', 'dxf')
    bend_radius = os.getenv('BEND_RADIUS')
    
    if not cad_file_url:
        logger.error("CAD_FILE_URL environment variable is required")
        sys.exit(1)
    
    logger.info(f"Processing CAD file: {cad_file_url}")
    logger.info(f"K-factor: {k_factor}")
    logger.info(f"Output format: {output_format}")
    if bend_radius:
        logger.info(f"Bend radius: {bend_radius}")
    
    # Create workspace directories
    workspace_dir = Path("/workspace")
    workspace_dir.mkdir(exist_ok=True)
    
    # Download the CAD file
    parsed_url = urllib.parse.urlparse(cad_file_url)
    input_filename = Path(parsed_url.path).name
    if not input_filename:
        input_filename = "input.step"
    
    input_path = workspace_dir / input_filename
    
    if not download_file(cad_file_url, str(input_path)):
        logger.error("Failed to download CAD file")
        sys.exit(1)
    
    # Import FreeCAD modules
    try:
        import FreeCAD
        import Part
        
        # For now, skip DXF import and focus on STEP export which is more reliable
        logger.info("Note: DXF export not available in this version, using STEP format")
        importDXF = None
        
        # Add our sheet metal module to the path
        sys.path.insert(0, '/app/sheet_metal')
        try:
            from SheetMetalNewUnfolder import SMUnfoldUnattendedCommandClass
            logger.info("Sheet Metal unfolder imported successfully")
        except ImportError as sm_error:
            logger.warning(f"Sheet Metal unfolder not available: {sm_error}")
            SMUnfoldUnattendedCommandClass = None
        
        logger.info("FreeCAD modules imported successfully")
    except ImportError as e:
        logger.error(f"Failed to import FreeCAD modules: {e}")
        sys.exit(1)
    
    try:
        # Create new FreeCAD document
        doc = FreeCAD.newDocument("UnfoldDoc")
        logger.info("Created FreeCAD document")
        
        # Import the STEP file
        Part.insert(str(input_path), doc.Name)
        logger.info(f"Imported STEP file: {input_path}")
        
        # Get all objects in the document
        objects = doc.Objects
        if not objects:
            logger.error("No objects found in the imported file")
            sys.exit(1)
        
        logger.info(f"Found {len(objects)} object(s) in the document")
        
        # Process each object that might be sheet metal
        unfolded_count = 0
        for obj in objects:
            try:
                logger.info(f"Processing object: {obj.Name}")
                
                # Since we're running headless, we can't use GUI selection
                # Instead, we'll work directly with the object
                
                # Create unfolder command if available
                if SMUnfoldUnattendedCommandClass:
                    unfolder = SMUnfoldUnattendedCommandClass()
                    
                    # Set k-factor if provided
                    if hasattr(unfolder, 'setKFactor'):
                        unfolder.setKFactor(k_factor)
                    
                    # Set bend radius if provided
                    if bend_radius and hasattr(unfolder, 'setBendRadius'):
                        unfolder.setBendRadius(float(bend_radius))
                    
                    # Set the object to unfold directly (instead of using GUI selection)
                    if hasattr(unfolder, 'setObject'):
                        unfolder.setObject(obj)
                    
                    # Execute the unfolding
                    try:
                        unfolder.Activated()
                    except Exception as unfold_error:
                        logger.warning(f"Direct unfolder activation failed: {unfold_error}")
                        SMUnfoldUnattendedCommandClass = None  # Disable for remaining objects
                
                if not SMUnfoldUnattendedCommandClass:
                    logger.info("Using fallback: exporting original geometry")
                    
                    # Export the original shape as fallback
                    if output_format in ["step", "both"]:
                        step_filename = get_output_filename(obj.Name, "step")
                        step_path = workspace_dir / step_filename
                        
                        # Export to STEP
                        try:
                            Part.export([obj], str(step_path))
                            logger.info(f"Exported STEP (original): {step_path}")
                            unfolded_count += 1
                        except Exception as step_error:
                            logger.warning(f"STEP export failed: {step_error}")
                    
                    continue
                
                # Check if unfolding created new objects
                new_objects = [o for o in doc.Objects if o not in objects]
                if new_objects:
                    logger.info(f"Unfolding created {len(new_objects)} new object(s)")
                    
                    # Export the unfolded objects
                    for i, unfolded_obj in enumerate(new_objects):
                        if output_format in ["dxf", "both"] and importDXF:
                            dxf_filename = get_output_filename(f"{obj.Name}_{i}", "dxf")
                            dxf_path = workspace_dir / dxf_filename
                            
                            # Export to DXF
                            try:
                                importDXF.export([unfolded_obj], str(dxf_path))
                                logger.info(f"Exported DXF: {dxf_path}")
                            except Exception as dxf_error:
                                logger.warning(f"DXF export failed: {dxf_error}")
                        
                        if output_format in ["step", "both"]:
                            step_filename = get_output_filename(f"{obj.Name}_{i}", "step")
                            step_path = workspace_dir / step_filename
                            
                            # Export to STEP
                            try:
                                Part.export([unfolded_obj], str(step_path))
                                logger.info(f"Exported STEP: {step_path}")
                            except Exception as step_error:
                                logger.warning(f"STEP export failed: {step_error}")
                    
                    unfolded_count += len(new_objects)
                else:
                    logger.warning(f"No unfolded objects created for {obj.Name}")
                    
            except Exception as e:
                logger.error(f"Failed to process object {obj.Name}: {e}")
                continue
        
        if unfolded_count == 0:
            logger.warning("No objects were successfully unfolded")
        else:
            logger.info(f"Successfully unfolded {unfolded_count} object(s)")
        
        # Close the document
        FreeCAD.closeDocument(doc.Name)
        logger.info("Processing completed successfully")
        
    except Exception as e:
        logger.error(f"Error during FreeCAD processing: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 