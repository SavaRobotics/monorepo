"""Main processing module for DXF to G-code conversion"""

import logging
from typing import Dict, List, Optional
from pathlib import Path

from .core.dxf_parser import DXFParser
from .materials.database import get_material_settings
from .operations.boring import BoringOperation
from .operations.slotting import SlottingOperation
from .operations.contouring import ContouringOperation
from .operations.tab_generator import TabGenerator
from .postprocessors.mach3 import Mach3PostProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DXFToGCodeProcessor:
    def __init__(self, material: str = "aluminum", tool_diameter: float = 6.35):
        self.material = material
        self.tool_diameter = tool_diameter
        self.material_settings = get_material_settings(material)
        
        # Initialize operations
        self.boring_op = BoringOperation(self.material_settings)
        self.slotting_op = SlottingOperation(self.material_settings)
        self.contouring_op = ContouringOperation(self.material_settings)
        self.tab_generator = TabGenerator(self.material_settings)
        
        # Post processor
        self.post_processor = Mach3PostProcessor(material, tool_diameter)
        
    def process_dxf(self, dxf_path: str, material_thickness: float,
                   enable_tabs: bool = True) -> Dict:
        """Process DXF file and generate G-code"""
        logger.info(f"Processing DXF: {dxf_path}")
        
        # Parse DXF
        parser = DXFParser(dxf_path)
        parsed_data = parser.parse()
        
        logger.info(f"Found {len(parsed_data['parts'])} parts")
        
        # Process all operations in order
        all_toolpaths = []
        
        # 1. Process internal features first (boring operations)
        for part in parsed_data['parts']:
            if part.get('holes'):
                logger.info(f"Processing {len(part['holes'])} holes")
                for hole in part['holes']:
                    if hole['type'] == 'circle':
                        toolpath = self.boring_op.generate_toolpath(
                            hole['center'],
                            hole['radius'],
                            material_thickness
                        )
                        all_toolpaths.extend(toolpath)
        
        # 2. Process slots (if any elongated holes)
        # This would need additional logic to detect slots vs round holes
        
        # 3. Process part contours
        for i, part in enumerate(parsed_data['parts']):
            logger.info(f"Processing part {i+1} contour")
            
            # Generate tabs if enabled
            tabs = []
            if enable_tabs and part['contour']['type'] == 'polyline':
                tabs = self.tab_generator.generate_tabs(
                    part['contour']['points']
                )
                logger.info(f"Generated {len(tabs)} tabs")
            
            # Generate contour toolpath
            if part['contour']['type'] == 'polyline':
                toolpath = self.contouring_op.generate_toolpath(
                    part['contour']['points'],
                    material_thickness,
                    tabs
                )
            elif part['contour']['type'] == 'circle':
                # Convert circle to polyline
                # This is simplified - real implementation would generate proper circle points
                circle_points = self._circle_to_points(
                    part['contour']['center'],
                    part['contour']['radius']
                )
                toolpath = self.contouring_op.generate_toolpath(
                    circle_points,
                    material_thickness,
                    tabs
                )
            
            all_toolpaths.extend(toolpath)
        
        # Generate G-code
        spindle_speed = self.material_settings['operations']['contouring']['spindle_speed']
        gcode = self.post_processor.generate_gcode(
            all_toolpaths,
            spindle_speed=spindle_speed
        )
        
        # Optimize G-code
        optimized_gcode = self.post_processor.optimize_gcode(gcode)
        
        return {
            "success": True,
            "gcode": optimized_gcode,
            "stats": {
                "parts_count": len(parsed_data['parts']),
                "total_moves": len(all_toolpaths),
                "material": self.material,
                "thickness": material_thickness,
                "tool_diameter": self.tool_diameter
            }
        }
    
    def _circle_to_points(self, center: tuple, radius: float, 
                         segments: int = 72) -> List[tuple]:
        """Convert circle to polygon points"""
        import numpy as np
        
        angles = np.linspace(0, 2 * np.pi, segments, endpoint=False)
        points = []
        
        for angle in angles:
            x = center[0] + radius * np.cos(angle)
            y = center[1] + radius * np.sin(angle)
            points.append((x, y))
        
        # Close the circle
        points.append(points[0])
        
        return points

def process_dxf_file(dxf_path: str, output_path: str,
                    material: str = "aluminum",
                    thickness: float = 3.0,
                    tool_diameter: float = 6.35,
                    enable_tabs: bool = True) -> bool:
    """Convenience function to process a DXF file"""
    try:
        processor = DXFToGCodeProcessor(material, tool_diameter)
        result = processor.process_dxf(dxf_path, thickness, enable_tabs)
        
        if result["success"]:
            # Write G-code to file
            with open(output_path, 'w') as f:
                f.write(result["gcode"])
            
            logger.info(f"G-code written to: {output_path}")
            logger.info(f"Stats: {result['stats']}")
            return True
        
    except Exception as e:
        logger.error(f"Error processing DXF: {e}")
        return False