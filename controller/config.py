"""
Configuration file for CNC Controller
Edit these values to match your setup
"""

import os
from pathlib import Path

# API Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "https://your-api.com")
API_ENDPOINT = f"{API_BASE_URL}/api/gcode/next"  # Endpoint to get next G-code file
API_STATUS_ENDPOINT = f"{API_BASE_URL}/api/gcode/status"  # Endpoint to report status
API_KEY = os.environ.get("CNC_API_KEY", "your-api-key-here")

# File Paths
GCODE_FOLDER = Path(os.environ.get("GCODE_FOLDER", "C:/CNC/GCode"))
PROCESSED_FILES_LOG = Path(os.environ.get("PROCESSED_LOG", "C:/CNC/processed_files.json"))
ERROR_LOG = Path(os.environ.get("ERROR_LOG", "C:/CNC/error_log.txt"))

# Timing Configuration
CHECK_INTERVAL = int(os.environ.get("CHECK_INTERVAL", "10"))  # Seconds between checks
DOWNLOAD_TIMEOUT = int(os.environ.get("DOWNLOAD_TIMEOUT", "30"))  # Download timeout in seconds
RETRY_DELAY = int(os.environ.get("RETRY_DELAY", "30"))  # Delay after error before retry

# Mach3 Configuration
MACH3_WINDOW_TITLE = "Mach3"  # Window title to search for
HOME_BUTTON_POS = (371, 289)  # REF ALL HOME button position
Z_PLUS_BUTTON_POS = (598, 391)  # Z+ jog button position
START_BUTTON_POS = (87, 555)  # START button position
Z_CLEARANCE_CLICKS = 3  # Number of times to click Z+ for clearance

# PyAutoGUI Configuration
CONFIDENCE_LEVEL = 0.8  # Confidence for image recognition
PAUSE_BETWEEN_ACTIONS = 0.5  # Seconds to pause between actions

# Features
AUTO_HOME = True  # Automatically home before running
AUTO_SPINDLE = True  # Automatically start spindle
AUTO_Z_CLEARANCE = True  # Automatically raise Z for clearance
DELETE_AFTER_RUN = False  # Delete G-code file after successful run