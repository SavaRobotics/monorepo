"""DXF parser for extracting nested parts and geometries"""

import ezdxf
from typing import List, Dict, Tuple, Optional, Set
import numpy as np
from shapely.geometry import Polygon, Point, LineString, MultiPolygon
from shapely.ops import unary_union, polygonize
import logging
from collections import defaultdict
import math

logger = logging.getLogger(__name__)

class DXFParser:
    def __init__(self, dxf_path: str):
        self.dxf_path = dxf_path
        self.doc = ezdxf.readfile(dxf_path)
        self.msp = self.doc.modelspace()
        self.parts = []
        self.internal_features = []
        
    def parse(self) -> Dict:
        """Parse DXF and extract all geometries"""
        # Extract all closed contours
        contours = self._extract_contours()
        
        # Classify contours as parts or internal features
        self._classify_geometries(contours)
        
        # Sort operations: internal features first
        return {
            "parts": self.parts,
            "internal_features": self.internal_features,
            "bounds": self._calculate_bounds()
        }
    
    def _extract_contours(self) -> List[Dict]:
        """Extract all closed contours from DXF"""
        contours = []
        
        # First, try to get closed polylines
        for entity in self.msp.query('LWPOLYLINE POLYLINE'):
            if entity.is_closed:
                points = []
                for point in entity.get_points():
                    points.append((point[0], point[1]))
                contours.append({
                    "type": "polyline",
                    "points": points,
                    "entity": entity
                })
        
        # Process circles
        for circle in self.msp.query('CIRCLE'):
            center = (circle.dxf.center.x, circle.dxf.center.y)
            radius = circle.dxf.radius
            contours.append({
                "type": "circle",
                "center": center,
                "radius": radius,
                "entity": circle
            })
        
        # Extract all line and arc segments for assembly
        segments = self._extract_segments()
        
        # Try two methods: custom assembly and shapely polygonize
        # Method 1: Custom assembly
        assembled_contours = self._assemble_contours(segments)
        
        # Method 2: Use Shapely's polygonize for any remaining segments
        if len(assembled_contours) == 0 and segments:
            logger.info("Custom assembly failed, trying Shapely polygonize...")
            shapely_contours = self._polygonize_segments(segments)
            contours.extend(shapely_contours)
        else:
            contours.extend(assembled_contours)
        
        logger.info(f"Found {len(contours)} total contours")
        return contours
    
    def _classify_geometries(self, contours: List[Dict]):
        """Classify contours as parts or internal features (holes)"""
        polygons = []
        
        # Convert all contours to shapely polygons
        for contour in contours:
            if contour["type"] == "polyline":
                poly = Polygon(contour["points"])
                polygons.append({
                    "geometry": poly,
                    "contour": contour,
                    "area": poly.area
                })
            elif contour["type"] == "circle":
                # Create circle polygon
                center = Point(contour["center"])
                circle_poly = center.buffer(contour["radius"])
                polygons.append({
                    "geometry": circle_poly,
                    "contour": contour,
                    "area": circle_poly.area
                })
        
        # Sort by area (largest first)
        polygons.sort(key=lambda x: x["area"], reverse=True)
        
        # Classify based on containment
        for i, poly_data in enumerate(polygons):
            poly = poly_data["geometry"]
            is_hole = False
            
            # Check if this polygon is inside any larger polygon
            for j in range(i):
                if polygons[j]["geometry"].contains(poly):
                    is_hole = True
                    # Add as internal feature to the parent part
                    parent_idx = next((idx for idx, part in enumerate(self.parts) 
                                     if part["geometry"] == polygons[j]["geometry"]), None)
                    if parent_idx is not None:
                        self.parts[parent_idx]["holes"].append(poly_data["contour"])
                    break
            
            if not is_hole:
                # This is an outer contour (part)
                self.parts.append({
                    "contour": poly_data["contour"],
                    "geometry": poly,
                    "holes": [],
                    "area": poly_data["area"]
                })
    
    def _extract_segments(self) -> List[Dict]:
        """Extract all line and arc segments from DXF"""
        segments = []
        
        # Extract lines
        for line in self.msp.query('LINE'):
            start = (line.dxf.start.x, line.dxf.start.y)
            end = (line.dxf.end.x, line.dxf.end.y)
            segments.append({
                "type": "line",
                "start": start,
                "end": end,
                "entity": line
            })
        
        # Extract arcs
        for arc in self.msp.query('ARC'):
            center = (arc.dxf.center.x, arc.dxf.center.y)
            radius = arc.dxf.radius
            start_angle = math.radians(arc.dxf.start_angle)
            end_angle = math.radians(arc.dxf.end_angle)
            
            # Calculate start and end points
            start_point = (
                center[0] + radius * math.cos(start_angle),
                center[1] + radius * math.sin(start_angle)
            )
            end_point = (
                center[0] + radius * math.cos(end_angle),
                center[1] + radius * math.sin(end_angle)
            )
            
            segments.append({
                "type": "arc",
                "start": start_point,
                "end": end_point,
                "center": center,
                "radius": radius,
                "start_angle": arc.dxf.start_angle,
                "end_angle": arc.dxf.end_angle,
                "entity": arc
            })
        
        logger.info(f"Extracted {len(segments)} segments")
        return segments
    
    def _assemble_contours(self, segments: List[Dict]) -> List[Dict]:
        """Assemble connected segments into closed contours"""
        if not segments:
            return []
        
        # Create a graph of connections with better precision
        connections = defaultdict(list)
        segment_map = {}
        
        # Build connection graph with looser tolerance
        tolerance = 0.1  # 0.1mm tolerance for connections
        for i, segment in enumerate(segments):
            segment_map[i] = segment
        
        # Create spatial index for faster endpoint matching
        all_points = []
        point_to_segments = defaultdict(list)
        
        for i, segment in enumerate(segments):
            start = segment["start"]
            end = segment["end"]
            all_points.append(start)
            all_points.append(end)
            point_to_segments[start].append((i, "start"))
            point_to_segments[end].append((i, "end"))
        
        # Build connections with tolerance
        processed_points = set()
        for point in all_points:
            if point in processed_points:
                continue
            
            # Find all points within tolerance
            nearby_points = []
            for other_point in all_points:
                if self._points_equal(point, other_point, tolerance):
                    nearby_points.append(other_point)
                    processed_points.add(other_point)
            
            # Connect all segments at these nearby points
            connected_segments = []
            for p in nearby_points:
                connected_segments.extend(point_to_segments[p])
            
            # Build connections between all connected segments
            for seg_info in connected_segments:
                seg_idx, endpoint_type = seg_info
                segment = segment_map[seg_idx]
                
                for other_seg_info in connected_segments:
                    if other_seg_info != seg_info:
                        other_idx, other_endpoint_type = other_seg_info
                        other_segment = segment_map[other_idx]
                        
                        # Determine which endpoints to connect
                        if endpoint_type == "start":
                            from_point = segment["start"]
                            to_point = segment["end"]
                        else:
                            from_point = segment["end"]
                            to_point = segment["start"]
                        
                        if other_endpoint_type == "start":
                            other_point = other_segment["start"]
                        else:
                            other_point = other_segment["end"]
                        
                        # Add connection
                        connections[self._round_point(from_point, 3)].append((self._round_point(other_point, 3), other_idx))
        
        # Find closed loops
        used_segments = set()
        contours = []
        
        # Try starting from each unused segment
        for seg_idx in range(len(segments)):
            if seg_idx not in used_segments:
                segment = segment_map[seg_idx]
                start_point = self._round_point(segment["start"], 3)
                
                # Try to build a closed contour from this segment
                contour = self._trace_contour(start_point, connections, used_segments, segment_map)
                if contour:
                    contours.append(contour)
        
        logger.info(f"Assembled {len(contours)} closed contours from segments")
        return contours
    
    def _trace_contour(self, start_point: Tuple[float, float], 
                      connections: Dict, used_segments: Set[int], 
                      segment_map: Dict) -> Optional[Dict]:
        """Trace a closed contour from a starting point"""
        tolerance = 0.5  # Tolerance for closing the loop
        path_points = []
        current_point = start_point
        path_segments = []
        visited_points = set()
        
        max_segments = 200  # Prevent infinite loops
        segment_count = 0
        
        while segment_count < max_segments:
            segment_count += 1
            
            # Find next unused segment from current point
            next_segment = None
            current_rounded = self._round_point(current_point, 3)
            
            if current_rounded in connections:
                for next_point, seg_idx in connections[current_rounded]:
                    if seg_idx not in used_segments:
                        next_segment = (next_point, seg_idx)
                        break
            
            if not next_segment:
                # No more segments, check if we can close the loop
                if len(path_points) > 2:
                    # Check if we're close to the start
                    if self._points_equal(current_point, start_point, tolerance):
                        # Successfully closed contour
                        return {
                            "type": "polyline",
                            "points": path_points,
                            "segments": path_segments
                        }
                break
            
            next_point, seg_idx = next_segment
            used_segments.add(seg_idx)
            segment = segment_map[seg_idx]
            path_segments.append(segment)
            
            # Determine correct point order for the segment
            seg_start = self._round_point(segment["start"], 3)
            seg_end = self._round_point(segment["end"], 3)
            
            # Add points based on segment type and direction
            if segment["type"] == "arc":
                # Generate arc points in correct direction
                if self._points_equal(current_point, segment["start"], 0.5):
                    arc_points = self._generate_arc_points(segment)
                else:
                    # Reverse arc direction
                    arc_points = self._generate_arc_points(segment)[::-1]
                
                path_points.extend(arc_points)
                current_point = arc_points[-1]
            else:
                # Line segment
                if self._points_equal(current_point, segment["start"], 0.5):
                    path_points.append(segment["start"])
                    path_points.append(segment["end"])
                    current_point = segment["end"]
                else:
                    path_points.append(segment["end"])
                    path_points.append(segment["start"])
                    current_point = segment["start"]
            
            # Check if we've closed the loop
            if len(path_points) > 3 and self._points_equal(current_point, start_point, tolerance):
                # Successfully closed contour
                return {
                    "type": "polyline",
                    "points": path_points,
                    "segments": path_segments
                }
        
        # Couldn't close the contour, restore used segments
        for seg in path_segments:
            for i, s in segment_map.items():
                if s == seg:
                    used_segments.discard(i)
        
        return None
    
    def _polygonize_segments(self, segments: List[Dict]) -> List[Dict]:
        """Use Shapely's polygonize to create polygons from segments"""
        from shapely.ops import polygonize, linemerge
        
        # Convert segments to LineString objects
        lines = []
        for segment in segments:
            if segment["type"] == "line":
                line = LineString([segment["start"], segment["end"]])
                lines.append(line)
            elif segment["type"] == "arc":
                # Convert arc to linestring with multiple points
                arc_points = self._generate_arc_points(segment, num_points=30)
                if len(arc_points) >= 2:
                    line = LineString(arc_points)
                    lines.append(line)
        
        if not lines:
            return []
        
        # Try to merge connected lines first
        try:
            merged = linemerge(lines)
            if hasattr(merged, 'geoms'):
                lines_to_polygonize = list(merged.geoms)
            else:
                lines_to_polygonize = [merged] if merged else lines
        except:
            lines_to_polygonize = lines
        
        # Create polygons from the lines
        polygons = list(polygonize(lines_to_polygonize))
        
        # Filter out very small polygons (likely artifacts)
        min_area = 10.0  # mm²
        valid_polygons = [p for p in polygons if p.area > min_area]
        
        logger.info(f"Shapely polygonize created {len(valid_polygons)} polygons from {len(segments)} segments")
        
        # Convert to our contour format
        contours = []
        for poly in valid_polygons:
            if hasattr(poly.exterior, 'coords'):
                points = list(poly.exterior.coords)
                contours.append({
                    "type": "polyline",
                    "points": points,
                    "polygon": poly
                })
        
        return contours
    
    def _generate_arc_points(self, arc_segment: Dict, num_points: int = 20) -> List[Tuple[float, float]]:
        """Generate points along an arc"""
        center = arc_segment["center"]
        radius = arc_segment["radius"]
        start_angle = math.radians(arc_segment["start_angle"])
        end_angle = math.radians(arc_segment["end_angle"])
        
        # Handle arc direction
        if end_angle < start_angle:
            end_angle += 2 * math.pi
        
        angles = np.linspace(start_angle, end_angle, num_points)
        points = []
        
        for angle in angles:
            x = center[0] + radius * math.cos(angle)
            y = center[1] + radius * math.sin(angle)
            points.append((x, y))
        
        return points
    
    def _round_point(self, point: Tuple[float, float], precision: int = 6) -> Tuple[float, float]:
        """Round point coordinates for comparison"""
        return (round(point[0], precision), round(point[1], precision))
    
    def _points_equal(self, p1: Tuple[float, float], p2: Tuple[float, float], 
                     tolerance: float = 1e-6) -> bool:
        """Check if two points are equal within tolerance"""
        return abs(p1[0] - p2[0]) < tolerance and abs(p1[1] - p2[1]) < tolerance
    
    def _calculate_bounds(self) -> Dict:
        """Calculate overall bounds of all parts"""
        all_points = []
        
        for part in self.parts:
            if part["contour"]["type"] == "polyline":
                all_points.extend(part["contour"]["points"])
            elif part["contour"]["type"] == "circle":
                center = part["contour"]["center"]
                radius = part["contour"]["radius"]
                all_points.extend([
                    (center[0] - radius, center[1] - radius),
                    (center[0] + radius, center[1] + radius)
                ])
        
        if not all_points:
            return {"min_x": 0, "min_y": 0, "max_x": 0, "max_y": 0}
        
        x_coords = [p[0] for p in all_points]
        y_coords = [p[1] for p in all_points]
        
        return {
            "min_x": min(x_coords),
            "min_y": min(y_coords),
            "max_x": max(x_coords),
            "max_y": max(y_coords)
        }