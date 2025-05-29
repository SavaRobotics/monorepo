"""Mach3 post-processor for G-code generation"""

from typing import List, Dict, Optional
from datetime import datetime

class Mach3PostProcessor:
    def __init__(self, material_name: str, tool_diameter: float = 6.35):
        self.material_name = material_name
        self.tool_diameter = tool_diameter
        self.current_position = {"X": 0, "Y": 0, "Z": 0}
        self.current_feed = 0
        self.current_speed = 0
        
    def generate_gcode(self, toolpaths: List[Dict], 
                      spindle_speed: int = 24000,
                      program_name: str = "NESTED_PARTS") -> str:
        """Generate complete Mach3 G-code program"""
        gcode_lines = []
        
        # Header
        gcode_lines.extend(self._generate_header(program_name))
        
        # Safety and initialization
        gcode_lines.extend(self._generate_initialization(spindle_speed))
        
        # Process toolpaths
        for toolpath in toolpaths:
            gcode_line = self._process_toolpath_move(toolpath)
            if gcode_line:
                gcode_lines.append(gcode_line)
        
        # Footer
        gcode_lines.extend(self._generate_footer())
        
        return "\n".join(gcode_lines)
    
    def _generate_header(self, program_name: str) -> List[str]:
        """Generate G-code header"""
        return [
            f"(Program: {program_name})",
            f"(Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')})",
            f"(Material: {self.material_name})",
            f"(Tool: {self.tool_diameter}mm End Mill)",
            "(Units: MM)",
            ""
        ]
    
    def _generate_initialization(self, spindle_speed: int) -> List[str]:
        """Generate initialization G-code"""
        return [
            "G17 G21 G40 G49 G80 G90 G94",  # Setup modes
            "G91.1",  # Incremental IJ mode
            "T1 M6",  # Tool change
            f"S{spindle_speed} M3",  # Spindle on clockwise
            "G54",  # Work coordinate system
            "G0 Z5.0",  # Move to safe height
            "M8",  # Coolant on
            ""
        ]
    
    def _generate_footer(self) -> List[str]:
        """Generate G-code footer"""
        return [
            "",
            "G0 Z25.0",  # Retract to safe height
            "M5",  # Spindle stop
            "M9",  # Coolant off
            "G28 G91 Z0",  # Return to reference position
            "G90",  # Absolute mode
            "M30",  # Program end and rewind
            "%"
        ]
    
    def _process_toolpath_move(self, move: Dict) -> Optional[str]:
        """Convert toolpath move to G-code"""
        move_type = move.get("type", "")
        operation = move.get("operation", "G01")
        
        # Extract coordinates
        x, y = move["position"]
        z = move.get("depth", self.current_position["Z"])
        feed = move.get("feed_rate", self.current_feed)
        
        # Build G-code line
        gcode_parts = [operation]
        
        # Add coordinates if changed
        if x != self.current_position["X"]:
            gcode_parts.append(f"X{x:.3f}")
            self.current_position["X"] = x
            
        if y != self.current_position["Y"]:
            gcode_parts.append(f"Y{y:.3f}")
            self.current_position["Y"] = y
            
        if z != self.current_position["Z"]:
            gcode_parts.append(f"Z{z:.3f}")
            self.current_position["Z"] = z
        
        # Add feed rate if changed (only for G01/G02/G03)
        if operation in ["G01", "G02", "G03"] and feed != self.current_feed:
            gcode_parts.append(f"F{feed:.0f}")
            self.current_feed = feed
        
        # Add comments for clarity
        comment = self._get_move_comment(move_type)
        if comment:
            gcode_parts.append(f"({comment})")
        
        # Handle special moves
        if move_type == "helical_move":
            # Convert to G02/G03 for helical interpolation
            # This is simplified - real implementation would calculate I,J
            pass
        
        return " ".join(gcode_parts) if len(gcode_parts) > 1 else None
    
    def _get_move_comment(self, move_type: str) -> str:
        """Get descriptive comment for move type"""
        comments = {
            "rapid_retract": "Retract",
            "plunge": "Plunge",
            "boring_plunge": "Bore hole",
            "helical_move": "Helical bore",
            "slot_cut": "Slot",
            "contour_cut": "Contour",
            "lead_in": "Lead in",
            "lead_out": "Lead out",
            "ramp_move": "Ramp entry",
            "tab_lift": "Tab"
        }
        return comments.get(move_type, "")
    
    def optimize_gcode(self, gcode: str) -> str:
        """Optimize G-code for better performance"""
        lines = gcode.split("\n")
        optimized = []
        
        # Remove redundant commands
        last_g = None
        last_f = None
        
        for line in lines:
            if not line.strip() or line.strip().startswith("("):
                optimized.append(line)
                continue
            
            parts = line.split()
            new_parts = []
            
            for part in parts:
                # Skip redundant G commands
                if part in ["G00", "G01", "G02", "G03"]:
                    if part != last_g:
                        new_parts.append(part)
                        last_g = part
                # Skip redundant F commands
                elif part.startswith("F"):
                    if part != last_f:
                        new_parts.append(part)
                        last_f = part
                else:
                    new_parts.append(part)
            
            if new_parts:
                optimized.append(" ".join(new_parts))
        
        return "\n".join(optimized)