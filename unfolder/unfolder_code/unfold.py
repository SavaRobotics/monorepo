import importDXF
import Part
import Draft
import os
import sys

k_factor = float(os.environ["K_FACTOR"] if len(sys.argv) > 1 else "0.38")
print(f"Using K-factor: {k_factor}")

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

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'FreeCAD_sheet_metal'))
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

importDXF.export([part], "/app/output/largest_face_raw.dxf")

# Reorient the DXF to ensure it's on the XY plane
import sys
sys.path.append("/app/src/unfolder")
from orientdxf import transform_entities

print("Reorienting DXF to XY plane...")
transform_entities("/app/output/largest_face_raw.dxf", "/app/output/largest_face.dxf")
print("DXF reorientation complete.")

Part.export([unfold_obj], "/app/output/unbend_model.step")

exit(0)