import ezdxf
from ezdxf.math import BoundingBox, Vec3, Matrix44
import math

def find_closed_loops(dxf_file_path, tolerance=1e-6):
    """
    Find closed loops formed by connected arcs and lines.
    """
    doc = ezdxf.readfile(dxf_file_path)
    msp = doc.modelspace()
    
    # Collect all entities with their endpoints
    entities_data = []
    
    for entity in msp:
        if entity.dxftype() == 'LINE':
            start = entity.dxf.start
            end = entity.dxf.end
            entities_data.append({
                'entity': entity,
                'start': (start.x, start.y, start.z),
                'end': (end.x, end.y, end.z),
                'type': 'LINE'
            })
        elif entity.dxftype() == 'ARC':
            center = entity.dxf.center
            radius = entity.dxf.radius
            start_angle = entity.dxf.start_angle
            end_angle = entity.dxf.end_angle
            
            # Calculate start and end points of arc
            start_rad = math.radians(start_angle)
            end_rad = math.radians(end_angle)
            
            start_point = (
                center.x + radius * math.cos(start_rad),
                center.y + radius * math.sin(start_rad),
                center.z
            )
            end_point = (
                center.x + radius * math.cos(end_rad),
                center.y + radius * math.sin(end_rad),
                center.z
            )
            
            entities_data.append({
                'entity': entity,
                'start': start_point,
                'end': end_point,
                'type': 'ARC'
            })
    
    # Simple approach: find entities that share endpoints
    def points_equal(p1, p2, tol=tolerance):
        return (abs(p1[0] - p2[0]) < tol and 
                abs(p1[1] - p2[1]) < tol and 
                abs(p1[2] - p2[2]) < tol)
    
    # Group connected entities
    connected_groups = []
    used_entities = set()
    
    for i, ent_data in enumerate(entities_data):
        if i in used_entities:
            continue
            
        group = [ent_data]
        used_entities.add(i)
        
        # Find connected entities
        for j, other_ent in enumerate(entities_data):
            if j in used_entities:
                continue
                
            # Check if entities connect
            if (points_equal(ent_data['end'], other_ent['start']) or
                points_equal(ent_data['end'], other_ent['end']) or
                points_equal(ent_data['start'], other_ent['start']) or
                points_equal(ent_data['start'], other_ent['end'])):
                group.append(other_ent)
                used_entities.add(j)
        
        if len(group) > 1:  # Only keep groups with multiple entities
            connected_groups.append(group)
    
    # Calculate bounding box for each group
    group_bboxes = []
    for group in connected_groups:
        all_points = []
        for ent_data in group:
            all_points.extend([ent_data['start'], ent_data['end']])
        
        bbox = BoundingBox(all_points)
        group_bboxes.append({
            'bbox': bbox,
            'entities': [ent_data['entity'] for ent_data in group],
            'entity_count': len(group)
        })
    
    return group_bboxes

def calculate_rotation_matrix(from_normal, to_normal=(0, 0, 1)):
    """
    Calculate rotation matrix to transform from_normal to to_normal.
    """
    from_vec = Vec3(from_normal).normalize()
    to_vec = Vec3(to_normal).normalize()
    
    # If vectors are already aligned, return identity matrix
    if from_vec.isclose(to_vec, abs_tol=1e-9):
        return Matrix44()
    
    # If vectors are opposite, rotate 180° around a perpendicular axis
    if from_vec.isclose(-to_vec, abs_tol=1e-9):
        # Find a perpendicular vector
        if abs(from_vec.x) < 0.9:
            perp = Vec3(1, 0, 0).cross(from_vec).normalize()
        else:
            perp = Vec3(0, 1, 0).cross(from_vec).normalize()
        return Matrix44.axis_rotate(perp, math.pi)
    
    # General case: rotate around the cross product axis
    axis = from_vec.cross(to_vec).normalize()
    angle = math.acos(max(-1, min(1, from_vec.dot(to_vec))))
    
    return Matrix44.axis_rotate(axis, angle)

def transform_entities(input_file, output_file):
    """
    Transform all entities so the largest face normal becomes (0, 0, 1).
    """
    # Find the largest face normal
    loops = find_closed_loops(input_file)
    
    greatest_normal = None
    greatest_area = 0
    
    print("Analyzing connected groups:")
    for i, loop in enumerate(loops):
        bbox = loop['bbox']

        area = None
        normal = None
        
        # Check which dimension is thinnest (represents the normal direction)
        size_x = abs(bbox.extmax.x - bbox.extmin.x)
        size_y = abs(bbox.extmax.y - bbox.extmin.y)
        size_z = abs(bbox.extmax.z - bbox.extmin.z)
        
        # Find the smallest dimension
        tolerance = 1e-6
        if size_x < tolerance:  # Plane perpendicular to X-axis
            area = size_y * size_z
            normal = (1, 0, 0)
        elif size_y < tolerance:  # Plane perpendicular to Y-axis
            area = size_x * size_z
            normal = (0, 1, 0)
        elif size_z < tolerance:  # Plane perpendicular to Z-axis
            area = size_x * size_y
            normal = (0, 0, 1)
        else:
            # If no dimension is very thin, use the largest face area
            xy_area = size_x * size_y
            xz_area = size_x * size_z
            yz_area = size_y * size_z
            
            if xy_area >= xz_area and xy_area >= yz_area:
                area = xy_area
                normal = (0, 0, 1)
            elif xz_area >= xy_area and xz_area >= yz_area:
                area = xz_area
                normal = (0, 1, 0)
            else:
                area = yz_area
                normal = (1, 0, 0)
        
        print(f"Group {i+1}: Area = {area:.3f}, Normal = {normal}")
        
        if area > greatest_area:
            greatest_area = area
            greatest_normal = normal
    
    print(f"\nLargest face: Area = {greatest_area:.3f}, Normal = {greatest_normal}")
    
    if greatest_normal is None:
        print("No suitable face found for transformation.")
        return
    
    # Calculate transformation matrix
    transform_matrix = calculate_rotation_matrix(greatest_normal, (0, 0, 1))
    print(f"Transformation matrix calculated.")
    
    # Load the original document
    doc = ezdxf.readfile(input_file)
    msp = doc.modelspace()
    
    # Transform all entities
    transformed_count = 0
    for entity in msp:
        if entity.dxftype() == 'LINE':
            # Transform line endpoints
            start = Vec3(entity.dxf.start)
            end = Vec3(entity.dxf.end)
            
            new_start = transform_matrix.transform(start)
            new_end = transform_matrix.transform(end)
            
            entity.dxf.start = new_start
            entity.dxf.end = new_end
            transformed_count += 1
            
        elif entity.dxftype() == 'ARC':
            # Transform arc center and adjust angles if needed
            center = Vec3(entity.dxf.center)
            new_center = transform_matrix.transform(center)
            entity.dxf.center = new_center
            
            # Note: For full correctness, we should also transform the arc's 
            # local coordinate system, but this is more complex and depends
            # on whether the arc is tilted in 3D space
            transformed_count += 1
    
    print(f"Transformed {transformed_count} entities.")
    
    # Save the transformed document
    doc.saveas(output_file)
    print(f"Saved transformed DXF to: {output_file}")
    
    # Verify the transformation by checking the new largest face normal
    print("\nVerifying transformation:")
    verify_loops = find_closed_loops(output_file)
    
    for i, loop in enumerate(verify_loops):
        bbox = loop['bbox']
        size_x = abs(bbox.extmax.x - bbox.extmin.x)
        size_y = abs(bbox.extmax.y - bbox.extmin.y)
        size_z = abs(bbox.extmax.z - bbox.extmin.z)
        
        print(f"Transformed Group {i+1}: Sizes = ({size_x:.6f}, {size_y:.6f}, {size_z:.6f})")