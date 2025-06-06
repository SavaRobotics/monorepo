# Copyright 2024 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from dataclasses import dataclass, field
from pathlib import Path

from lerobot.common.robots.config import RobotConfig


@dataclass
class XArmFollowerConfig(RobotConfig):
    """
    Configuration class for xArm follower robots.
    
    The xArm follower uses the xArm 5 with UFFactory gripper.
    Communication is done via TCP/IP using the xArm Python SDK.
    
    Args:
        ip_address: IP address of the xArm controller (e.g., "192.168.1.185")
        joint_speed: Maximum joint speed in degrees/second (default: 50)
        joint_acceleration: Maximum joint acceleration in degrees/second^2 (default: 500)
        tcp_speed: Maximum TCP speed in mm/s (default: 100)
        tcp_acceleration: Maximum TCP acceleration in mm/s^2 (default: 1000)
        use_gripper: Whether to control the gripper (default: True)
        gripper_speed: Gripper speed (0-5000) (default: 2000)
        disable_torque_on_disconnect: Whether to disable torque when disconnecting (default: True)
        max_relative_target: Maximum relative position change per action (degrees) (default: None)
        cameras: Dictionary of camera configurations (default: empty)
        calibration_dir: Directory to store calibration data (default: ~/.lerobot/calibration/xarm_follower/{id})
    """
    
    # Connection settings
    ip_address: str = "192.168.1.185"
    
    # Motion settings
    joint_speed: float = 50.0  # degrees/second
    joint_acceleration: float = 500.0  # degrees/second^2
    tcp_speed: float = 100.0  # mm/s
    tcp_acceleration: float = 1000.0  # mm/s^2
    
    # Gripper settings
    use_gripper: bool = True
    gripper_speed: int = 2000  # 0-5000
    
    # Safety settings
    disable_torque_on_disconnect: bool = True
    max_relative_target: dict[str, float] | None = None
    
    # Joint limits (degrees) - xArm 5 default limits
    joint_limits: dict[str, tuple[float, float]] = field(default_factory=lambda: {
        "joint_1": (-360, 360),
        "joint_2": (-118, 120),
        "joint_3": (-225, 11),
        "joint_4": (-360, 360),
        "joint_5": (-97, 180),
    })
    
    # Camera configurations
    cameras: dict = field(default_factory=dict)
    
    # Features to include in observations
    include_tcp_position: bool = False  # Whether to include TCP position in observations
    
    # Calibration settings
    calibration_dir: Path | None = None
    
    @property
    def num_joints(self) -> int:
        """Number of joints in the xArm 5"""
        return 5