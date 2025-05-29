"""Material database for CNC router operations at 24000 RPM"""

# Feed rates and depths optimized for CNC router at 24000 RPM
MATERIAL_DATABASE = {
    "aluminum": {
        "display_name": "Aluminum (6061/5052)",
        "operations": {
            "boring": {  # Internal operations first
                "feed_rate": 2000,      # mm/min
                "spindle_speed": 24000,  # RPM
                "depth_per_pass": 2.0,   # mm
                "plunge_rate": 500,      # mm/min
                "tool_diameter": 6.35,   # mm (1/4")
                "pecking": True,
                "peck_depth": 5.0        # mm
            },
            "slotting": {
                "feed_rate": 1800,
                "spindle_speed": 24000,
                "depth_per_pass": 2.5,
                "plunge_rate": 400,
                "tool_diameter": 6.35,
                "climb_milling": True
            },
            "contouring": {
                "feed_rate": 2500,
                "spindle_speed": 24000,
                "depth_per_pass": 3.0,
                "plunge_rate": 600,
                "tool_diameter": 6.35,
                "climb_milling": True,
                "finish_pass": True,
                "finish_allowance": 0.1  # mm
            }
        },
        "tab_settings": {
            "width": 4.0,         # mm
            "height": 1.5,        # mm
            "min_tabs": 3,
            "max_distance": 150,  # mm between tabs
            "ramp_angle": 15      # degrees
        },
        "coolant": "mist",
        "chip_load": 0.05  # mm/tooth
    },
    
    "galvanized_steel": {
        "display_name": "Galvanized Steel",
        "operations": {
            "boring": {
                "feed_rate": 800,
                "spindle_speed": 24000,
                "depth_per_pass": 1.0,
                "plunge_rate": 200,
                "tool_diameter": 6.35,
                "pecking": True,
                "peck_depth": 3.0
            },
            "slotting": {
                "feed_rate": 700,
                "spindle_speed": 24000,
                "depth_per_pass": 1.2,
                "plunge_rate": 180,
                "tool_diameter": 6.35,
                "climb_milling": True
            },
            "contouring": {
                "feed_rate": 1000,
                "spindle_speed": 24000,
                "depth_per_pass": 1.5,
                "plunge_rate": 250,
                "tool_diameter": 6.35,
                "climb_milling": True,
                "finish_pass": True,
                "finish_allowance": 0.15
            }
        },
        "tab_settings": {
            "width": 5.0,
            "height": 2.0,
            "min_tabs": 4,
            "max_distance": 120,
            "ramp_angle": 10
        },
        "coolant": "flood",
        "chip_load": 0.03
    }
}

def get_material_settings(material_name: str) -> dict:
    """Get material settings by name"""
    material = material_name.lower().replace(" ", "_")
    if material in MATERIAL_DATABASE:
        return MATERIAL_DATABASE[material]
    raise ValueError(f"Material '{material_name}' not found in database")

def calculate_feed_rate(material: str, operation: str, tool_diameter: float, num_flutes: int = 2) -> float:
    """Calculate adjusted feed rate based on tool and material"""
    mat_data = get_material_settings(material)
    op_data = mat_data["operations"][operation]
    chip_load = mat_data["chip_load"]
    
    # Feed rate = RPM × number of flutes × chip load
    calculated_feed = op_data["spindle_speed"] * num_flutes * chip_load
    
    # Use the minimum of calculated and recommended feed rate
    return min(calculated_feed, op_data["feed_rate"])