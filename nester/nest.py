import ezdxf
import numpy as np
from shapely.geometry import Polygon, Point, MultiPolygon
from shapely.affinity import translate, rotate
import sys
import os
from pathlib import Path
import json
import math
from typing import List, Tuple, Dict, Optional

class DXFNester:
    def __init__(self, sheet_width=1000, sheet_height=500, spacing=2.0):
        self.sheet_width = sheet_width
        self.sheet_height = sheet_height
        self.spacing = spacing
        
    def extract_polygon_from_dxf(self, dxf_path):
        """Extract dual polygon data: collision polygon + original entities"""
        try:
            doc = ezdxf.readfile(dxf_path)
            msp = doc.modelspace()
            
            # Extract original entities for output preservation
            original_entities = []
            for entity in msp:
                if entity.dxftype() in ['LINE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ELLIPSE', 'SPLINE']:
                    original_entities.append(entity)
            
            # Extract collision polygon (existing proven approach)
            collision_polygon = self._extract_collision_polygon(doc, msp)
            
            if collision_polygon is None:
                return None
                
            return {
                'collision': collision_polygon,
                'original_entities': original_entities,
                'dxf_path': dxf_path
            }
            
        except Exception as e:
            print(f"Error reading DXF {dxf_path}: {e}")
            return None
    
    def _extract_collision_polygon(self, doc, msp):
        """Extract collision polygon using existing proven method"""
        # First try: Look for existing polylines (clean approach)
        all_polygons = []
        
        for entity in msp:
            if entity.dxftype() == 'LWPOLYLINE':
                points = []
                for point in entity.get_points():
                    points.append((point[0], point[1]))
                
                if len(points) >= 3:
                    # Close the polygon if not already closed
                    if points[0] != points[-1]:
                        points.append(points[0])
                    
                    try:
                        polygon = Polygon(points)
                        if polygon.is_valid and polygon.area > 1.0:
                            all_polygons.append(polygon)
                    except:
                        continue
            
            elif entity.dxftype() == 'POLYLINE':
                points = []
                for vertex in entity.vertices:
                    points.append((vertex.dxf.location.x, vertex.dxf.location.y))
                
                if len(points) >= 3:
                    # Close the polygon if not already closed
                    if points[0] != points[-1]:
                        points.append(points[0])
                    
                    try:
                        polygon = Polygon(points)
                        if polygon.is_valid and polygon.area > 1.0:
                            all_polygons.append(polygon)
                    except:
                        continue
        
        # If polylines worked, use them
        if all_polygons:
            largest_polygon = max(all_polygons, key=lambda p: p.area)
            if isinstance(largest_polygon, MultiPolygon):
                largest_polygon = max(largest_polygon.geoms, key=lambda p: p.area)
            return largest_polygon
        
        # Fallback: Use original approach for line/arc entities
        points = []
        
        for entity in msp:
            if entity.dxftype() == 'LINE':
                points.extend([
                    (entity.dxf.start.x, entity.dxf.start.y),
                    (entity.dxf.end.x, entity.dxf.end.y)
                ])
            elif entity.dxftype() == 'ARC':
                # Approximate arc with line segments
                center = (entity.dxf.center.x, entity.dxf.center.y)
                radius = entity.dxf.radius
                start_angle = math.radians(entity.dxf.start_angle)
                end_angle = math.radians(entity.dxf.end_angle)
                
                # Create arc points with higher resolution
                num_segments = max(16, int(abs(end_angle - start_angle) * 16))
                if end_angle < start_angle:
                    end_angle += 2 * math.pi
                
                for i in range(num_segments + 1):
                    angle = start_angle + (end_angle - start_angle) * i / num_segments
                    x = center[0] + radius * math.cos(angle)
                    y = center[1] + radius * math.sin(angle)
                    points.append((x, y))
        
        if not points:
            return None
        
        # Create polygon from all collected points using convex hull
        try:
            # Remove duplicate points
            unique_points = []
            for point in points:
                is_duplicate = False
                for existing in unique_points:
                    if abs(point[0] - existing[0]) < 0.01 and abs(point[1] - existing[1]) < 0.01:
                        is_duplicate = True
                        break
                if not is_duplicate:
                    unique_points.append(point)
            
            if len(unique_points) < 3:
                return None
            
            # Create proper alpha shape using concave hull approximation
            from shapely.geometry import MultiPoint
            points_geom = MultiPoint(unique_points)
            
            # Try different alpha shape approaches
            try:
                safety_buffer = float(os.environ.get('COLLISION_BUFFER', '2.0'))
                
                # Method 1: Very small buffer to create "tight" boundary around points
                alpha_shape = points_geom.buffer(0.1)  # Tiny buffer to connect nearby points
                
                if hasattr(alpha_shape, 'exterior') and alpha_shape.area > 1.0:
                    # Extract just the exterior boundary and add safety buffer
                    boundary_polygon = Polygon(alpha_shape.exterior.coords)
                    
                    if safety_buffer > 0:
                        final_shape = boundary_polygon.buffer(safety_buffer)
                        if isinstance(final_shape, Polygon):
                            return final_shape
                    else:
                        return boundary_polygon
                        
            except Exception as e:
                print(f"Alpha shape failed: {e}")
                pass
            
            # Fallback to convex hull
            convex_hull = points_geom.convex_hull
            
            if isinstance(convex_hull, Polygon) and convex_hull.area > 1.0:
                safety_buffer = float(os.environ.get('COLLISION_BUFFER', '2.0'))
                
                if safety_buffer > 0:
                    buffered_hull = convex_hull.buffer(safety_buffer)
                    if isinstance(buffered_hull, Polygon):
                        return buffered_hull
                    else:
                        return convex_hull
                else:
                    return convex_hull
            else:
                return None
            
        except Exception as e:
            print(f"Error creating convex hull: {e}")
            return None
    
    def _create_alpha_shape(self, points):
        """Create alpha shape (concave hull) for tighter boundary"""
        try:
            from shapely.geometry import MultiPoint
            
            # Simple alpha shape approximation
            # Create buffer around points and then get boundary
            points_geom = MultiPoint(points)
            
            # Buffer the points slightly then take the boundary
            buffered = points_geom.buffer(1.0)  # Small buffer
            
            if hasattr(buffered, 'exterior'):
                return Polygon(buffered.exterior.coords)
            else:
                return buffered
                
        except Exception:
            # Fallback to convex hull if alpha shape fails
            return MultiPoint(points).convex_hull
    
    
    def normalize_polygon(self, polygon):
        """Normalize polygon to bottom-left origin"""
        bounds = polygon.bounds
        min_x, min_y = bounds[0], bounds[1]
        return translate(polygon, -min_x, -min_y)
    
    def nest_parts(self, dxf_files):
        """Main nesting function using bottom-left fill algorithm"""
        print(f"Processing {len(dxf_files)} DXF files...")
        
        # Extract and prepare polygons
        parts = []
        unfittable_parts = []
        
        for i, dxf_file in enumerate(dxf_files):
            polygon_data = self.extract_polygon_from_dxf(dxf_file)
            if polygon_data:
                collision_polygon = polygon_data['collision']
                
                # Calculate normalization offset BEFORE normalizing
                bounds = collision_polygon.bounds
                min_x, min_y = bounds[0], bounds[1]
                normalization_offset = (min_x, min_y)
                
                # Normalize collision polygon to origin
                normalized = self.normalize_polygon(collision_polygon)
                bounds = normalized.bounds
                width = bounds[2] - bounds[0]
                height = bounds[3] - bounds[1]
                
                # Calculate centroid of normalized collision polygon for consistent rotation
                collision_centroid = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
                
                parts.append({
                    'id': i,
                    'file': dxf_file,
                    'polygon': normalized,  # collision polygon for nesting
                    'original_entities': polygon_data['original_entities'],  # original entities for output
                    'dxf_path': polygon_data['dxf_path'],
                    'normalization_offset': normalization_offset,  # track how much we normalized
                    'collision_centroid': collision_centroid,  # exact rotation center used by algorithm
                    'width': width,
                    'height': height,
                    'area': collision_polygon.area
                })
                print(f"Loaded part {i}: {Path(dxf_file).name} ({width:.1f}x{height:.1f}mm)")
            else:
                print(f"No valid geometry found in {dxf_file}")
                unfittable_parts.append(dxf_file)
        
        if not parts:
            return {
                'nested_dxf': None,
                'utilization': 0.0,
                'unfittable_parts': dxf_files,
                'message': 'No valid parts to nest'
            }
        
        # Sort parts by area (largest first)
        parts.sort(key=lambda p: p['area'], reverse=True)
        
        print(f"Nesting {len(parts)} parts on {self.sheet_width}x{self.sheet_height}mm sheet...")
        
        # Perform bottom-left fill nesting
        placed_parts, remaining_parts = self.bottom_left_fill(parts)
        
        # Add remaining parts to unfittable list
        unfittable_parts.extend([p['file'] for p in remaining_parts])
        
        return self.process_nesting_result_simple(placed_parts, unfittable_parts)
    
    def bottom_left_fill(self, parts):
        """Bottom-left fill nesting algorithm with rotation"""
        placed_parts = []
        remaining_parts = []
        
        # Track occupied regions
        occupied_polygons = []
        
        for part in parts:
            best_position = self.find_best_position_with_rotation(part, occupied_polygons)
            
            if best_position:
                x, y, rotation, rotated_polygon = best_position
                placed_polygon = translate(rotated_polygon, x, y)
                
                placed_parts.append({
                    'id': part['id'],
                    'file': part['file'],
                    'polygon': placed_polygon,
                    'original_polygon': part['polygon'],
                    'original_entities': part['original_entities'],
                    'dxf_path': part['dxf_path'],
                    'normalization_offset': part['normalization_offset'],
                    'collision_centroid': part['collision_centroid'],
                    'x': x,
                    'y': y,
                    'rotation': rotation
                })
                
                occupied_polygons.append(placed_polygon)
                print(f"Placed part {part['id']} at ({x:.1f}, {y:.1f}) with {rotation}° rotation")
            else:
                remaining_parts.append(part)
                print(f"Could not place part {part['id']}")
        
        return placed_parts, remaining_parts
    
    def find_best_position_with_rotation(self, part, occupied_polygons):
        """Find the best bottom-left position for a part with rotation"""
        rotation_angles = [0, 90, 180, 270]
        best_position = None
        best_area_used = float('inf')  # Prefer positions that use less sheet area
        
        for angle in rotation_angles:
            # Rotate the polygon using EXACT same centroid as stored
            collision_centroid = part['collision_centroid']
            rotated_polygon = rotate(part['polygon'], angle, origin=collision_centroid)
            rotated_polygon = self.normalize_polygon(rotated_polygon)  # Re-normalize after rotation
            
            # Get new dimensions
            bounds = rotated_polygon.bounds
            rotated_width = bounds[2] - bounds[0]
            rotated_height = bounds[3] - bounds[1]
            
            # Check if rotated part fits in sheet at all
            if (rotated_width + self.spacing > self.sheet_width or 
                rotated_height + self.spacing > self.sheet_height):
                continue
            
            # Find best position for this rotation
            position = self.find_position_for_polygon(rotated_polygon, rotated_width, rotated_height, occupied_polygons)
            
            if position:
                x, y = position
                # Calculate area efficiency (bottom-left preference)
                area_used = (x + rotated_width) * (y + rotated_height)
                
                if area_used < best_area_used:
                    best_area_used = area_used
                    best_position = (x, y, angle, rotated_polygon)
        
        return best_position
    
    def find_position_for_polygon(self, polygon, part_width, part_height, occupied_polygons):
        """Find position for a specific polygon (used by rotation logic)"""
        # Try positions from bottom-left
        step_size = max(1.0, min(part_width, part_height) / 10)  # Adaptive step size
        
        for y in np.arange(0, self.sheet_height - part_height + 1, step_size):
            for x in np.arange(0, self.sheet_width - part_width + 1, step_size):
                # Create candidate polygon
                candidate = translate(polygon, x, y)
                
                # Check if it fits in sheet
                bounds = candidate.bounds
                if (bounds[2] > self.sheet_width or bounds[3] > self.sheet_height):
                    continue
                
                # Check collision with existing parts
                collision = False
                for occupied in occupied_polygons:
                    # Add spacing buffer
                    buffered_occupied = occupied.buffer(self.spacing)
                    if candidate.intersects(buffered_occupied):
                        collision = True
                        break
                
                if not collision:
                    return (x, y)
        
        return None
    
    def process_nesting_result_simple(self, placed_parts, unfittable_parts):
        """Process nesting results for simple algorithm"""
        if not placed_parts:
            return {
                'nested_dxf': None,
                'utilization': 0.0,
                'unfittable_parts': unfittable_parts,
                'message': 'No parts could be placed'
            }
        
        # Calculate utilization
        total_part_area = sum(part['original_polygon'].area for part in placed_parts)
        sheet_area = self.sheet_width * self.sheet_height
        utilization = (total_part_area / sheet_area) * 100 if sheet_area > 0 else 0
        
        # Generate nested DXF
        nested_dxf_path = self.generate_nested_dxf(placed_parts)
        
        print(f"Nested {len(placed_parts)} parts, utilization: {utilization:.1f}%")
        if unfittable_parts:
            print(f"Could not fit {len(unfittable_parts)} parts")
        
        return {
            'nested_dxf': nested_dxf_path,
            'utilization': utilization,
            'unfittable_parts': unfittable_parts,
            'placed_count': len(placed_parts),
            'message': f'Successfully nested {len(placed_parts)} parts'
        }
    
    def generate_nested_dxf(self, placed_items):
        """Generate DXF file with nested layout preserving original geometry"""
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()
        
        # Add sheet boundary
        sheet_points = [
            (0, 0),
            (self.sheet_width, 0),
            (self.sheet_width, self.sheet_height),
            (0, self.sheet_height),
            (0, 0)
        ]
        msp.add_lwpolyline(sheet_points, dxfattribs={'color': 1, 'layer': 'BOUNDARY'})  # Red boundary
        
        # Add placed parts using original entities with transformations
        for item in placed_items:
            self._add_transformed_entities(msp, item)
        
        # Save nested DXF with custom name if specified
        output_name = os.environ.get('OUTPUT_NAME', 'nested_layout')
        output_path = f'/app/output/{output_name}.dxf'
        doc.saveas(output_path)
        return output_path
    
    def _add_transformed_entities(self, msp, item):
        """Transform original entities to match collision polygon positions"""
        x_offset = item['x']
        y_offset = item['y'] 
        rotation_angle = item['rotation']
        original_entities = item['original_entities']
        normalization_offset = item['normalization_offset']
        collision_centroid = item['collision_centroid']
        
        # Step 1: Normalize ALL entities first
        normalized_entities = []
        for entity in original_entities:
            try:
                new_entity = entity.copy()
                norm_x, norm_y = normalization_offset
                self._translate_entity(new_entity, -norm_x, -norm_y)
                normalized_entities.append(new_entity)
            except Exception as e:
                print(f"Warning: Could not normalize entity {entity.dxftype()}: {e}")
                continue
        
        # Step 2: Mirror collision algorithm transformation (rotate → re-normalize → position)
        
        # Step 2A: Rotate normalized entities around collision_centroid
        if rotation_angle != 0:
            for entity in normalized_entities:
                self._rotate_entity(entity, rotation_angle, collision_centroid[0], collision_centroid[1])
        
        # Step 2B: Re-normalize entities to origin
        if rotation_angle != 0:
            # Calculate the bounds of ALL rotated entities
            all_entity_bounds = self._get_entity_bounds(normalized_entities)
            if all_entity_bounds:
                ent_min_x, ent_min_y, ent_max_x, ent_max_y = all_entity_bounds
                # Re-normalize: translate all entities so minimum bounds are at origin
                re_normalization_offset_x = -ent_min_x
                re_normalization_offset_y = -ent_min_y
                
                for entity in normalized_entities:
                    self._translate_entity(entity, re_normalization_offset_x, re_normalization_offset_y)
                
        
        # Step 3: Apply final positioning
        for i, new_entity in enumerate(normalized_entities):
            try:
                # Apply final translation to nesting position
                self._translate_entity(new_entity, x_offset, y_offset)
                
                # Add to modelspace
                new_entity.dxf.color = 2  # Yellow for parts
                msp.add_entity(new_entity)
                
            except Exception as e:
                print(f"Warning: Could not transform entity {new_entity.dxftype()}: {e}")
                continue
    
    def _rotate_entity(self, entity, angle_degrees, cx, cy):
        """Rotate an entity around a center point"""
        import math
        angle_rad = math.radians(angle_degrees)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        
        def rotate_point(x, y):
            # Translate to origin
            x_rel = x - cx
            y_rel = y - cy
            # Rotate
            x_rot = x_rel * cos_a - y_rel * sin_a
            y_rot = x_rel * sin_a + y_rel * cos_a
            # Translate back
            return x_rot + cx, y_rot + cy
        
        if entity.dxftype() == 'LINE':
            start_x, start_y = rotate_point(entity.dxf.start.x, entity.dxf.start.y)
            end_x, end_y = rotate_point(entity.dxf.end.x, entity.dxf.end.y)
            entity.dxf.start = (start_x, start_y)
            entity.dxf.end = (end_x, end_y)
            
        elif entity.dxftype() == 'ARC':
            center_x, center_y = rotate_point(entity.dxf.center.x, entity.dxf.center.y)
            entity.dxf.center = (center_x, center_y)
            entity.dxf.start_angle += angle_degrees
            entity.dxf.end_angle += angle_degrees
            
        elif entity.dxftype() == 'CIRCLE':
            center_x, center_y = rotate_point(entity.dxf.center.x, entity.dxf.center.y)
            entity.dxf.center = (center_x, center_y)
            
        elif entity.dxftype() == 'LWPOLYLINE':
            new_points = []
            for point in entity.get_points():
                x_rot, y_rot = rotate_point(point[0], point[1])
                new_points.append((x_rot, y_rot))
            entity.clear()
            for point in new_points:
                entity.append(point)
                
        elif entity.dxftype() == 'POLYLINE':
            for vertex in entity.vertices:
                x_rot, y_rot = rotate_point(vertex.dxf.location.x, vertex.dxf.location.y)
                vertex.dxf.location = (x_rot, y_rot)
    
    def _translate_entity(self, entity, dx, dy):
        """Translate an entity by dx, dy"""
        if entity.dxftype() == 'LINE':
            start = entity.dxf.start
            end = entity.dxf.end
            entity.dxf.start = (start.x + dx, start.y + dy)
            entity.dxf.end = (end.x + dx, end.y + dy)
            
        elif entity.dxftype() in ['ARC', 'CIRCLE']:
            center = entity.dxf.center
            entity.dxf.center = (center.x + dx, center.y + dy)
            
        elif entity.dxftype() == 'LWPOLYLINE':
            new_points = []
            for point in entity.get_points():
                new_points.append((point[0] + dx, point[1] + dy))
            entity.clear()
            for point in new_points:
                entity.append(point)
                
        elif entity.dxftype() == 'POLYLINE':
            for vertex in entity.vertices:
                loc = vertex.dxf.location
                vertex.dxf.location = (loc.x + dx, loc.y + dy)
    
    def _get_entity_bounds(self, entities):
        """Calculate bounding box of a list of entities"""
        all_points = []
        
        for entity in entities:
            if entity.dxftype() == 'LINE':
                all_points.extend([
                    (entity.dxf.start.x, entity.dxf.start.y),
                    (entity.dxf.end.x, entity.dxf.end.y)
                ])
            elif entity.dxftype() == 'ARC':
                center = (entity.dxf.center.x, entity.dxf.center.y)
                all_points.append(center)
            elif entity.dxftype() == 'CIRCLE':
                center = (entity.dxf.center.x, entity.dxf.center.y)
                all_points.append(center)
            elif entity.dxftype() == 'LWPOLYLINE':
                for point in entity.get_points():
                    all_points.append((point[0], point[1]))
            elif entity.dxftype() == 'POLYLINE':
                for vertex in entity.vertices:
                    all_points.append((vertex.dxf.location.x, vertex.dxf.location.y))
        
        if not all_points:
            return None
            
        min_x = min(p[0] for p in all_points)
        max_x = max(p[0] for p in all_points)
        min_y = min(p[1] for p in all_points)
        max_y = max(p[1] for p in all_points)
        
        return (min_x, min_y, max_x, max_y)
    
    def _calculate_entities_centroid(self, entities):
        """Calculate the centroid of original entities in their coordinate system"""
        all_points = []
        
        for entity in entities:
            if entity.dxftype() == 'LINE':
                all_points.extend([
                    (entity.dxf.start.x, entity.dxf.start.y),
                    (entity.dxf.end.x, entity.dxf.end.y)
                ])
            elif entity.dxftype() == 'ARC':
                # Use arc center and approximate points
                center = (entity.dxf.center.x, entity.dxf.center.y)
                all_points.append(center)
            elif entity.dxftype() == 'CIRCLE':
                center = (entity.dxf.center.x, entity.dxf.center.y)
                all_points.append(center)
            elif entity.dxftype() == 'LWPOLYLINE':
                for point in entity.get_points():
                    all_points.append((point[0], point[1]))
            elif entity.dxftype() == 'POLYLINE':
                for vertex in entity.vertices:
                    all_points.append((vertex.dxf.location.x, vertex.dxf.location.y))
        
        if not all_points:
            return (0, 0)
        
        # Calculate centroid
        sum_x = sum(point[0] for point in all_points)
        sum_y = sum(point[1] for point in all_points)
        centroid_x = sum_x / len(all_points)
        centroid_y = sum_y / len(all_points)
        
        return (centroid_x, centroid_y)
    

def main():
    if len(sys.argv) < 2:
        print("Usage: python nest.py <dxf_file1> [dxf_file2] ...")
        print("Or: python nest.py <input_directory>")
        sys.exit(1)
    
    # Get sheet dimensions from environment or use defaults
    sheet_width = float(os.environ.get('SHEET_WIDTH', 1000))
    sheet_height = float(os.environ.get('SHEET_HEIGHT', 500))
    spacing = float(os.environ.get('PART_SPACING', 2.0))
    
    nester = DXFNester(sheet_width, sheet_height, spacing)
    
    # Collect DXF files
    dxf_files = []
    
    if len(sys.argv) == 2 and os.path.isdir(sys.argv[1]):
        # Directory mode
        input_dir = Path(sys.argv[1])
        dxf_files = list(input_dir.glob('*.dxf'))
        dxf_files = [str(f) for f in dxf_files]
    else:
        # Individual files mode
        dxf_files = sys.argv[1:]
    
    if not dxf_files:
        print("No DXF files found")
        sys.exit(1)
    
    # Perform nesting
    result = nester.nest_parts(dxf_files)
    
    # Save results as JSON
    output_info = {
        'nested_dxf': result['nested_dxf'],
        'utilization_percent': result['utilization'],
        'unfittable_parts': result['unfittable_parts'],
        'placed_count': result.get('placed_count', 0),
        'total_parts': len(dxf_files),
        'message': result['message']
    }
    
    with open('/app/output/nesting_results.json', 'w') as f:
        json.dump(output_info, f, indent=2)
    
    print(f"\nNesting complete!")
    print(f"Results saved to: /app/output/nesting_results.json")
    if result['nested_dxf']:
        print(f"Nested DXF saved to: {result['nested_dxf']}")

if __name__ == "__main__":
    main()