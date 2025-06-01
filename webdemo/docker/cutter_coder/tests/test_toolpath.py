import pytest
import os
import sys

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.toolpath_generator import ToolpathGenerator, Toolpath, Tab
from src.dxf_processor import Part, Geometry
from src.config import CuttingConfig, MaterialConfig, ToolConfig, TabConfig

def test_toolpath_generator_init():
    """Test toolpath generator initialization"""
    config = CuttingConfig()
    generator = ToolpathGenerator(config)
    
    assert generator.config == config
    assert generator.toolpaths == []

def test_calculate_contour_length():
    """Test contour length calculation"""
    config = CuttingConfig()
    generator = ToolpathGenerator(config)
    
    # Square contour
    square = [
        Geometry(type='line', start=(0, 0), end=(100, 0)),
        Geometry(type='line', start=(100, 0), end=(100, 100)),
        Geometry(type='line', start=(100, 100), end=(0, 100)),
        Geometry(type='line', start=(0, 100), end=(0, 0))
    ]
    
    length = generator._calculate_contour_length(square)
    assert length == 400.0  # 4 sides * 100mm each

def test_tab_positions():
    """Test tab position calculation"""
    config = CuttingConfig(
        tabs=TabConfig(
            enabled=True,
            width=8.0,
            spacing=100.0,
            min_tabs_per_part=2
        )
    )
    generator = ToolpathGenerator(config)
    
    # 400mm square contour
    square = [
        Geometry(type='line', start=(0, 0), end=(100, 0)),
        Geometry(type='line', start=(100, 0), end=(100, 100)),
        Geometry(type='line', start=(100, 100), end=(0, 100)),
        Geometry(type='line', start=(0, 100), end=(0, 0))
    ]
    
    tabs = generator._calculate_tab_positions(square, 400.0)
    
    # Should have 4 tabs (400mm / 100mm spacing)
    assert len(tabs) == 4
    
    # Each tab should have proper width
    for tab in tabs:
        assert isinstance(tab, Tab)
        assert tab.height == config.tabs.height

def test_toolpath_creation():
    """Test basic toolpath creation"""
    config = CuttingConfig(
        material=MaterialConfig(thickness=10.0, step_down=5.0),
        tabs=TabConfig(enabled=False)  # Disable tabs for simplicity
    )
    generator = ToolpathGenerator(config)
    
    # Simple square part
    square_contour = [
        Geometry(type='line', start=(0, 0), end=(100, 0)),
        Geometry(type='line', start=(100, 0), end=(100, 100)),
        Geometry(type='line', start=(100, 100), end=(0, 100)),
        Geometry(type='line', start=(0, 100), end=(0, 0))
    ]
    
    part = Part(
        id=1,
        outer_contour=square_contour,
        holes=[],
        bounding_box=(0, 0, 100, 100)
    )
    
    toolpaths = generator.generate_toolpaths([part])
    
    assert len(toolpaths) == 1
    assert toolpaths[0].type == 'contour'
    assert toolpaths[0].feed_rate == config.material.feed_rate
    assert toolpaths[0].plunge_rate == config.material.plunge_rate
    
    # Check that toolpath has points
    assert len(toolpaths[0].points) > 0
    
    # First point should be at safety height
    assert toolpaths[0].points[0][2] == config.safety_height

def test_get_segment_length():
    """Test segment length calculation"""
    config = CuttingConfig()
    generator = ToolpathGenerator(config)
    
    # Line segment
    line = Geometry(type='line', start=(0, 0), end=(30, 40))
    assert generator._get_segment_length(line) == 50.0  # 3-4-5 triangle
    
    # Arc segment (90 degree arc with radius 10)
    import numpy as np
    arc = Geometry(
        type='arc',
        start=(10, 0),
        end=(0, 10),
        center=(0, 0),
        radius=10,
        start_angle=0,
        end_angle=90
    )
    expected_length = 10 * np.pi / 2  # quarter circle
    assert abs(generator._get_segment_length(arc) - expected_length) < 0.01

def test_optimize_toolpath_order():
    """Test toolpath ordering optimization"""
    config = CuttingConfig()
    generator = ToolpathGenerator(config)
    
    # Create three toolpaths at different locations
    tp1 = Toolpath(
        type='contour',
        points=[(0, 0, 0), (10, 0, 0)],
        feed_rate=1000,
        plunge_rate=300
    )
    
    tp2 = Toolpath(
        type='contour',
        points=[(100, 100, 0), (110, 100, 0)],
        feed_rate=1000,
        plunge_rate=300
    )
    
    tp3 = Toolpath(
        type='contour',
        points=[(20, 0, 0), (30, 0, 0)],
        feed_rate=1000,
        plunge_rate=300
    )
    
    # tp3 is closer to tp1 than tp2
    optimized = generator._optimize_toolpath_order([tp1, tp2, tp3])
    
    # Order should be tp1, tp3, tp2
    assert optimized[0] == tp1
    assert optimized[1] == tp3
    assert optimized[2] == tp2

if __name__ == "__main__":
    pytest.main([__file__])