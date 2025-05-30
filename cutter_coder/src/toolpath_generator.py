import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
import logging

from .config import CuttingConfig, TabConfig
from .dxf_processor import Part, Geometry
from .pycam_integration import PyCAMOffsetProcessor, PYCAM_AVAILABLE

logger = logging.getLogger(__name__)

@dataclass
class ToolpathMove:
    """Represents a single move in a toolpath"""
    type: str  # 'rapid', 'line', 'arc'
    start: Tuple[float, float, float]
    end: Tuple[float, float, float]
    center: Optional[Tuple[float, float]] = None  # For arcs
    clockwise: bool = True  # For arcs

@dataclass
class Toolpath:
    """Represents a complete toolpath"""
    type: str  # 'contour', 'pocket', 'drill'
    moves: List[ToolpathMove]  # List of moves instead of points
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
        
        # Initialize PyCAM offset processor if available
        self.offset_processor = None
        if PYCAM_AVAILABLE:
            try:
                self.offset_processor = PyCAMOffsetProcessor()
                logger.info("PyCAM offset processor initialized successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize PyCAM offset processor: {e}")
        
    def generate_toolpaths(self, parts: List[Part]) -> List[Toolpath]:
        """Generate toolpaths for all parts"""
        self.toolpaths = []
        
        for i, part in enumerate(parts):
            # Log part info
            bbox = part.bounding_box
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            logger.info(f"Processing part {i}: {width:.1f} x {height:.1f} mm")
            
            # Generate outer contour toolpath with tabs
            contour_path = self._generate_contour_with_tabs(part)
            self.toolpaths.append(contour_path)
            
            # Generate toolpaths for holes (no tabs needed)
            for hole in part.holes:
                hole_path = self._generate_hole_toolpath(hole)
                self.toolpaths.append(hole_path)
        
        return self.toolpaths
    
    def _generate_contour_with_tabs(self, part: Part) -> Toolpath:
        """Generate contour toolpath with holding tabs"""
        contour = part.outer_contour
        
        # Apply tool offset to the contour
        # For outer contours, we offset inward (negative) by tool radius
        tool_radius = self.config.tool.diameter / 2.0
        offset_contours = []
        
        if self.offset_processor:
            try:
                # Negative offset for outer contours (cut on the inside)
                offset_contours = self.offset_processor.offset_contour(contour, -tool_radius)
                if offset_contours:
                    logger.info(f"Applied tool offset of {-tool_radius}mm to outer contour")
                    logger.info(f"  Original contour: {len(contour)} segments")
                    logger.info(f"  Offset resulted in {len(offset_contours)} contour(s)")
                    
                    # Filter out tiny contours that may be artifacts
                    valid_contours = []
                    for i, offset_contour in enumerate(offset_contours):
                        bbox = self._calculate_bbox(offset_contour)
                        width = bbox[2] - bbox[0]
                        height = bbox[3] - bbox[1]
                        area = width * height
                        
                        # Skip contours smaller than 1mm x 1mm or area less than 10 mm²
                        if width < 1 or height < 1 or area < 10:
                            logger.warning(f"  Skipping tiny offset contour {i}: {width:.3f} x {height:.3f} mm (area={area:.3f} mm²)")
                        else:
                            logger.info(f"  Valid offset contour {i}: {width:.3f} x {height:.3f} mm")
                            valid_contours.append(offset_contour)
                    
                    if valid_contours:
                        # Use the largest valid contour
                        contour = max(valid_contours, key=lambda c: (
                            (self._calculate_bbox(c)[2] - self._calculate_bbox(c)[0]) * 
                            (self._calculate_bbox(c)[3] - self._calculate_bbox(c)[1])
                        ))
                        logger.info(f"  Using largest valid offset contour with {len(contour)} segments")
                    else:
                        logger.warning("  No valid offset contours found, using original")
                else:
                    logger.warning("Tool offset resulted in no valid contour, using original")
            except Exception as e:
                logger.error(f"Failed to apply tool offset: {e}")
                logger.info("Falling back to original contour")
        else:
            logger.warning("No offset processor available, cutting on geometry line")
        
        # Calculate total contour length
        total_length = self._calculate_contour_length(contour)
        
        # Determine tab positions
        tabs = self._calculate_tab_positions(contour, total_length)
        
        # Generate toolpath moves
        moves = []
        current_z = self.config.safety_height
        
        # Move to start position
        start_point = contour[0].start
        
        # Initial rapid to start position
        moves.append(ToolpathMove(
            type='rapid',
            start=(0, 0, current_z),
            end=(start_point[0], start_point[1], current_z)
        ))
        
        # Multiple passes for step-down
        current_depth = 0
        while current_depth < self.config.material.thickness:
            current_depth = min(current_depth + self.config.material.step_down, 
                              self.config.material.thickness)
            
            # Plunge to depth
            moves.append(ToolpathMove(
                type='line',
                start=(start_point[0], start_point[1], moves[-1].end[2]),
                end=(start_point[0], start_point[1], -current_depth)
            ))
            
            # Cut contour with tabs
            contour_moves = self._generate_contour_moves(contour, tabs, -current_depth)
            moves.extend(contour_moves)
        
        # Retract to safety height
        last_pos = moves[-1].end
        moves.append(ToolpathMove(
            type='rapid',
            start=last_pos,
            end=(last_pos[0], last_pos[1], self.config.safety_height)
        ))
        
        return Toolpath(
            type='contour',
            moves=moves,
            feed_rate=self.config.material.feed_rate,
            plunge_rate=self.config.material.plunge_rate
        )
    
    def _generate_hole_toolpath(self, hole: List[Geometry]) -> Toolpath:
        """Generate toolpath for a hole (no tabs)"""
        moves = []
        
        # Apply tool offset to the hole
        # For holes (inside cuts), we offset outward (positive) by tool radius
        tool_radius = self.config.tool.diameter / 2.0
        offset_holes = []
        original_hole = hole
        
        if self.offset_processor:
            try:
                # Positive offset for holes (cut on the outside)
                offset_holes = self.offset_processor.offset_contour(hole, tool_radius)
                if offset_holes:
                    logger.info(f"Applied tool offset of {tool_radius}mm to hole")
                    # Use the first offset contour
                    hole = offset_holes[0]
                else:
                    logger.warning("Tool offset resulted in no valid hole contour, using original")
            except Exception as e:
                logger.error(f"Failed to apply tool offset to hole: {e}")
                logger.info("Falling back to original hole geometry")
        else:
            logger.warning("No offset processor available, cutting on geometry line")
        
        # Find hole center and radius
        bbox = self._calculate_bbox(hole)
        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2
        radius = (bbox[2] - bbox[0]) / 2
        
        # If hole is small enough, use drilling cycle
        if radius <= self.config.tool.diameter / 2:
            # Simple drilling
            moves.append(ToolpathMove(
                type='rapid',
                start=(0, 0, self.config.safety_height),
                end=(center_x, center_y, self.config.safety_height)
            ))
            moves.append(ToolpathMove(
                type='line',
                start=(center_x, center_y, self.config.safety_height),
                end=(center_x, center_y, -self.config.material.thickness)
            ))
            moves.append(ToolpathMove(
                type='rapid',
                start=(center_x, center_y, -self.config.material.thickness),
                end=(center_x, center_y, self.config.safety_height)
            ))
            
            return Toolpath(
                type='drill',
                moves=moves,
                feed_rate=self.config.material.plunge_rate,
                plunge_rate=self.config.material.plunge_rate
            )
        else:
            # For larger holes, cut the contour
            start_point = hole[0].start
            
            # Rapid to start
            moves.append(ToolpathMove(
                type='rapid',
                start=(0, 0, self.config.safety_height),
                end=(start_point[0], start_point[1], self.config.safety_height)
            ))
            
            # Multiple passes for step-down
            current_depth = 0
            while current_depth < self.config.material.thickness:
                current_depth = min(current_depth + self.config.material.step_down, 
                                  self.config.material.thickness)
                
                # Plunge
                moves.append(ToolpathMove(
                    type='line',
                    start=(start_point[0], start_point[1], moves[-1].end[2]),
                    end=(start_point[0], start_point[1], -current_depth)
                ))
                
                # Cut hole contour
                hole_moves = self._generate_contour_moves(hole, [], -current_depth)
                moves.extend(hole_moves)
            
            # Retract
            last_pos = moves[-1].end
            moves.append(ToolpathMove(
                type='rapid',
                start=last_pos,
                end=(last_pos[0], last_pos[1], self.config.safety_height)
            ))
            
            return Toolpath(
                type='pocket',
                moves=moves,
                feed_rate=self.config.material.feed_rate,
                plunge_rate=self.config.material.plunge_rate
            )
    
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
        """Calculate optimal tab positions along contour avoiding corners"""
        tabs = []
        
        if not self.config.tabs.enabled:
            return tabs
        
        # First, identify corners in the contour
        corners = self._find_corners(contour)
        
        # Calculate number of tabs
        num_tabs = max(
            self.config.tabs.min_tabs_per_part,
            int(total_length / self.config.tabs.spacing)
        )
        
        # Try to distribute tabs evenly while avoiding corners
        tab_spacing = total_length / num_tabs
        
        # Generate candidate positions
        candidate_positions = []
        for i in range(num_tabs * 3):  # Generate 3x candidates to have options
            distance = (i * tab_spacing / 3) % total_length
            if self._is_valid_tab_position(distance, corners, total_length):
                candidate_positions.append(distance)
        
        # Select the best num_tabs positions
        if len(candidate_positions) >= num_tabs:
            # Sort and pick evenly distributed ones
            candidate_positions.sort()
            selected_positions = []
            
            # Start with the first valid position
            if candidate_positions:
                selected_positions.append(candidate_positions[0])
                
                # Add remaining positions with maximum spacing
                while len(selected_positions) < num_tabs and candidate_positions:
                    best_pos = None
                    best_min_dist = 0
                    
                    for pos in candidate_positions:
                        if pos not in selected_positions:
                            # Calculate minimum distance to already selected positions
                            min_dist = float('inf')
                            for sel_pos in selected_positions:
                                dist = min(abs(pos - sel_pos), total_length - abs(pos - sel_pos))
                                min_dist = min(min_dist, dist)
                            
                            if min_dist > best_min_dist:
                                best_min_dist = min_dist
                                best_pos = pos
                    
                    if best_pos is not None:
                        selected_positions.append(best_pos)
                    else:
                        break
        else:
            # Fallback: use original positions but check for corners
            selected_positions = []
            for i in range(num_tabs):
                target_distance = i * tab_spacing + tab_spacing / 2
                # Adjust if too close to corner
                adjusted_distance = self._adjust_position_away_from_corners(
                    target_distance, corners, total_length
                )
                selected_positions.append(adjusted_distance)
        
        # Create tabs at selected positions
        for target_distance in selected_positions:
            # Find the geometry segment containing this position
            current_distance = 0
            for j, geom in enumerate(contour):
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
    
    def _find_corners(self, contour: List[Geometry]) -> List[float]:
        """Find corner positions along the contour"""
        corners = []
        current_distance = 0
        
        for i in range(len(contour)):
            prev_idx = (i - 1) % len(contour)
            curr_geom = contour[i]
            prev_geom = contour[prev_idx]
            
            # Calculate angle change at the junction
            angle_change = self._calculate_angle_change(prev_geom, curr_geom)
            
            # If angle change exceeds threshold, it's a corner
            if abs(angle_change) > np.radians(self.config.tabs.corner_angle_threshold):
                corners.append(current_distance)
            
            current_distance += self._get_segment_length(curr_geom)
        
        return corners
    
    def _calculate_angle_change(self, geom1: Geometry, geom2: Geometry) -> float:
        """Calculate angle change between two geometry segments"""
        # Get direction vectors
        dir1 = self._get_end_direction(geom1)
        dir2 = self._get_start_direction(geom2)
        
        # Calculate angle between vectors
        dot_product = dir1[0] * dir2[0] + dir1[1] * dir2[1]
        # Clamp to [-1, 1] to handle numerical errors
        dot_product = max(-1, min(1, dot_product))
        angle = np.arccos(dot_product)
        
        # Check if it's a left or right turn
        cross_product = dir1[0] * dir2[1] - dir1[1] * dir2[0]
        if cross_product < 0:
            angle = -angle
            
        return angle
    
    def _get_end_direction(self, geom: Geometry) -> Tuple[float, float]:
        """Get the direction vector at the end of a geometry segment"""
        if geom.type == 'line':
            dx = geom.end[0] - geom.start[0]
            dy = geom.end[1] - geom.start[1]
            length = np.sqrt(dx**2 + dy**2)
            if length > 0:
                return (dx/length, dy/length)
            return (1, 0)
        elif geom.type == 'arc':
            # Tangent at end of arc
            end_angle_rad = np.radians(geom.end_angle)
            # Tangent is perpendicular to radius
            return (-np.sin(end_angle_rad), np.cos(end_angle_rad))
        return (1, 0)
    
    def _get_start_direction(self, geom: Geometry) -> Tuple[float, float]:
        """Get the direction vector at the start of a geometry segment"""
        if geom.type == 'line':
            dx = geom.end[0] - geom.start[0]
            dy = geom.end[1] - geom.start[1]
            length = np.sqrt(dx**2 + dy**2)
            if length > 0:
                return (dx/length, dy/length)
            return (1, 0)
        elif geom.type == 'arc':
            # Tangent at start of arc
            start_angle_rad = np.radians(geom.start_angle)
            # Tangent is perpendicular to radius
            return (-np.sin(start_angle_rad), np.cos(start_angle_rad))
        return (1, 0)
    
    def _is_valid_tab_position(self, distance: float, corners: List[float], 
                              total_length: float) -> bool:
        """Check if a position is valid for tab placement (not near corners)"""
        exclusion_zone = self.config.tabs.corner_exclusion_zone
        
        for corner in corners:
            # Check distance considering wrap-around
            dist_to_corner = min(
                abs(distance - corner),
                abs(distance - corner + total_length),
                abs(distance - corner - total_length)
            )
            
            if dist_to_corner < exclusion_zone:
                return False
        
        return True
    
    def _adjust_position_away_from_corners(self, position: float, corners: List[float], 
                                         total_length: float) -> float:
        """Adjust a position to move it away from corners if necessary"""
        exclusion_zone = self.config.tabs.corner_exclusion_zone
        
        # Check if position is too close to any corner
        for corner in corners:
            dist_to_corner = min(
                abs(position - corner),
                abs(position - corner + total_length),
                abs(position - corner - total_length)
            )
            
            if dist_to_corner < exclusion_zone:
                # Move position to exclusion_zone distance from corner
                # Try both directions and pick the one that moves less
                option1 = (corner + exclusion_zone) % total_length
                option2 = (corner - exclusion_zone) % total_length
                
                dist1 = min(abs(position - option1), 
                           abs(position - option1 + total_length),
                           abs(position - option1 - total_length))
                dist2 = min(abs(position - option2),
                           abs(position - option2 + total_length),
                           abs(position - option2 - total_length))
                
                if dist1 < dist2:
                    position = option1
                else:
                    position = option2
                
                break
        
        return position
    
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
    
    def _generate_contour_moves(self, contour: List[Geometry], tabs: List[Tab], 
                               z_depth: float) -> List[ToolpathMove]:
        """Generate moves for contour with proper arc handling"""
        moves = []
        current_pos = None
        
        for i, geom in enumerate(contour):
            if geom.type == 'line':
                # Simple line move
                move = ToolpathMove(
                    type='line',
                    start=(geom.start[0], geom.start[1], z_depth),
                    end=(geom.end[0], geom.end[1], z_depth)
                )
                moves.append(move)
                current_pos = move.end
                
            elif geom.type == 'arc':
                # Determine direction based on the original arc's angle progression
                angle_diff = geom.end_angle - geom.start_angle
                if angle_diff < 0:
                    angle_diff += 360
                
                clockwise = angle_diff > 180
                
                move = ToolpathMove(
                    type='arc',
                    start=(geom.start[0], geom.start[1], z_depth),
                    end=(geom.end[0], geom.end[1], z_depth),
                    center=(geom.center[0], geom.center[1]),
                    clockwise=clockwise
                )
                moves.append(move)
                current_pos = move.end
        
        return moves
    
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