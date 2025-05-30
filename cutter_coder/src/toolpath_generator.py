import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
import logging

from .config import CuttingConfig, TabConfig
from .dxf_processor import Part, Geometry

logger = logging.getLogger(__name__)

@dataclass
class Toolpath:
    """Represents a complete toolpath"""
    type: str  # 'contour', 'pocket', 'drill'
    points: List[Tuple[float, float, float]]  # (x, y, z) coordinates
    feed_rate: float
    plunge_rate: float
    tool_number: int = 1

@dataclass
class Tab:
    """Represents a holding tab"""
    start_point: Tuple[float, float]
    end_point: Tuple[float, float]
    height: float

class ToolpathGenerator:
    def __init__(self, config: CuttingConfig):
        self.config = config
        self.toolpaths: List[Toolpath] = []
        
    def generate_toolpaths(self, parts: List[Part]) -> List[Toolpath]:
        """Generate toolpaths for all parts"""
        self.toolpaths = []
        
        for part in parts:
            # Generate outer contour toolpath with tabs
            contour_path = self._generate_contour_with_tabs(part)
            self.toolpaths.append(contour_path)
            
            # Generate toolpaths for holes (no tabs needed)
            for hole in part.holes:
                hole_path = self._generate_hole_toolpath(hole)
                self.toolpaths.append(hole_path)
        
        # Optimize toolpath order to minimize travel
        self.toolpaths = self._optimize_toolpath_order(self.toolpaths)
        
        return self.toolpaths
    
    def _generate_contour_with_tabs(self, part: Part) -> Toolpath:
        """Generate contour toolpath with holding tabs"""
        contour = part.outer_contour
        
        # Calculate total contour length
        total_length = self._calculate_contour_length(contour)
        
        # Determine tab positions
        tabs = self._calculate_tab_positions(contour, total_length)
        
        # Generate toolpath points
        points = []
        current_z = self.config.safety_height
        
        # Move to start position
        start_point = contour[0].start
        points.append((start_point[0], start_point[1], current_z))
        
        # Multiple passes for step-down
        current_depth = 0
        while current_depth < self.config.material.thickness:
            current_depth = min(current_depth + self.config.material.step_down, 
                              self.config.material.thickness)
            
            # Plunge to depth
            points.append((start_point[0], start_point[1], -current_depth))
            
            # Cut contour with tabs
            points.extend(self._cut_contour_with_tabs(contour, tabs, -current_depth))
            
            # Return to start for closed contour
            points.append((start_point[0], start_point[1], -current_depth))
        
        # Retract to safety height
        points.append((start_point[0], start_point[1], self.config.safety_height))
        
        return Toolpath(
            type='contour',
            points=points,
            feed_rate=self.config.material.feed_rate,
            plunge_rate=self.config.material.plunge_rate
        )
    
    def _generate_hole_toolpath(self, hole: List[Geometry]) -> Toolpath:
        """Generate toolpath for a hole (no tabs)"""
        points = []
        
        # Find hole center and radius
        bbox = self._calculate_bbox(hole)
        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2
        radius = (bbox[2] - bbox[0]) / 2
        
        # If hole is small enough, use drilling cycle
        if radius <= self.config.tool.diameter / 2:
            # Simple drilling
            points.append((center_x, center_y, self.config.safety_height))
            points.append((center_x, center_y, -self.config.material.thickness))
            points.append((center_x, center_y, self.config.safety_height))
            
            return Toolpath(
                type='drill',
                points=points,
                feed_rate=self.config.material.plunge_rate,
                plunge_rate=self.config.material.plunge_rate
            )
        else:
            # Helical or contour milling for larger holes
            return self._generate_pocket_toolpath(hole)
    
    def _calculate_contour_length(self, contour: List[Geometry]) -> float:
        """Calculate total length of a contour"""
        total_length = 0
        
        for geom in contour:
            if geom.type == 'line':
                dx = geom.end[0] - geom.start[0]
                dy = geom.end[1] - geom.start[1]
                total_length += np.sqrt(dx**2 + dy**2)
            elif geom.type == 'arc':
                # Arc length = radius * angle (in radians)
                angle_diff = abs(geom.end_angle - geom.start_angle)
                total_length += geom.radius * np.radians(angle_diff)
            elif geom.type == 'circle':
                total_length += 2 * np.pi * geom.radius
                
        return total_length
    
    def _calculate_tab_positions(self, contour: List[Geometry], total_length: float) -> List[Tab]:
        """Calculate optimal tab positions along contour"""
        tabs = []
        
        if not self.config.tabs.enabled:
            return tabs
        
        # Calculate number of tabs
        num_tabs = max(
            self.config.tabs.min_tabs_per_part,
            int(total_length / self.config.tabs.spacing)
        )
        
        # Distribute tabs evenly
        tab_spacing = total_length / num_tabs
        
        for i in range(num_tabs):
            # Find position along contour
            target_distance = i * tab_spacing + tab_spacing / 2
            
            # Find the geometry segment containing this position
            current_distance = 0
            for geom in contour:
                segment_length = self._get_segment_length(geom)
                
                if current_distance + segment_length >= target_distance:
                    # Tab is on this segment
                    local_distance = target_distance - current_distance
                    tab_start, tab_end = self._create_tab_on_segment(
                        geom, local_distance, self.config.tabs.width
                    )
                    
                    tabs.append(Tab(
                        start_point=tab_start,
                        end_point=tab_end,
                        height=self.config.tabs.height
                    ))
                    break
                    
                current_distance += segment_length
        
        return tabs
    
    def _get_segment_length(self, geom: Geometry) -> float:
        """Get length of a geometry segment"""
        if geom.type == 'line':
            dx = geom.end[0] - geom.start[0]
            dy = geom.end[1] - geom.start[1]
            return np.sqrt(dx**2 + dy**2)
        elif geom.type == 'arc':
            angle_diff = abs(geom.end_angle - geom.start_angle)
            return geom.radius * np.radians(angle_diff)
        elif geom.type == 'circle':
            return 2 * np.pi * geom.radius
        return 0
    
    def _create_tab_on_segment(self, geom: Geometry, distance: float, 
                             tab_width: float) -> Tuple[Tuple[float, float], Tuple[float, float]]:
        """Create tab points on a geometry segment"""
        half_width = tab_width / 2
        
        if geom.type == 'line':
            # Parametric position along line
            total_length = self._get_segment_length(geom)
            t = distance / total_length
            
            # Center point of tab
            center_x = geom.start[0] + t * (geom.end[0] - geom.start[0])
            center_y = geom.start[1] + t * (geom.end[1] - geom.start[1])
            
            # Direction vector
            dx = geom.end[0] - geom.start[0]
            dy = geom.end[1] - geom.start[1]
            length = np.sqrt(dx**2 + dy**2)
            dx /= length
            dy /= length
            
            # Tab start and end points
            start = (center_x - dx * half_width, center_y - dy * half_width)
            end = (center_x + dx * half_width, center_y + dy * half_width)
            
            return start, end
            
        elif geom.type == 'arc':
            # Calculate angle for position
            total_angle = np.radians(abs(geom.end_angle - geom.start_angle))
            angle_offset = distance / geom.radius
            
            center_angle = np.radians(geom.start_angle) + angle_offset
            angle_delta = half_width / geom.radius
            
            # Tab start and end angles
            start_angle = center_angle - angle_delta
            end_angle = center_angle + angle_delta
            
            # Convert to points
            start = (
                geom.center[0] + geom.radius * np.cos(start_angle),
                geom.center[1] + geom.radius * np.sin(start_angle)
            )
            end = (
                geom.center[0] + geom.radius * np.cos(end_angle),
                geom.center[1] + geom.radius * np.sin(end_angle)
            )
            
            return start, end
            
        # Default fallback
        return geom.start, geom.start
    
    def _cut_contour_with_tabs(self, contour: List[Geometry], tabs: List[Tab], 
                              z_depth: float) -> List[Tuple[float, float, float]]:
        """Generate cutting points for contour with tab handling"""
        points = []
        tab_height = z_depth + self.config.tabs.height
        
        # Track which tabs we've processed
        processed_tabs = set()
        
        for geom in contour:
            # Check if this segment contains any tabs
            segment_tabs = []
            for i, tab in enumerate(tabs):
                if i not in processed_tabs and self._tab_on_segment(geom, tab):
                    segment_tabs.append((i, tab))
                    processed_tabs.add(i)
            
            if not segment_tabs:
                # No tabs, cut normally
                points.extend(self._cut_segment(geom, z_depth))
            else:
                # Cut segment with tabs
                points.extend(self._cut_segment_with_tabs(geom, segment_tabs, z_depth, tab_height))
        
        return points
    
    def _tab_on_segment(self, geom: Geometry, tab: Tab) -> bool:
        """Check if a tab is on a specific geometry segment"""
        # Simplified: check if tab start point is close to segment
        if geom.type == 'line':
            # Check if tab start is on line segment
            return self._point_on_line(tab.start_point, geom.start, geom.end)
        elif geom.type == 'arc':
            # Check if tab start is on arc
            return self._point_on_arc(tab.start_point, geom)
        return False
    
    def _point_on_line(self, point: Tuple[float, float], 
                      start: Tuple[float, float], 
                      end: Tuple[float, float], 
                      tolerance: float = 0.1) -> bool:
        """Check if point is on line segment"""
        # Calculate distance from point to line
        line_vec = np.array([end[0] - start[0], end[1] - start[1]])
        line_len = np.linalg.norm(line_vec)
        
        if line_len < tolerance:
            return False
            
        line_vec /= line_len
        
        point_vec = np.array([point[0] - start[0], point[1] - start[1]])
        proj_len = np.dot(point_vec, line_vec)
        
        # Check if projection is within segment
        if proj_len < 0 or proj_len > line_len:
            return False
            
        # Calculate perpendicular distance
        proj_point = start + proj_len * line_vec
        dist = np.linalg.norm(point - proj_point)
        
        return dist < tolerance
    
    def _point_on_arc(self, point: Tuple[float, float], arc: Geometry, 
                     tolerance: float = 0.1) -> bool:
        """Check if point is on arc"""
        # Check distance from center
        dist = np.sqrt((point[0] - arc.center[0])**2 + (point[1] - arc.center[1])**2)
        
        if abs(dist - arc.radius) > tolerance:
            return False
            
        # Check if angle is within arc range
        angle = np.degrees(np.arctan2(point[1] - arc.center[1], point[0] - arc.center[0]))
        
        return self._angle_in_range(angle, arc.start_angle, arc.end_angle)
    
    def _angle_in_range(self, angle: float, start: float, end: float) -> bool:
        """Check if angle is within range"""
        angle = angle % 360
        start = start % 360
        end = end % 360
        
        if start <= end:
            return start <= angle <= end
        else:
            return angle >= start or angle <= end
    
    def _cut_segment(self, geom: Geometry, z: float) -> List[Tuple[float, float, float]]:
        """Generate cutting points for a segment"""
        points = []
        
        if geom.type == 'line':
            points.append((geom.start[0], geom.start[1], z))
            points.append((geom.end[0], geom.end[1], z))
        elif geom.type == 'arc':
            # Generate points along arc
            points.extend(self._interpolate_arc(geom, z))
        
        return points
    
    def _cut_segment_with_tabs(self, geom: Geometry, tabs: List[Tuple[int, Tab]], 
                              z_cut: float, z_tab: float) -> List[Tuple[float, float, float]]:
        """Cut segment with tab handling"""
        points = []
        
        # Sort tabs by position along segment
        # For now, simplified implementation
        for i, tab in tabs:
            # Cut to tab start
            points.append((tab.start_point[0], tab.start_point[1], z_cut))
            
            # Ramp up for tab
            points.append((tab.start_point[0], tab.start_point[1], z_tab))
            
            # Move over tab
            points.append((tab.end_point[0], tab.end_point[1], z_tab))
            
            # Ramp down after tab
            points.append((tab.end_point[0], tab.end_point[1], z_cut))
        
        # Complete the segment
        points.append((geom.end[0], geom.end[1], z_cut))
        
        return points
    
    def _interpolate_arc(self, arc: Geometry, z: float, 
                        segments_per_mm: float = 0.1) -> List[Tuple[float, float, float]]:
        """Interpolate points along an arc"""
        points = []
        
        # Calculate number of segments based on arc length
        arc_length = self._get_segment_length(arc)
        num_segments = max(3, int(arc_length * segments_per_mm))
        
        # Generate points
        start_angle_rad = np.radians(arc.start_angle)
        end_angle_rad = np.radians(arc.end_angle)
        
        # Handle arc direction
        if end_angle_rad < start_angle_rad:
            end_angle_rad += 2 * np.pi
            
        for i in range(num_segments + 1):
            t = i / num_segments
            angle = start_angle_rad + t * (end_angle_rad - start_angle_rad)
            
            x = arc.center[0] + arc.radius * np.cos(angle)
            y = arc.center[1] + arc.radius * np.sin(angle)
            
            points.append((x, y, z))
        
        return points
    
    def _generate_pocket_toolpath(self, contour: List[Geometry]) -> Toolpath:
        """Generate toolpath for pocketing (inside cuts)"""
        # Simplified pocket toolpath - just offset inward
        points = []
        
        # Calculate center
        bbox = self._calculate_bbox(contour)
        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2
        
        # Start from center and spiral out (or use other strategy)
        # For now, just do a simple contour
        start_point = contour[0].start
        
        # Safety height approach
        points.append((start_point[0], start_point[1], self.config.safety_height))
        
        # Cut in steps
        current_depth = 0
        while current_depth < self.config.material.thickness:
            current_depth = min(current_depth + self.config.material.step_down,
                              self.config.material.thickness)
            
            # Cut the contour
            for geom in contour:
                points.extend(self._cut_segment(geom, -current_depth))
        
        # Retract
        points.append((start_point[0], start_point[1], self.config.safety_height))
        
        return Toolpath(
            type='pocket',
            points=points,
            feed_rate=self.config.material.feed_rate,
            plunge_rate=self.config.material.plunge_rate
        )
    
    def _calculate_bbox(self, contour: List[Geometry]) -> Tuple[float, float, float, float]:
        """Calculate bounding box of a contour"""
        points = []
        
        for geom in contour:
            points.append(geom.start)
            if geom.end:
                points.append(geom.end)
        
        x_coords = [p[0] for p in points]
        y_coords = [p[1] for p in points]
        
        return (min(x_coords), min(y_coords), max(x_coords), max(y_coords))
    
    def _optimize_toolpath_order(self, toolpaths: List[Toolpath]) -> List[Toolpath]:
        """Optimize toolpath order to minimize rapid moves"""
        # Simple nearest-neighbor optimization
        if len(toolpaths) <= 1:
            return toolpaths
        
        optimized = [toolpaths[0]]
        remaining = toolpaths[1:]
        
        while remaining:
            last_point = optimized[-1].points[-1]
            
            # Find nearest toolpath
            min_dist = float('inf')
            nearest_idx = 0
            
            for i, tp in enumerate(remaining):
                first_point = tp.points[0]
                dist = np.sqrt((first_point[0] - last_point[0])**2 + 
                             (first_point[1] - last_point[1])**2)
                
                if dist < min_dist:
                    min_dist = dist
                    nearest_idx = i
            
            optimized.append(remaining.pop(nearest_idx))
        
        return optimized