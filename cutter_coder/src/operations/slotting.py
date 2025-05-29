"""Slotting operation implementation"""

from typing import List, Dict, Tuple
import numpy as np
from shapely.geometry import LineString, Polygon
try:
    from shapely.ops import offset_curve
except ImportError:
    # Fallback for older versions of Shapely
    offset_curve = None

class SlottingOperation:
    def __init__(self, material_settings: dict):
        self.settings = material_settings["operations"]["slotting"]
        
    def generate_toolpath(self, slot_contour: List[Tuple[float, float]], 
                         slot_width: float, material_thickness: float,
                         is_closed: bool = True) -> List[Dict]:
        """Generate slotting toolpath for elongated slots"""
        toolpaths = []
        
        # Tool radius
        tool_radius = self.settings["tool_diameter"] / 2
        
        # Calculate number of depth passes
        num_passes = int(np.ceil(material_thickness / self.settings["depth_per_pass"]))
        
        # Create slot geometry
        if is_closed:
            slot_geom = Polygon(slot_contour)
        else:
            slot_geom = LineString(slot_contour)
        
        # Generate offset paths for clearing
        offset_paths = self._generate_offset_paths(slot_geom, tool_radius, slot_width)
        
        current_depth = 0
        
        for pass_num in range(num_passes):
            # Calculate depth for this pass
            pass_depth = min(self.settings["depth_per_pass"], 
                           material_thickness - current_depth)
            current_depth += pass_depth
            
            # Mill each offset path
            for offset_path in offset_paths:
                # Ramp into the cut
                ramp_toolpath = self._generate_ramp_entry(
                    offset_path[0], -current_depth, tool_radius
                )
                toolpaths.extend(ramp_toolpath)
                
                # Mill the path
                for point in offset_path[1:]:
                    toolpaths.append({
                        "type": "slot_cut",
                        "position": point,
                        "depth": -current_depth,
                        "feed_rate": self.settings["feed_rate"],
                        "operation": "G01",
                        "climb_milling": self.settings.get("climb_milling", True)
                    })
        
        # Final retract
        toolpaths.append({
            "type": "rapid_retract",
            "position": offset_paths[-1][-1],
            "depth": 5.0,
            "operation": "G00"
        })
        
        return toolpaths
    
    def _generate_offset_paths(self, geometry, tool_radius: float, 
                              slot_width: float) -> List[List[Tuple[float, float]]]:
        """Generate offset paths for slot clearing"""
        paths = []
        
        # Calculate number of stepovers needed
        effective_cut_width = tool_radius * 1.5  # 75% stepover
        
        if isinstance(geometry, Polygon):
            # For closed slots, generate inward offsets
            current_offset = -tool_radius
            
            while current_offset > -slot_width/2:
                try:
                    if offset_curve:
                        offset_geom = offset_curve(geometry.exterior, current_offset)
                    else:
                        # Fallback using buffer
                        offset_geom = geometry.buffer(current_offset).exterior
                    if hasattr(offset_geom, 'coords'):
                        paths.append(list(offset_geom.coords))
                    current_offset -= effective_cut_width
                except:
                    break
        else:
            # For open slots (lines), generate parallel paths
            # This is simplified - real implementation would handle complex paths
            paths.append(list(geometry.coords))
            
        return paths
    
    def _generate_ramp_entry(self, start_point: Tuple[float, float], 
                           target_depth: float, tool_radius: float) -> List[Dict]:
        """Generate ramping entry move"""
        ramp_distance = abs(target_depth) * 3  # 1:3 ramp ratio
        ramp_points = []
        
        # Simple linear ramp along X axis
        num_points = 10
        for i in range(num_points + 1):
            t = i / num_points
            x = start_point[0] - ramp_distance * (1 - t)
            y = start_point[1]
            z = target_depth * t
            
            ramp_points.append({
                "type": "ramp_move",
                "position": (x, y),
                "depth": z,
                "feed_rate": self.settings["plunge_rate"],
                "operation": "G01"
            })
        
        return ramp_points