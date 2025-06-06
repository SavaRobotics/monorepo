# xArm LeRobot Setup and Calibration Guide

This guide will walk you through setting up and calibrating your xArm 5 robot with LeRobot.

## Prerequisites

### 1. Install Required Dependencies

```bash
# Install xArm Python SDK
pip install xArm-Python-SDK

# Install LeRobot (if not already installed)
pip install lerobot

# For camera support (optional)
pip install opencv-python
```

### 2. Network Configuration

1. Connect your xArm to the same network as your computer
2. Find your xArm's IP address:
   - Default is usually `192.168.1.xxx`
   - Check in xArm Studio or the robot's control box

## Configuration

### 1. Create a Configuration File

Create a Python script (e.g., `test_xarm.py`) with your robot configuration:

```python
from lerobot.common.robots.xarm_follower import XArmFollower, XArmFollowerConfig

# Basic configuration
config = XArmFollowerConfig(
    id="xarm_001",  # Unique identifier for your robot
    ip_address="192.168.1.185",  # Replace with your xArm's IP
    
    # Motion settings (optional - these are defaults)
    joint_speed=50.0,  # degrees/second
    joint_acceleration=500.0,  # degrees/second^2
    
    # Gripper settings
    use_gripper=True,  # Set to False if no gripper
    gripper_speed=2000,  # 0-5000
    
    # Safety settings
    disable_torque_on_disconnect=True,  # Safety feature
    
    # Optional: Add relative motion limits
    max_relative_target={
        "joint_1": 10.0,  # Max 10 degrees per action
        "joint_2": 10.0,
        "joint_3": 10.0,
        "joint_4": 10.0,
        "joint_5": 10.0,
        "gripper": 100.0,
    },
    
    # Optional: Include TCP position in observations
    include_tcp_position=True,
)

# With cameras (optional)
config_with_cameras = XArmFollowerConfig(
    id="xarm_001",
    ip_address="192.168.1.185",
    cameras={
        "camera_0": {
            "type": "opencv",
            "device_id": 0,
            "width": 640,
            "height": 480,
            "fps": 30,
        },
        # Add more cameras as needed
    }
)
```

## Calibration Process

### 1. Basic Connection and Calibration

```python
# Create robot instance
robot = XArmFollower(config)

# Connect to the robot (will auto-calibrate if not calibrated)
robot.connect(calibrate=True)

# Manual calibration (if needed)
if not robot.is_calibrated:
    robot.calibrate()
```

### 2. Full Calibration Script

Create a script `calibrate_xarm.py`:

```python
#!/usr/bin/env python3
import logging
from lerobot.common.robots.xarm_follower import XArmFollower, XArmFollowerConfig

# Set up logging
logging.basicConfig(level=logging.INFO)

def main():
    # Configure your robot
    config = XArmFollowerConfig(
        id="xarm_001",
        ip_address="192.168.1.185",  # Update this!
        use_gripper=True,
    )
    
    # Create robot instance
    robot = XArmFollower(config)
    
    try:
        # Connect to robot
        print("Connecting to xArm...")
        robot.connect(calibrate=False)
        
        # Check if calibration is needed
        if robot.is_calibrated:
            print("Robot is already calibrated.")
            response = input("Do you want to recalibrate? (y/n): ")
            if response.lower() != 'y':
                return
        
        # Run calibration
        print("\n=== xArm Calibration ===")
        print("The robot will enter manual mode.")
        print("Move the robot to your desired home position.")
        print("This position will be saved as the calibration reference.")
        print("Press Enter when ready...")
        
        robot.calibrate()
        print("Calibration complete!")
        
        # Test the robot
        print("\nTesting robot connection...")
        obs = robot.get_observation()
        print("Current joint positions:")
        for joint in ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5"]:
            print(f"  {joint}: {obs[f'{joint}.pos']:.1f}°")
        
        if config.use_gripper:
            print(f"  gripper: {obs['gripper.pos']}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        robot.disconnect()
        print("Disconnected from robot.")

if __name__ == "__main__":
    main()
```

### 3. Run Calibration

```bash
python calibrate_xarm.py
```

## Testing the Setup

### 1. Basic Test Script

Create `test_xarm_control.py`:

```python
#!/usr/bin/env python3
import time
import numpy as np
from lerobot.common.robots.xarm_follower import XArmFollower, XArmFollowerConfig

def test_robot():
    config = XArmFollowerConfig(
        id="xarm_001",
        ip_address="192.168.1.185",
        use_gripper=True,
        max_relative_target={
            "joint_1": 5.0,  # Safety: max 5 degrees per action
            "joint_2": 5.0,
            "joint_3": 5.0,
            "joint_4": 5.0,
            "joint_5": 5.0,
            "gripper": 50.0,
        }
    )
    
    robot = XArmFollower(config)
    robot.connect()
    
    try:
        # Get initial observation
        obs = robot.get_observation()
        print("Initial position:", obs)
        
        # Small test movement
        action = obs.copy()  # Start from current position
        action["joint_1.pos"] += 10  # Move joint 1 by 10 degrees
        action["gripper.pos"] = 400  # Mid-position for gripper
        
        print("Sending action...")
        robot.send_action(action)
        
        # Wait and observe
        time.sleep(2)
        new_obs = robot.get_observation()
        print("New position:", new_obs)
        
    finally:
        robot.disconnect()

if __name__ == "__main__":
    test_robot()
```

## Data Collection with LeRobot

### 1. Teleoperation Setup

For data collection, you'll need a leader robot or input device. Here's an example with keyboard control:

```python
from lerobot.common.datasets.lerobot_dataset import LeRobotDataset
from lerobot.common.robots.xarm_follower import XArmFollower, XArmFollowerConfig
import numpy as np

# Setup robot
config = XArmFollowerConfig(
    id="xarm_001",
    ip_address="192.168.1.185",
    cameras={
        "camera_0": {
            "type": "opencv",
            "device_id": 0,
            "width": 640,
            "height": 480,
            "fps": 30,
        }
    }
)

robot = XArmFollower(config)
robot.connect()

# Create dataset
dataset = LeRobotDataset.create(
    repo_id="your_username/xarm_task_dataset",
    robot=robot,
)

# Record episodes
# (You'll need to implement teleoperation logic here)
```

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check IP address is correct
   - Ensure robot is powered on
   - Check network connectivity: `ping <robot_ip>`
   - Verify firewall settings

2. **Import Error for xArm SDK**
   ```bash
   pip install xArm-Python-SDK --upgrade
   ```

3. **Robot State Errors**
   - Check xArm Studio for error codes
   - Clear errors with robot.arm.clean_error()
   - Ensure emergency stop is not pressed

4. **Calibration Issues**
   - Delete existing calibration: `rm ~/.lerobot/calibration/xarm_follower/xarm_001.json`
   - Ensure robot is in a safe position before calibrating
   - Check joint limits are not exceeded

### Safety Notes

1. **Always ensure the workspace is clear before running any scripts**
2. **Start with small movements when testing**
3. **Use the `max_relative_target` parameter to limit motion**
4. **Have the emergency stop button ready**
5. **Test in simulation mode first if available**

## Advanced Configuration

### Custom Joint Limits

```python
config = XArmFollowerConfig(
    id="xarm_001",
    ip_address="192.168.1.185",
    joint_limits={
        "joint_1": (-180, 180),  # Restrict joint 1 range
        "joint_2": (-90, 90),
        "joint_3": (-180, 11),
        "joint_4": (-180, 180),
        "joint_5": (-90, 90),
    }
)
```

### Integration with LeRobot Training

Once calibrated and tested, you can use your xArm with LeRobot's training pipeline:

```bash
# Record demonstrations
python lerobot/scripts/control_robot.py record \
    --robot-config xarm_follower \
    --robot-id xarm_001 \
    --fps 30 \
    --repo-id your_username/xarm_demonstrations

# Train a policy
python lerobot/scripts/train.py \
    --dataset your_username/xarm_demonstrations \
    --policy act
```

## Next Steps

1. Test basic connectivity and calibration
2. Implement teleoperation for your specific use case
3. Collect demonstration data
4. Train policies using LeRobot
5. Deploy trained policies back to the robot

For more information, refer to:
- [LeRobot Documentation](https://github.com/huggingface/lerobot)
- [xArm Python SDK Documentation](https://github.com/xArm-Developer/xArm-Python-SDK)
- [xArm User Manual](https://www.ufactory.cc/download)