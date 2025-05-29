"""Intelligent tab generation for parts"""

import numpy as np
from typing import List, Tuple, Dict
from shapely.geometry import LineString, Point
import logging

logger = logging.getLogger(__name__)

class TabGenerator:
    def __init__(self, material_settings: dict):
        self.tab_width = material_settings["tab_settings"]["width"]
        self.tab_height = material_settings["tab_settings"]["height"]
        self.min_tabs = material_settings["tab_settings"]["min_tabs"]
        self.max_distance = material_settings["tab_settings"]["max_distance"]
        self.ramp_angle = material_settings["tab_settings"]["ramp_angle"]
        
    def generate_tabs(self, part_contour: List[Tuple[float, float]], 
                     holes: List = None) -> List[Dict]:
        """Generate optimal tab locations for a part"""
        if len(part_contour) < 3:
            return []
            
        # Calculate perimeter
        perimeter = self._calculate_perimeter(part_contour)
        
        # Determine number of tabs
        num_tabs = max(self.min_tabs, int(perimeter / self.max_distance) + 1)
        
        # Find optimal tab positions
        tab_positions = self._find_tab_positions(part_contour, num_tabs)
        
        # Generate tab data with entry/exit ramps
        tabs = []
        for pos in tab_positions:
            tab = self._create_tab(pos, part_contour)
            if tab:
                tabs.append(tab)
                
        return tabs
    
    def _calculate_perimeter(self, contour: List[Tuple[float, float]]) -> float:
        """Calculate the perimeter of a contour"""
        perimeter = 0
        for i in range(len(contour)):
            p1 = contour[i]
            p2 = contour[(i + 1) % len(contour)]
            perimeter += np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
        return perimeter
    
    def _find_tab_positions(self, contour: List[Tuple[float, float]], 
                          num_tabs: int) -> List[Dict]:
        """Find optimal positions for tabs"""
        positions = []
        
        # Create line segments
        segments = []
        for i in range(len(contour)):
            p1 = contour[i]
            p2 = contour[(i + 1) % len(contour)]
            length = np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
            segments.append({
                "start": p1,
                "end": p2,
                "length": length,
                "index": i
            })
        
        # Sort segments by length (prefer longer segments for tabs)
        segments.sort(key=lambda x: x["length"], reverse=True)
        
        # Try to distribute tabs evenly
        selected_segments = []
        segment_spacing = len(segments) // num_tabs
        
        for i in range(num_tabs):
            # Find best segment around the ideal position
            ideal_idx = i * segment_spacing
            best_segment = None
            best_score = float('inf')
            
            for j in range(max(0, ideal_idx - 2), min(len(segments), ideal_idx + 3)):
                segment = segments[j]
                
                # Skip if segment is too short for a tab
                if segment["length"] < self.tab_width * 1.5:
                    continue
                
                # Skip if too close to a corner
                if self._is_corner(contour, segment["index"]):
                    continue
                
                # Score based on distance from ideal position and segment length
                score = abs(j - ideal_idx) - segment["length"] / 10
                
                if score < best_score:
                    best_score = score
                    best_segment = segment
            
            if best_segment:
                # Place tab at center of segment
                t = 0.5
                x = best_segment["start"][0] + t * (best_segment["end"][0] - best_segment["start"][0])
                y = best_segment["start"][1] + t * (best_segment["end"][1] - best_segment["start"][1])
                
                positions.append({
                    "position": (x, y),
                    "segment": best_segment,
                    "parameter": t
                })
        
        return positions
    
    def _is_corner(self, contour: List[Tuple[float, float]], index: int, 
                   angle_threshold: float = 45) -> bool:
        """Check if a segment is at a sharp corner"""
        p0 = contour[(index - 1) % len(contour)]
        p1 = contour[index]
        p2 = contour[(index + 1) % len(contour)]
        
        # Calculate vectors
        v1 = np.array([p1[0] - p0[0], p1[1] - p0[1]])
        v2 = np.array([p2[0] - p1[0], p2[1] - p1[1]])
        
        # Normalize
        v1_norm = v1 / (np.linalg.norm(v1) + 1e-6)
        v2_norm = v2 / (np.linalg.norm(v2) + 1e-6)
        
        # Calculate angle
        dot_product = np.dot(v1_norm, v2_norm)
        angle = np.degrees(np.arccos(np.clip(dot_product, -1, 1)))
        
        return angle < angle_threshold
    
    def _create_tab(self, tab_position: Dict, contour: List[Tuple[float, float]]) -> Dict:
        """Create tab with ramp-in and ramp-out"""
        segment = tab_position["segment"]
        
        # Calculate tab direction (perpendicular to segment)
        dx = segment["end"][0] - segment["start"][0]
        dy = segment["end"][1] - segment["start"][1]
        length = np.sqrt(dx**2 + dy**2)
        
        # Normalized direction
        dir_x = dx / length
        dir_y = dy / length
        
        # Tab start and end positions along the segment
        half_width = self.tab_width / 2
        tab_start_t = tab_position["parameter"] - half_width / segment["length"]
        tab_end_t = tab_position["parameter"] + half_width / segment["length"]
        
        # Ensure tab stays within segment
        tab_start_t = max(0.1, tab_start_t)
        tab_end_t = min(0.9, tab_end_t)
        
        # Calculate actual positions
        tab_start_x = segment["start"][0] + tab_start_t * dx
        tab_start_y = segment["start"][1] + tab_start_t * dy
        tab_end_x = segment["start"][0] + tab_end_t * dx
        tab_end_y = segment["start"][1] + tab_end_t * dy
        
        # Calculate ramp distance
        ramp_distance = self.tab_height / np.tan(np.radians(self.ramp_angle))
        
        return {
            "center": tab_position["position"],
            "start": (tab_start_x, tab_start_y),
            "end": (tab_end_x, tab_end_y),
            "width": self.tab_width,
            "height": self.tab_height,
            "ramp_distance": ramp_distance,
            "direction": (dir_x, dir_y)
        }