"""
PyCAM integration for polygon offsetting and contour processing
"""

import sys
import os
from typing import List, Tuple
import numpy as np

# Add PyCAM to path
pycam_path = os.path.join(os.path.dirname(__file__), '..', 'temp_pycam')
if os.path.exists(pycam_path):
    sys.path.insert(0, pycam_path)

try:
    from pycam.Geometry.Polygon import Polygon
    from pycam.Geometry.Line import Line
    from pycam.Geometry.Plane import Plane
    PYCAM_AVAILABLE = True
except ImportError:
    PYCAM_AVAILABLE = False

from .dxf_processor import Geometry


class PyCAMOffsetProcessor:
    """Use PyCAM's polygon offsetting capabilities"""
    
    def __init__(self):
        if not PYCAM_AVAILABLE:
            raise ImportError("PyCAM is not available")
        # Default plane for 2D operations (XY plane, Z pointing up)
        self.plane = Plane((0, 0, 0), (0, 0, 1))
    
    def geometry_to_pycam_polygon(self, geometries: List[Geometry]):
        """Convert our Geometry objects to a PyCAM Polygon"""
        if not geometries:
            return None
            
        # First, convert all geometries to line segments
        lines = []
        for geom in geometries:
            if geom.type == 'line':
                lines.append({
                    'start': (geom.start[0], geom.start[1], 0),
                    'end': (geom.end[0], geom.end[1], 0)
                })
            elif geom.type == 'arc':
                # Convert arc to line segments
                arc_points = self._interpolate_arc(geom)
                for j in range(len(arc_points) - 1):
                    lines.append({
                        'start': (arc_points[j][0], arc_points[j][1], 0),
                        'end': (arc_points[j + 1][0], arc_points[j + 1][1], 0)
                    })
        
        if not lines:
            return None
            
        # Create polygon and add first line
        polygon = Polygon(self.plane)
        first_line = Line(lines[0]['start'], lines[0]['end'])
        polygon.append(first_line)
        
        # Add remaining lines, ensuring connectivity
        current_end = lines[0]['end']
        for i in range(1, len(lines)):
            line_data = lines[i]
            # Ensure the line connects properly by using the previous end point
            # This handles any small numerical differences
            line = Line(current_end, line_data['end'])
            polygon.append(line)
            current_end = line_data['end']
        
        # Close the polygon if needed
        if polygon._points and polygon._points[0] != polygon._points[-1]:
            try:
                closing_line = Line(polygon._points[-1], polygon._points[0])
                polygon.append(closing_line)
            except:
                pass  # Polygon might already be closed
                
        return polygon
    
    def _interpolate_arc(self, arc: Geometry, segments_per_mm: float = 0.5) -> List[Tuple[float, float]]:
        """Interpolate arc into points for polygon conversion"""
        # Calculate arc length
        angle_diff = abs(arc.end_angle - arc.start_angle)
        if angle_diff == 0:
            angle_diff = 360  # Full circle
        arc_length = arc.radius * np.radians(angle_diff)
        
        # Calculate number of segments
        num_segments = max(3, int(arc_length * segments_per_mm))
        
        points = []
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
            points.append((x, y))
        
        return points
    
    def pycam_polygon_to_geometry(self, polygon) -> List[Geometry]:
        """Convert PyCAM Polygon back to our Geometry format"""
        geometries = []
        points = polygon.get_points()
        
        for i in range(len(points) - 1):
            start = (points[i][0], points[i][1])
            end = (points[i + 1][0], points[i + 1][1])
            
            geom = Geometry(
                type='line',
                start=start,
                end=end
            )
            geometries.append(geom)
        
        # Close the polygon if needed
        if polygon.is_closed and len(points) > 2:
            start = (points[-1][0], points[-1][1])
            end = (points[0][0], points[0][1])
            
            geom = Geometry(
                type='line',
                start=start,
                end=end
            )
            geometries.append(geom)
        
        return geometries
    
    def offset_contour(self, geometries: List[Geometry], offset: float) -> List[List[Geometry]]:
        """
        Offset a contour using PyCAM's polygon offsetting
        
        Args:
            geometries: List of Geometry objects forming a contour
            offset: Offset distance (positive = outward, negative = inward)
            
        Returns:
            List of offset contours (multiple if the offset creates islands)
        """
        # Convert to PyCAM polygon
        polygon = self.geometry_to_pycam_polygon(geometries)
        if not polygon:
            return []
        
        # Get offset polygons
        offset_polygons = polygon.get_offset_polygons(offset)
        
        # Convert back to our format
        result = []
        for offset_poly in offset_polygons:
            offset_geometries = self.pycam_polygon_to_geometry(offset_poly)
            if offset_geometries:
                result.append(offset_geometries)
        
        return result
    
