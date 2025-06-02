import ezdxf
from ezdxf.entities import LWPolyline, Line, Arc, Circle
from typing import List, Dict, Tuple, Optional, Any
import numpy as np
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class Geometry:
    """Represents a geometric entity"""
    type: str  # 'line', 'arc', 'circle'
    start: Tuple[float, float]
    end: Optional[Tuple[float, float]] = None
    center: Optional[Tuple[float, float]] = None
    radius: Optional[float] = None
    start_angle: Optional[float] = None
    end_angle: Optional[float] = None

@dataclass
class Part:
    """Represents a single part with its contours"""
    id: int
    outer_contour: List[Geometry]
    holes: List[List[Geometry]]
    bounding_box: Tuple[float, float, float, float]  # min_x, min_y, max_x, max_y

class DXFProcessor:
    def __init__(self, tolerance: float = 0.001):
        self.tolerance = tolerance
        self.parts: List[Part] = []
        self.sheet_boundary: Optional[Tuple[float, float, float, float]] = None
        
    def load_dxf(self, file_path: str, layer_filter: Optional[str] = None) -> Dict[str, Any]:
        """Load and analyze a DXF file"""
        doc = ezdxf.readfile(file_path)
        msp = doc.modelspace()
        
        # Get sheet boundary
        self._extract_boundary(msp)
        
        # Extract all entities from specified layer
        entities = []
        for entity in msp:
            if layer_filter and hasattr(entity, 'dxf') and entity.dxf.layer != layer_filter:
                continue
            entities.append(entity)
        
        # Convert entities to geometry
        geometries = self._entities_to_geometries(entities)
        
        # Find connected contours and identify parts
        all_parts = self._find_parts(geometries)
        
        # Filter out sheet boundary if it exists
        self.parts = []
        
        # First, identify the largest part (likely the sheet)
        if len(all_parts) > 1:
            # Calculate areas of all parts
            part_areas = []
            for i, part in enumerate(all_parts):
                width = part.bounding_box[2] - part.bounding_box[0]
                height = part.bounding_box[3] - part.bounding_box[1]
                area = width * height
                part_areas.append((i, area, part))
            
            # Sort by area (largest first)
            part_areas.sort(key=lambda x: x[1], reverse=True)
            print(part_areas)
            # If the largest part is significantly bigger than the second largest, it's likely the sheet
            if len(part_areas) >= 2:
                largest_area = part_areas[0][1]
                second_largest_area = part_areas[1][1]
                
                # If largest is more than 10x bigger than second largest, it's probably the sheet
                if largest_area > second_largest_area * 10:
                    sheet_part = part_areas[0][2]
                    bbox = sheet_part.bounding_box
                    logger.info(f"Filtered out sheet boundary (largest part): {bbox[2]-bbox[0]:.1f}x{bbox[3]-bbox[1]:.1f}mm, area={largest_area:.0f}mm²")
                    
                    # Add all parts except the sheet
                    for idx, area, part in part_areas[1:]:
                        self.parts.append(part)
                else:
                    # No clear sheet boundary, keep all parts
                    self.parts = all_parts
            else:
                self.parts = all_parts
        else:
            self.parts = all_parts
        
        logger.info(f"Loaded DXF with {len(self.parts)} parts")
        
        return {
            "parts_count": len(self.parts),
            "sheet_boundary": self.sheet_boundary,
            "layers": list(set(e.dxf.layer for e in msp if hasattr(e, 'dxf'))),
            "total_entities": len(entities)
        }
    
    def _extract_boundary(self, msp):
        """Extract sheet boundary from BOUNDARY layer"""
        for entity in msp:
            if hasattr(entity, 'dxf') and entity.dxf.layer == 'BOUNDARY':
                if isinstance(entity, LWPolyline):
                    points = list(entity.get_points())
                    if points:
                        x_coords = [p[0] for p in points]
                        y_coords = [p[1] for p in points]
                        self.sheet_boundary = (
                            min(x_coords), min(y_coords),
                            max(x_coords), max(y_coords)
                        )
                        break
    
    def _entities_to_geometries(self, entities) -> List[Geometry]:
        """Convert DXF entities to internal geometry representation"""
        geometries = []
        
        for entity in entities:
            if isinstance(entity, Line):
                start = (entity.dxf.start.x, entity.dxf.start.y)
                end = (entity.dxf.end.x, entity.dxf.end.y)
                geometries.append(Geometry(
                    type='line',
                    start=start,
                    end=end
                ))
                
            elif isinstance(entity, Arc):
                center = (entity.dxf.center.x, entity.dxf.center.y)
                geometries.append(Geometry(
                    type='arc',
                    start=self._point_on_arc(entity, entity.dxf.start_angle),
                    end=self._point_on_arc(entity, entity.dxf.end_angle),
                    center=center,
                    radius=entity.dxf.radius,
                    start_angle=entity.dxf.start_angle,
                    end_angle=entity.dxf.end_angle
                ))
                
            elif isinstance(entity, Circle):
                center = (entity.dxf.center.x, entity.dxf.center.y)
                # Convert circle to a closed arc
                geometries.append(Geometry(
                    type='circle',
                    start=(center[0] + entity.dxf.radius, center[1]),
                    end=(center[0] + entity.dxf.radius, center[1]),
                    center=center,
                    radius=entity.dxf.radius,
                    start_angle=0,
                    end_angle=360
                ))
                
            elif isinstance(entity, LWPolyline):
                points = list(entity.get_points())
                for i in range(len(points) - 1):
                    start = (points[i][0], points[i][1])
                    end = (points[i+1][0], points[i+1][1])
                    
                    # Check for bulge (arc)
                    if len(points[i]) > 4 and points[i][4] != 0:  # Has bulge
                        # Convert bulge to arc
                        arc_data = self._bulge_to_arc(start, end, points[i][4])
                        geometries.append(Geometry(
                            type='arc',
                            start=start,
                            end=end,
                            **arc_data
                        ))
                    else:
                        geometries.append(Geometry(
                            type='line',
                            start=start,
                            end=end
                        ))
                
                # Close polyline if needed
                if entity.is_closed and len(points) > 2:
                    start = (points[-1][0], points[-1][1])
                    end = (points[0][0], points[0][1])
                    geometries.append(Geometry(
                        type='line',
                        start=start,
                        end=end
                    ))
        
        return geometries
    
    def _point_on_arc(self, arc, angle_deg) -> Tuple[float, float]:
        """Calculate point on arc at given angle"""
        angle_rad = np.radians(angle_deg)
        x = arc.dxf.center.x + arc.dxf.radius * np.cos(angle_rad)
        y = arc.dxf.center.y + arc.dxf.radius * np.sin(angle_rad)
        return (x, y)
    
    def _bulge_to_arc(self, start: Tuple[float, float], end: Tuple[float, float], bulge: float) -> Dict:
        """Convert bulge value to arc parameters"""
        # Calculate arc from bulge
        chord_length = np.sqrt((end[0] - start[0])**2 + (end[1] - start[1])**2)
        sagitta = abs(bulge) * chord_length / 2
        radius = (chord_length**2 / 4 + sagitta**2) / (2 * sagitta)
        
        # Find center
        mid_x = (start[0] + end[0]) / 2
        mid_y = (start[1] + end[1]) / 2
        
        # Direction perpendicular to chord
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        
        # Perpendicular direction
        if bulge > 0:
            perp_x = -dy
            perp_y = dx
        else:
            perp_x = dy
            perp_y = -dx
            
        # Normalize
        length = np.sqrt(perp_x**2 + perp_y**2)
        if length > 0:
            perp_x /= length
            perp_y /= length
        
        # Distance from midpoint to center
        h = radius - sagitta
        
        # Center point
        center_x = mid_x + perp_x * h
        center_y = mid_y + perp_y * h
        
        # Calculate angles
        start_angle = np.degrees(np.arctan2(start[1] - center_y, start[0] - center_x))
        end_angle = np.degrees(np.arctan2(end[1] - center_y, end[0] - center_x))
        
        return {
            'center': (center_x, center_y),
            'radius': radius,
            'start_angle': start_angle,
            'end_angle': end_angle
        }
    
    def _find_parts(self, geometries: List[Geometry]) -> List[Part]:
        """Find connected contours and group them into parts"""
        # Build connectivity graph
        remaining = geometries.copy()
        parts = []
        part_id = 0
        
        while remaining:
            # Start a new contour
            contour = []
            current = remaining.pop(0)
            contour.append(current)
            
            # Find connected geometries
            while True:
                found = False
                current_end = current.end if current.end else current.start
                
                for i, geom in enumerate(remaining):
                    if self._points_equal(current_end, geom.start):
                        current = remaining.pop(i)
                        contour.append(current)
                        found = True
                        break
                    elif geom.end and self._points_equal(current_end, geom.end):
                        # Reverse the geometry
                        geom.start, geom.end = geom.end, geom.start
                        if geom.type == 'arc':
                            geom.start_angle, geom.end_angle = geom.end_angle, geom.start_angle
                        current = remaining.pop(i)
                        contour.append(current)
                        found = True
                        break
                
                if not found:
                    break
            
            # Check if contour is closed
            if contour and self._is_closed_contour(contour):
                bbox = self._calculate_bbox(contour)
                area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                
                # Simple heuristic: small closed contours are holes
                if area < 500:
                    # This is likely a hole, will be assigned to a part later
                    pass
                else:
                    parts.append(Part(
                        id=part_id,
                        outer_contour=contour,
                        holes=[],
                        bounding_box=bbox
                    ))
                    part_id += 1
        
        # TODO: Assign holes to parts based on containment
        
        return parts
    
    def _points_equal(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> bool:
        """Check if two points are equal within tolerance"""
        return abs(p1[0] - p2[0]) < self.tolerance and abs(p1[1] - p2[1]) < self.tolerance
    
    def _is_closed_contour(self, contour: List[Geometry]) -> bool:
        """Check if a contour is closed"""
        if not contour:
            return False
        
        first_start = contour[0].start
        last_end = contour[-1].end if contour[-1].end else contour[-1].start
        
        return self._points_equal(first_start, last_end)
    
    def _calculate_bbox(self, contour: List[Geometry]) -> Tuple[float, float, float, float]:
        """Calculate bounding box of a contour"""
        points = []
        
        for geom in contour:
            points.append(geom.start)
            if geom.end:
                points.append(geom.end)
            
            # Add arc extremes if needed
            if geom.type == 'arc' and geom.center:
                # Simplified: just add cardinal points that are within arc range
                for angle in [0, 90, 180, 270]:
                    if self._angle_in_arc(angle, geom.start_angle, geom.end_angle):
                        x = geom.center[0] + geom.radius * np.cos(np.radians(angle))
                        y = geom.center[1] + geom.radius * np.sin(np.radians(angle))
                        points.append((x, y))
        
        x_coords = [p[0] for p in points]
        y_coords = [p[1] for p in points]
        
        return (min(x_coords), min(y_coords), max(x_coords), max(y_coords))
    
    def _angle_in_arc(self, angle: float, start: float, end: float) -> bool:
        """Check if angle is within arc range"""
        # Normalize angles
        angle = angle % 360
        start = start % 360
        end = end % 360
        
        if start <= end:
            return start <= angle <= end
        else:
            return angle >= start or angle <= end