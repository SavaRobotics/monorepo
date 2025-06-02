import pytest
import os
import sys

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.dxf_processor import DXFProcessor, Geometry, Part
from src.config import DXFProcessingConfig

def test_dxf_processor_init():
    """Test DXF processor initialization"""
    processor = DXFProcessor(tolerance=0.01)
    assert processor.tolerance == 0.01
    assert processor.parts == []
    assert processor.sheet_boundary is None

def test_geometry_creation():
    """Test geometry object creation"""
    # Line geometry
    line = Geometry(
        type='line',
        start=(0, 0),
        end=(10, 0)
    )
    assert line.type == 'line'
    assert line.start == (0, 0)
    assert line.end == (10, 0)
    
    # Arc geometry
    arc = Geometry(
        type='arc',
        start=(10, 0),
        end=(0, 10),
        center=(0, 0),
        radius=10,
        start_angle=0,
        end_angle=90
    )
    assert arc.type == 'arc'
    assert arc.radius == 10
    assert arc.center == (0, 0)

def test_part_creation():
    """Test part object creation"""
    outer_contour = [
        Geometry(type='line', start=(0, 0), end=(100, 0)),
        Geometry(type='line', start=(100, 0), end=(100, 50)),
        Geometry(type='line', start=(100, 50), end=(0, 50)),
        Geometry(type='line', start=(0, 50), end=(0, 0))
    ]
    
    part = Part(
        id=1,
        outer_contour=outer_contour,
        holes=[],
        bounding_box=(0, 0, 100, 50)
    )
    
    assert part.id == 1
    assert len(part.outer_contour) == 4
    assert part.bounding_box == (0, 0, 100, 50)

def test_points_equal():
    """Test point equality checking"""
    processor = DXFProcessor(tolerance=0.001)
    
    # Equal points
    assert processor._points_equal((1.0, 2.0), (1.0, 2.0))
    assert processor._points_equal((1.0, 2.0), (1.0001, 2.0))
    
    # Not equal points
    assert not processor._points_equal((1.0, 2.0), (1.1, 2.0))
    assert not processor._points_equal((1.0, 2.0), (1.0, 2.1))

def test_calculate_bbox():
    """Test bounding box calculation"""
    processor = DXFProcessor()
    
    contour = [
        Geometry(type='line', start=(10, 20), end=(50, 20)),
        Geometry(type='line', start=(50, 20), end=(50, 80)),
        Geometry(type='line', start=(50, 80), end=(10, 80)),
        Geometry(type='line', start=(10, 80), end=(10, 20))
    ]
    
    bbox = processor._calculate_bbox(contour)
    assert bbox == (10, 20, 50, 80)

def test_is_closed_contour():
    """Test closed contour detection"""
    processor = DXFProcessor(tolerance=0.001)
    
    # Closed contour
    closed_contour = [
        Geometry(type='line', start=(0, 0), end=(10, 0)),
        Geometry(type='line', start=(10, 0), end=(10, 10)),
        Geometry(type='line', start=(10, 10), end=(0, 10)),
        Geometry(type='line', start=(0, 10), end=(0, 0))
    ]
    assert processor._is_closed_contour(closed_contour)
    
    # Open contour
    open_contour = [
        Geometry(type='line', start=(0, 0), end=(10, 0)),
        Geometry(type='line', start=(10, 0), end=(10, 10)),
        Geometry(type='line', start=(10, 10), end=(0, 10))
    ]
    assert not processor._is_closed_contour(open_contour)

if __name__ == "__main__":
    pytest.main([__file__])