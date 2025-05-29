"""Boring operation implementation for holes"""

from typing import List, Dict, Tuple
import numpy as np

class BoringOperation:
    def __init__(self, material_settings: dict):
        self.settings = material_settings["operations"]["boring"]
        
    def generate_toolpath(self, hole_center: Tuple[float, float], 
                         hole_radius: float, material_thickness: float) -> List[Dict]:
        """Generate boring toolpath for a circular hole"""
        toolpaths = []
        
        # Calculate number of passes based on depth
        num_passes = int(np.ceil(material_thickness / self.settings["depth_per_pass"]))
        
        # Tool radius
        tool_radius = self.settings["tool_diameter"] / 2
        
        # Check if hole can be bored with current tool
        if hole_radius < tool_radius:
            raise ValueError(f"Hole diameter ({hole_radius*2}mm) is smaller than tool diameter ({self.settings['tool_diameter']}mm)")
        
        # For pecking operation
        if self.settings.get("pecking", False):
            peck_depth = self.settings.get("peck_depth", 5.0)
            
        current_depth = 0
        
        for pass_num in range(num_passes):
            # Calculate depth for this pass
            pass_depth = min(self.settings["depth_per_pass"], 
                           material_thickness - current_depth)
            current_depth += pass_depth
            
            if hole_radius == tool_radius:
                # Simple plunge for exact fit
                toolpaths.append({
                    "type": "boring_plunge",
                    "position": hole_center,
                    "depth": -current_depth,
                    "feed_rate": self.settings["plunge_rate"],
                    "operation": "G01"  # Linear move
                })
            else:
                # Helical boring for larger holes
                toolpaths.extend(self._generate_helical_boring(
                    hole_center, hole_radius, tool_radius, 
                    current_depth - pass_depth, current_depth
                ))
            
            # Add pecking retract if enabled
            if self.settings.get("pecking", False) and pass_num < num_passes - 1:
                toolpaths.append({
                    "type": "rapid_retract",
                    "position": hole_center,
                    "depth": 2.0,  # Retract 2mm above surface
                    "operation": "G00"
                })
        
        # Final retract
        toolpaths.append({
            "type": "rapid_retract",
            "position": hole_center,
            "depth": 5.0,  # Safe height
            "operation": "G00"
        })
        
        return toolpaths
    
    def _generate_helical_boring(self, center: Tuple[float, float], 
                                hole_radius: float, tool_radius: float,
                                start_depth: float, end_depth: float) -> List[Dict]:
        """Generate helical interpolation for boring"""
        toolpaths = []
        
        # Calculate helical parameters
        cut_radius = hole_radius - tool_radius
        helix_pitch = 0.5  # mm per revolution
        
        # Number of revolutions needed
        depth_delta = end_depth - start_depth
        num_revolutions = depth_delta / helix_pitch
        
        # Points per revolution
        points_per_rev = 36  # 10-degree increments
        total_points = int(num_revolutions * points_per_rev)
        
        # Generate helix points
        for i in range(total_points + 1):
            angle = (i / points_per_rev) * 2 * np.pi
            z = -np.interp(i, [0, total_points], [start_depth, end_depth])
            
            x = center[0] + cut_radius * np.cos(angle)
            y = center[1] + cut_radius * np.sin(angle)
            
            toolpaths.append({
                "type": "helical_move",
                "position": (x, y),
                "depth": z,
                "feed_rate": self.settings["feed_rate"],
                "operation": "G01" if i > 0 else "G00"  # Rapid to start
            })
        
        return toolpaths