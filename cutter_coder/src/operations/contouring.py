"""Contouring operation implementation for part outlines"""

from typing import List, Dict, Tuple, Optional
import numpy as np
from shapely.geometry import Polygon, LineString
try:
    from shapely.ops import offset_curve
except ImportError:
    # Fallback for older versions of Shapely
    offset_curve = None

class ContouringOperation:
    def __init__(self, material_settings: dict):
        self.settings = material_settings["operations"]["contouring"]
        
    def generate_toolpath(self, part_contour: List[Tuple[float, float]], 
                         material_thickness: float,
                         tabs: Optional[List[Dict]] = None,
                         is_climb: Optional[bool] = None) -> List[Dict]:
        """Generate contouring toolpath with tab handling"""
        toolpaths = []
        
        # Tool radius compensation
        tool_radius = self.settings["tool_diameter"] / 2
        
        # Milling direction
        climb_milling = is_climb if is_climb is not None else self.settings.get("climb_milling", True)
        
        # Calculate number of depth passes
        num_passes = int(np.ceil(material_thickness / self.settings["depth_per_pass"]))
        
        # Generate offset contour for tool compensation
        offset_contour = self._generate_offset_contour(part_contour, tool_radius, climb_milling)
        
        # Handle finish pass if enabled
        if self.settings.get("finish_pass", False):
            finish_allowance = self.settings.get("finish_allowance", 0.1)
            roughing_offset = tool_radius + finish_allowance
            roughing_contour = self._generate_offset_contour(part_contour, roughing_offset, climb_milling)
        else:
            roughing_contour = offset_contour
            finish_allowance = 0
        
        current_depth = 0
        
        # Roughing passes
        for pass_num in range(num_passes):
            pass_depth = min(self.settings["depth_per_pass"], 
                           material_thickness - current_depth)
            current_depth += pass_depth
            
            # Generate path with tabs
            if tabs and pass_num == num_passes - 1:  # Only add tabs on final pass
                path = self._generate_tabbed_path(roughing_contour, -current_depth, tabs)
            else:
                path = self._generate_continuous_path(roughing_contour, -current_depth)
            
            toolpaths.extend(path)
        
        # Finish pass if enabled
        if self.settings.get("finish_pass", False) and finish_allowance > 0:
            if tabs:
                finish_path = self._generate_tabbed_path(offset_contour, -material_thickness, tabs)
            else:
                finish_path = self._generate_continuous_path(offset_contour, -material_thickness)
            
            # Mark as finish pass
            for move in finish_path:
                move["is_finish_pass"] = True
            
            toolpaths.extend(finish_path)
        
        # Final retract
        toolpaths.append({
            "type": "rapid_retract",
            "position": toolpaths[-1]["position"],
            "depth": 5.0,
            "operation": "G00"
        })
        
        return toolpaths
    
    def _generate_offset_contour(self, contour: List[Tuple[float, float]], 
                                offset: float, climb: bool) -> List[Tuple[float, float]]:
        """Generate offset contour for tool compensation"""
        # Create polygon from contour
        poly = Polygon(contour)
        
        # Offset direction based on milling type
        # Climb milling: outside = negative offset, inside = positive
        # Conventional: opposite
        offset_value = -offset if climb else offset
        
        try:
            # Generate offset
            if offset_curve:
                offset_geom = offset_curve(poly.exterior, offset_value)
                
                if hasattr(offset_geom, 'coords'):
                    return list(offset_geom.coords)
                else:
                    # Handle multi-geometry results
                    return list(offset_geom.geoms[0].coords)
            else:
                # Fallback using buffer for older Shapely versions
                offset_poly = poly.buffer(offset_value)
                if hasattr(offset_poly, 'exterior'):
                    return list(offset_poly.exterior.coords)
                else:
                    return contour
        except:
            # Fallback to original contour if offset fails
            return contour
    
    def _generate_continuous_path(self, contour: List[Tuple[float, float]], 
                                depth: float) -> List[Dict]:
        """Generate continuous cutting path"""
        path = []
        
        # Lead-in move
        lead_in = self._generate_lead_in(contour[0], contour[1])
        path.extend(lead_in)
        
        # Plunge to depth
        path.append({
            "type": "plunge",
            "position": contour[0],
            "depth": depth,
            "feed_rate": self.settings["plunge_rate"],
            "operation": "G01"
        })
        
        # Cut contour
        for point in contour[1:]:
            path.append({
                "type": "contour_cut",
                "position": point,
                "depth": depth,
                "feed_rate": self.settings["feed_rate"],
                "operation": "G01"
            })
        
        # Close contour
        path.append({
            "type": "contour_cut",
            "position": contour[0],
            "depth": depth,
            "feed_rate": self.settings["feed_rate"],
            "operation": "G01"
        })
        
        # Lead-out
        lead_out = self._generate_lead_out(contour[0], contour[-1])
        path.extend(lead_out)
        
        return path
    
    def _generate_tabbed_path(self, contour: List[Tuple[float, float]], 
                            depth: float, tabs: List[Dict]) -> List[Dict]:
        """Generate path with tab handling"""
        path = []
        
        # Sort tabs by position along contour
        # This is simplified - real implementation would project tabs onto contour
        
        # For now, generate continuous path and modify for tabs
        base_path = self._generate_continuous_path(contour, depth)
        
        # Insert tab lifts
        for tab in tabs:
            # Find closest path segment to tab
            # Lift tool at tab location
            # This is simplified - real implementation would be more complex
            pass
        
        return base_path
    
    def _generate_lead_in(self, start_point: Tuple[float, float], 
                         next_point: Tuple[float, float]) -> List[Dict]:
        """Generate tangential lead-in"""
        # Calculate tangent direction
        dx = next_point[0] - start_point[0]
        dy = next_point[1] - start_point[1]
        length = np.sqrt(dx**2 + dy**2)
        
        if length > 0:
            dx /= length
            dy /= length
        
        # Lead-in distance
        lead_distance = self.settings["tool_diameter"]
        
        # Lead-in point
        lead_x = start_point[0] - dx * lead_distance
        lead_y = start_point[1] - dy * lead_distance
        
        return [{
            "type": "lead_in",
            "position": (lead_x, lead_y),
            "depth": 5.0,  # Above material
            "feed_rate": self.settings["feed_rate"],
            "operation": "G00"
        }]
    
    def _generate_lead_out(self, end_point: Tuple[float, float], 
                          prev_point: Tuple[float, float]) -> List[Dict]:
        """Generate tangential lead-out"""
        # Similar to lead-in but in opposite direction
        dx = end_point[0] - prev_point[0]
        dy = end_point[1] - prev_point[1]
        length = np.sqrt(dx**2 + dy**2)
        
        if length > 0:
            dx /= length
            dy /= length
        
        lead_distance = self.settings["tool_diameter"]
        
        lead_x = end_point[0] + dx * lead_distance
        lead_y = end_point[1] + dy * lead_distance
        
        return [{
            "type": "lead_out",
            "position": (lead_x, lead_y),
            "depth": 5.0,
            "feed_rate": self.settings["feed_rate"] * 2,  # Rapid lead-out
            "operation": "G00"
        }]