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

import logging
import time
from functools import cached_property
from typing import Any

import torch

from lerobot.common.robots.robot import Robot
from lerobot.common.robots.xarm_follower.config_xarm_follower import XArmFollowerConfig
from lerobot.common.robots.utils import make_cameras_from_configs


class XArmFollower(Robot):
    """
    xArm 5 follower robot implementation for LeRobot.
    
    This robot uses the xArm Python SDK to communicate with an xArm 5 robot
    and optionally a UFFactory gripper. It follows the LeRobot Robot interface
    for seamless integration with the framework.
    """
    
    config_class = XArmFollowerConfig
    name = "xarm_follower"
    
    def __init__(self, config: XArmFollowerConfig):
        super().__init__(config)
        self.config = config
        self.arm = None
        self.cameras = {}
        self._is_connected = False
        self._last_positions = None
        
        # Joint names for xArm 5
        self.joint_names = ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5"]
        if self.config.use_gripper:
            self.joint_names.append("gripper")
    
    @cached_property
    def observation_features(self) -> dict:
        """Define the observation space features."""
        features = {}
        
        # Joint positions
        for joint in self.joint_names:
            features[f"{joint}.pos"] = {
                "dtype": torch.float32,
                "shape": (1,),
                "low": -360.0 if joint != "gripper" else 0.0,
                "high": 360.0 if joint != "gripper" else 850.0,
            }
        
        # TCP position if enabled
        if self.config.include_tcp_position:
            for axis in ["x", "y", "z", "roll", "pitch", "yaw"]:
                features[f"tcp_{axis}"] = {
                    "dtype": torch.float32,
                    "shape": (1,),
                    "low": -1000.0 if axis in ["x", "y", "z"] else -180.0,
                    "high": 1000.0 if axis in ["x", "y", "z"] else 180.0,
                }
        
        # Camera features
        for camera_name, camera_config in self.config.cameras.items():
            features[camera_name] = {
                "dtype": torch.uint8,
                "shape": (camera_config["height"], camera_config["width"], 3),
                "low": 0,
                "high": 255,
            }
        
        return features
    
    @cached_property
    def action_features(self) -> dict:
        """Define the action space features."""
        features = {}
        
        # Joint positions (absolute targets)
        for joint in self.joint_names:
            features[f"{joint}.pos"] = {
                "dtype": torch.float32,
                "shape": (1,),
                "low": -360.0 if joint != "gripper" else 0.0,
                "high": 360.0 if joint != "gripper" else 850.0,
            }
        
        return features
    
    @property
    def is_connected(self) -> bool:
        """Check if the robot is connected."""
        return self._is_connected and self.arm is not None
    
    def connect(self, calibrate: bool = True) -> None:
        """Connect to the xArm robot."""
        if self.is_connected:
            logging.warning("Already connected to xArm")
            return
        
        try:
            # Import xArm SDK
            from xarm.wrapper import XArmAPI
            
            # Initialize xArm connection
            logging.info(f"Connecting to xArm at {self.config.ip_address}")
            self.arm = XArmAPI(
                port=self.config.ip_address,
                is_radian=False,  # Use degrees
                do_not_open=False
            )
            
            # Check connection
            code = self.arm.get_state()[0]
            if code != 0:
                raise ConnectionError(f"Failed to connect to xArm. Error code: {code}")
            
            # Configure robot
            self.configure()
            
            # Initialize cameras
            if self.config.cameras:
                logging.info("Initializing cameras")
                self.cameras = make_cameras_from_configs(self.config.cameras)
                for camera in self.cameras.values():
                    camera.connect()
            
            self._is_connected = True
            logging.info("Successfully connected to xArm")
            
            # Calibrate if requested
            if calibrate and not self.is_calibrated:
                self.calibrate()
                
        except ImportError:
            raise ImportError(
                "xArm SDK not found. Please install it with: "
                "pip install xArm-Python-SDK"
            )
        except Exception as e:
            self._is_connected = False
            raise ConnectionError(f"Failed to connect to xArm: {e}")
    
    @property
    def is_calibrated(self) -> bool:
        """Check if the robot is calibrated."""
        # For xArm, we consider it calibrated if we have a saved home position
        return self.calibration_fpath.is_file() and bool(self.calibration)
    
    def calibrate(self) -> None:
        """Calibrate the robot by setting a home position."""
        if not self.is_connected:
            raise RuntimeError("Cannot calibrate: robot not connected")
        
        logging.info("Starting xArm calibration")
        
        # Enable manual mode for calibration
        self.arm.set_mode(2)  # Manual mode
        self.arm.set_state(0)  # Sport state
        
        input(
            "Move the robot to the desired home position and press Enter. "
            "This position will be saved as the calibration reference."
        )
        
        # Get current joint positions
        code, angles = self.arm.get_servo_angle()
        if code != 0:
            raise RuntimeError(f"Failed to read joint angles. Error code: {code}")
        
        # Save calibration
        self.calibration = {
            "home_position": {
                "joint_1": angles[0],
                "joint_2": angles[1],
                "joint_3": angles[2],
                "joint_4": angles[3],
                "joint_5": angles[4],
            }
        }
        
        if self.config.use_gripper:
            code, gripper_pos = self.arm.get_gripper_position()
            if code == 0:
                self.calibration["home_position"]["gripper"] = gripper_pos
        
        self._save_calibration()
        
        # Return to position control mode
        self.arm.set_mode(0)
        self.arm.set_state(0)
        
        logging.info("Calibration complete and saved")
    
    def configure(self) -> None:
        """Configure the xArm robot settings."""
        if not self.is_connected:
            raise RuntimeError("Cannot configure: robot not connected")
        
        # Clean any errors
        self.arm.clean_error()
        self.arm.clean_warn()
        
        # Set to position control mode
        self.arm.set_mode(0)
        
        # Enable motion
        self.arm.motion_enable(True)
        
        # Set to sport state
        self.arm.set_state(0)
        
        # Set motion parameters
        self.arm.set_joint_maxacc(self.config.joint_acceleration)
        
        # Enable gripper if configured
        if self.config.use_gripper:
            self.arm.set_gripper_enable(True)
            self.arm.set_gripper_speed(self.config.gripper_speed)
        
        logging.info("xArm configured successfully")
    
    def get_observation(self) -> dict[str, Any]:
        """Get current observation from the robot."""
        if not self.is_connected:
            raise RuntimeError("Cannot get observation: robot not connected")
        
        observation = {}
        
        # Get joint angles
        code, angles = self.arm.get_servo_angle()
        if code != 0:
            raise RuntimeError(f"Failed to read joint angles. Error code: {code}")
        
        for i, joint_name in enumerate(self.joint_names[:5]):
            observation[f"{joint_name}.pos"] = angles[i]
        
        # Get gripper position if enabled
        if self.config.use_gripper:
            code, gripper_pos = self.arm.get_gripper_position()
            if code == 0:
                observation["gripper.pos"] = gripper_pos
            else:
                logging.warning(f"Failed to read gripper position. Error code: {code}")
                observation["gripper.pos"] = 0
        
        # Get TCP position if enabled
        if self.config.include_tcp_position:
            code, tcp_pose = self.arm.get_position()
            if code == 0:
                observation["tcp_x"] = tcp_pose[0]
                observation["tcp_y"] = tcp_pose[1]
                observation["tcp_z"] = tcp_pose[2]
                observation["tcp_roll"] = tcp_pose[3]
                observation["tcp_pitch"] = tcp_pose[4]
                observation["tcp_yaw"] = tcp_pose[5]
            else:
                logging.warning(f"Failed to read TCP position. Error code: {code}")
        
        # Get camera observations
        if self.cameras:
            for camera_name, camera in self.cameras.items():
                camera.async_read()
            
            for camera_name, camera in self.cameras.items():
                observation[camera_name] = camera.get_color_image()
        
        return observation
    
    def send_action(self, action: dict[str, Any]) -> dict[str, Any]:
        """Send action commands to the robot."""
        if not self.is_connected:
            raise RuntimeError("Cannot send action: robot not connected")
        
        # Extract joint targets
        joint_targets = []
        for joint_name in self.joint_names[:5]:
            if f"{joint_name}.pos" not in action:
                raise ValueError(f"Missing action for {joint_name}")
            joint_targets.append(float(action[f"{joint_name}.pos"]))
        
        # Apply relative position limits if configured
        if self.config.max_relative_target is not None and self._last_positions is not None:
            for i, (joint_name, target) in enumerate(zip(self.joint_names[:5], joint_targets)):
                max_delta = self.config.max_relative_target.get(joint_name, float("inf"))
                current = self._last_positions[i]
                delta = target - current
                if abs(delta) > max_delta:
                    joint_targets[i] = current + max_delta * (1 if delta > 0 else -1)
                    logging.warning(
                        f"Limiting {joint_name} motion: "
                        f"requested delta {delta:.1f}°, limited to {max_delta:.1f}°"
                    )
        
        # Apply joint limits
        for i, (joint_name, target) in enumerate(zip(self.joint_names[:5], joint_targets)):
            min_limit, max_limit = self.config.joint_limits[joint_name]
            if target < min_limit or target > max_limit:
                joint_targets[i] = max(min_limit, min(max_limit, target))
                logging.warning(
                    f"Clamping {joint_name} to limits: "
                    f"requested {target:.1f}°, clamped to {joint_targets[i]:.1f}°"
                )
        
        # Send joint commands
        code = self.arm.set_servo_angle(
            angle=joint_targets,
            speed=self.config.joint_speed,
            wait=False
        )
        
        if code != 0:
            logging.error(f"Failed to send joint commands. Error code: {code}")
        
        # Send gripper command if enabled
        if self.config.use_gripper and "gripper.pos" in action:
            gripper_target = float(action["gripper.pos"])
            gripper_target = max(0, min(850, gripper_target))  # Clamp to valid range
            
            code = self.arm.set_gripper_position(
                pos=gripper_target,
                speed=self.config.gripper_speed,
                wait=False
            )
            
            if code != 0:
                logging.error(f"Failed to send gripper command. Error code: {code}")
        
        # Store last positions for relative limiting
        self._last_positions = joint_targets
        
        # Return the action that was actually sent
        sent_action = {}
        for i, joint_name in enumerate(self.joint_names[:5]):
            sent_action[f"{joint_name}.pos"] = joint_targets[i]
        
        if self.config.use_gripper and "gripper.pos" in action:
            sent_action["gripper.pos"] = gripper_target
        
        return sent_action
    
    def disconnect(self) -> None:
        """Disconnect from the robot."""
        if not self.is_connected:
            logging.warning("Already disconnected from xArm")
            return
        
        try:
            # Disable torque if configured
            if self.config.disable_torque_on_disconnect:
                logging.info("Disabling torque")
                self.arm.set_state(4)  # Stop state
                self.arm.motion_enable(False)
            
            # Disconnect cameras
            for camera in self.cameras.values():
                camera.disconnect()
            self.cameras = {}
            
            # Disconnect from xArm
            if self.arm is not None:
                self.arm.disconnect()
                self.arm = None
            
            self._is_connected = False
            self._last_positions = None
            
            logging.info("Successfully disconnected from xArm")
            
        except Exception as e:
            logging.error(f"Error during disconnect: {e}")
            self._is_connected = False
            self.arm = None