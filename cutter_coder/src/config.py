from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from enum import Enum

class MaterialType(str, Enum):
    PLYWOOD = "plywood"
    MDF = "mdf"
    ALUMINUM = "aluminum"
    ACRYLIC = "acrylic"
    STEEL = "steel"
    CUSTOM = "custom"

class ToolType(str, Enum):
    END_MILL = "end_mill"
    BALL_MILL = "ball_mill"
    V_BIT = "v_bit"

class TabConfig(BaseModel):
    enabled: bool = True
    height: float = Field(3.0, description="Tab height in mm")
    width: float = Field(8.0, description="Tab width in mm")
    spacing: float = Field(100.0, description="Spacing between tabs in mm")
    min_tabs_per_part: int = Field(2, description="Minimum tabs per part")
    corner_exclusion_zone: float = Field(10.0, description="Distance from corners to avoid placing tabs in mm")
    corner_angle_threshold: float = Field(45.0, description="Angle change threshold to detect corners in degrees")

class ToolConfig(BaseModel):
    type: ToolType = ToolType.END_MILL
    diameter: float = Field(3.175, description="Tool diameter in mm")  # 1/8 inch
    flute_length: float = Field(25.0, description="Cutting flute length in mm")
    total_length: float = Field(50.0, description="Total tool length in mm")
    flutes: int = Field(2, description="Number of flutes")

class MaterialConfig(BaseModel):
    type: MaterialType = MaterialType.PLYWOOD
    thickness: float = Field(12.0, description="Material thickness in mm")
    feed_rate: float = Field(1000.0, description="Feed rate in mm/min")
    plunge_rate: float = Field(300.0, description="Plunge rate in mm/min")
    spindle_speed: int = Field(18000, description="Spindle speed in RPM")
    step_down: float = Field(3.0, description="Step down per pass in mm")
    finish_allowance: float = Field(0.1, description="Finish allowance in mm")

class CuttingConfig(BaseModel):
    material: MaterialConfig = MaterialConfig()
    tool: ToolConfig = ToolConfig()
    tabs: TabConfig = TabConfig()
    safety_height: float = Field(5.0, description="Safety height above material in mm")
    cutting_direction: str = Field("climb", description="climb or conventional")
    enable_coolant: bool = False
    arc_interpolation_tolerance: float = Field(0.1, description="Maximum deviation from true arc in mm")
    min_arc_segments: int = Field(3, description="Minimum segments per arc")
    max_arc_segments: int = Field(100, description="Maximum segments per arc")
    
class DXFProcessingConfig(BaseModel):
    layer_filter: Optional[str] = Field("LargestFace", description="Layer to process")
    tolerance: float = Field(0.001, description="Geometric tolerance in mm")
    optimize_paths: bool = True
    detect_holes: bool = True
    min_hole_diameter: float = Field(1.0, description="Minimum hole diameter to process")
    
class ConversionRequest(BaseModel):
    material_config: MaterialConfig
    tool_config: ToolConfig
    tab_config: TabConfig
    processing_config: DXFProcessingConfig = DXFProcessingConfig()
    output_format: str = Field("linuxcnc", description="G-code dialect")

class AppConfig(BaseModel):
    app_name: str = "DXF to G-Code Converter"
    version: str = "1.0.0"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_extensions: list[str] = [".dxf"]
    temp_dir: str = "/tmp/cutter_coder"
    
    # Material presets
    material_presets: Dict[str, MaterialConfig] = {
        "plywood_12mm": MaterialConfig(
            type=MaterialType.PLYWOOD,
            thickness=12.0,
            feed_rate=1000.0,
            plunge_rate=300.0,
            spindle_speed=18000,
            step_down=3.0
        ),
        "mdf_18mm": MaterialConfig(
            type=MaterialType.MDF,
            thickness=18.0,
            feed_rate=800.0,
            plunge_rate=250.0,
            spindle_speed=16000,
            step_down=4.0
        ),
        "aluminum_6mm": MaterialConfig(
            type=MaterialType.ALUMINUM,
            thickness=6.0,
            feed_rate=300.0,
            plunge_rate=100.0,
            spindle_speed=10000,
            step_down=0.5
        )
    }

app_config = AppConfig()