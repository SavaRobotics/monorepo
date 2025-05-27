#!/usr/bin/env python3
"""
API wrapper for the FreeCAD unfolder
Provides a function interface for STEP to DXF conversion
"""

import os
import sys
import subprocess
import tempfile
import shutil

def convert_step_to_dxf(step_file_path, output_dxf_path, k_factor="0.38"):
    """
    Convert STEP file to DXF using FreeCAD
    
    Args:
        step_file_path (str): Path to input STEP file
        output_dxf_path (str): Path for output DXF file
        k_factor (str): K-factor value for sheet metal unfolding
        
    Returns:
        bool: True if conversion successful, False otherwise
    """
    try:
        # Ensure input file exists
        if not os.path.exists(step_file_path):
            print(f"Error: Input file {step_file_path} does not exist")
            return False
        
        # Create output directory if it doesn't exist
        os.makedirs(os.path.dirname(output_dxf_path), exist_ok=True)
        
        # Set up environment
        env = os.environ.copy()
        env['K_FACTOR'] = str(k_factor)
        env['PYTHONPATH'] = '/app'
        env['DISPLAY'] = ':99'  # For headless operation
        
        # Start virtual display for headless operation
        subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1024x768x24'], 
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Create FreeCAD command
        freecad_script = f"""
import sys
import os
sys.path.append('/app/FreeCAD_sheet_metal')

# Import FreeCAD
import FreeCAD

# Patch precision if needed
def patch_freecad_precision():
    if not hasattr(FreeCAD, 'Precision'):
        class Precision:
            def confusion(self):
                return 1e-7
            def angular(self):
                return 1e-12
            def intersection(self):
                return 1e-10
            def approximation(self):
                return 1e-5
            def parametric(self):
                return 1e-9
            def p_confusion(self):
                return 1e-9
            def p_intersection(self):
                return 1e-12
        FreeCAD.Base.Precision = Precision()

patch_freecad_precision()

# Import required modules
import Part
import Draft
import importDXF
import SheetMetalNewUnfolder

try:
    # Create new document
    doc = FreeCAD.newDocument()
    
    # Import STEP file
    print(f"Loading STEP file: {step_file_path}")
    Part.insert("{step_file_path}", doc.Name)
    
    # Get the imported object
    if len(doc.Objects) == 0:
        print("Error: No objects found in STEP file")
        FreeCAD.closeDocument(doc.Name)
        sys.exit(1)
    
    obj = doc.Objects[0]
    
    # Get the largest face as base face
    faces = obj.Shape.Faces
    if len(faces) == 0:
        print("Error: No faces found in object")
        FreeCAD.closeDocument(doc.Name)
        sys.exit(1)
        
    largest_face = max(faces, key=lambda f: f.Area)
    base_index = faces.index(largest_face)
    facename = f"Face{{base_index + 1}}"
    
    print(f"Using face {{facename}} as base face")
    
    # Get K-factor from environment
    k_factor = float(os.environ.get("K_FACTOR", "0.38"))
    print(f"Using K-factor: {{k_factor}}")
    
    # Create unfold object
    unfold_obj = SheetMetalNewUnfolder.Unfold(
        doc, 
        obj, 
        facename, 
        k_factor
    )
    
    if unfold_obj is None:
        print("Error: Failed to create unfold object")
        FreeCAD.closeDocument(doc.Name)
        sys.exit(1)
    
    # Recompute the document
    doc.recompute()
    
    # Export to DXF
    print(f"Exporting to DXF: {output_dxf_path}")
    
    # Select the unfolded object
    objects_to_export = [unfold_obj]
    
    # Export DXF
    importDXF.export(objects_to_export, "{output_dxf_path}")
    
    # Close document
    FreeCAD.closeDocument(doc.Name)
    
    print("Conversion completed successfully")
    
except Exception as e:
    print(f"Error during conversion: {{e}}")
    import traceback
    traceback.print_exc()
    if 'doc' in locals():
        FreeCAD.closeDocument(doc.Name)
    sys.exit(1)
"""
        
        # Write script to temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as script_file:
            script_file.write(freecad_script)
            script_path = script_file.name
        
        try:
            # Run FreeCAD with the script
            cmd = ['freecad', '-c', script_path]
            
            print(f"Running: {' '.join(cmd)}")
            result = subprocess.run(
                cmd, 
                env=env,
                cwd='/app',
                capture_output=True,
                text=True,
                timeout=120  # 2 minute timeout
            )
            
            # Print output for debugging
            if result.stdout:
                print("FreeCAD stdout:", result.stdout)
            if result.stderr:
                print("FreeCAD stderr:", result.stderr)
            
            # Check if conversion was successful
            if result.returncode == 0 and os.path.exists(output_dxf_path):
                print(f"Successfully converted {step_file_path} to {output_dxf_path}")
                return True
            else:
                print(f"Conversion failed. Return code: {result.returncode}")
                return False
                
        finally:
            # Clean up script file
            os.unlink(script_path)
            
    except Exception as e:
        print(f"Error in convert_step_to_dxf: {e}")
        return False

if __name__ == "__main__":
    # Command line interface for testing
    if len(sys.argv) != 3:
        print("Usage: python unfold_api.py <input.step> <output.dxf>")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    k_factor = os.environ.get("K_FACTOR", "0.38")
    
    success = convert_step_to_dxf(input_file, output_file, k_factor)
    sys.exit(0 if success else 1)