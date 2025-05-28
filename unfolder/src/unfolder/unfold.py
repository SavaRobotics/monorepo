print("=== UNFOLD SCRIPT STARTING ===")
import os
import sys
print("Basic imports successful")

k_factor = float(os.environ.get("K_FACTOR", "0.38"))
print(f"Using K-factor: {k_factor}")

try:
    import importDXF
    print("importDXF imported successfully")
except Exception as e:
    print(f"Failed to import importDXF: {e}")
    
try:
    import Part
    print("Part imported successfully")
except Exception as e:
    print(f"Failed to import Part: {e}")
    
try:
    import Draft
    print("Draft imported successfully")
except Exception as e:
    print(f"Failed to import Draft: {e}")

def patch_freecad_precision():
    # Check if Precision attribute exists
    if not hasattr(FreeCAD, 'Precision'):
        # Add default precision values
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
        print("Added FreeCAD.Precision compatibility layer")

# Apply the patch
patch_freecad_precision()

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'sheet_metal'))
# Import the unfold command from the sheet metal module
import SheetMetalNewUnfolder

# Flatenning routine

doc = FreeCAD.ActiveDocument

obj = doc.Objects[0]

# Get a base face
faces = obj.Shape.Faces
largest_face = max(faces, key=lambda f: f.Area)
base_index = faces.index(largest_face)
facename = f"Face{base_index + 1}"  # FreeCAD uses 1-based indexing

print(f"Using face: {facename} with area: {largest_face.Area}")

bac = SheetMetalNewUnfolder.BendAllowanceCalculator.from_single_value(k_factor, "ansi")

sel_face, unfolded_shape, bend_lines, root_normal = SheetMetalNewUnfolder.getUnfold(
    bac, obj, facename
)


unfold_obj = doc.addObject("Part::Feature", "UnfoldedPart")
unfold_obj.Shape = unfolded_shape
doc.recompute()


faces = unfold_obj.Shape.Faces
largest_face = max(faces, key=lambda f: f.Area)

part = doc.addObject("Part::Feature", "LargestFace")
part.Shape = largest_face
doc.recompute()

output_dir = os.environ.get("OUTPUT_DIR", "/app/output")
print(f"Output directory: {output_dir}")
os.makedirs(output_dir, exist_ok=True)

raw_dxf_path = os.path.join(output_dir, "largest_face_raw.dxf")
final_dxf_path = os.path.join(output_dir, "largest_face.dxf")
step_path = os.path.join(output_dir, "unbend_model.step")

print(f"Exporting DXF to: {raw_dxf_path}")
try:
    importDXF.export([part], raw_dxf_path)
    print(f"Raw DXF exported successfully. File exists: {os.path.exists(raw_dxf_path)}")
except Exception as e:
    print(f"DXF export failed: {e}")

# Reorient the DXF to ensure it's on the XY plane
import sys
sys.path.append("/app/src/unfolder")
try:
    from orientdxf import transform_entities
    
    print("Reorienting DXF to XY plane...")
    transform_entities(raw_dxf_path, final_dxf_path)
    print(f"DXF reorientation complete. Final file exists: {os.path.exists(final_dxf_path)}")
except Exception as e:
    print(f"DXF reorientation failed: {e}")

try:
    Part.export([unfold_obj], step_path)
    print(f"STEP export complete. File exists: {os.path.exists(step_path)}")
except Exception as e:
    print(f"STEP export failed: {e}")

exit(0)