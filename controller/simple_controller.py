"""
Simplified CNC Controller - Minimal version
Continuously monitors for new G-code files and runs them in Mach3
"""

import pyautogui
import time
import os
import requests
from pathlib import Path
from datetime import datetime

# CONFIGURATION - EDIT THESE VALUES
API_URL = "YOUR_API_ENDPOINT_HERE"  # Your API endpoint that returns G-code download link
CHECK_INTERVAL = 10  # Seconds between checks
GCODE_FOLDER = Path("C:/CNC/GCode")

# Create folder if it doesn't exist
GCODE_FOLDER.mkdir(parents=True, exist_ok=True)

# Track processed files
processed_files = set()

def get_next_gcode():
    """Get next G-code file URL from your API"""
    try:
        # Simple GET request - modify based on your API
        response = requests.get(API_URL, timeout=10)
        if response.status_code == 200:
            data = response.json()
            # Expected format: {"url": "https://...", "filename": "part.gcode"}
            return data
    except Exception as e:
        print(f"API Error: {e}")
    return None

def download_file(url, filename):
    """Download G-code file"""
    try:
        filepath = GCODE_FOLDER / filename
        print(f"Downloading {filename}...")
        
        response = requests.get(url, timeout=30)
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        print(f"Downloaded to {filepath}")
        return filepath
    except Exception as e:
        print(f"Download error: {e}")
        return None

def run_in_mach3(filepath):
    """Load and run G-code in Mach3 with full sequence"""
    try:
        # Find Mach3 window
        windows = pyautogui.getWindowsWithTitle("Mach3")
        if not windows:
            print("Mach3 not found!")
            return False
        
        # Activate Mach3
        windows[0].activate()
        time.sleep(1)
        
        # Step 1: Load G-code file
        print("Loading G-code file...")
        # Try image recognition first
        file_button = pyautogui.locateOnScreen('images/file.png', confidence=0.8)
        if file_button:
            pyautogui.click(file_button)
            time.sleep(1)
            open_button = pyautogui.locateOnScreen('images/open.png', confidence=0.8)
            if open_button:
                pyautogui.click(open_button)
                time.sleep(2)
        else:
            # Fallback to keyboard shortcut
            pyautogui.hotkey('ctrl', 'o')
            time.sleep(2)
        
        # Type filepath
        pyautogui.typewrite(str(filepath))
        time.sleep(1)
        pyautogui.press('enter')
        time.sleep(3)
        
        # Step 2: Raise Z axis for safety
        print("Raising Z axis...")
        z_up_button = pyautogui.locateOnScreen('images/z_up.png', confidence=0.8)
        if z_up_button:
            # Click Z up button 3 times
            for i in range(7):
                pyautogui.click(z_up_button)
                time.sleep(0.25)
        else:
            # Fallback to coordinates
            for i in range(3):
                pyautogui.click(598, 391)  # Z+ button position
                time.sleep(0.5)
        
        # Step 3: Start spindle
        print("Starting spindle...")
        spindle_button = pyautogui.locateOnScreen('images/spindle_start.png', confidence=0.8)
        if spindle_button:
            pyautogui.click(spindle_button)
        else:
            # Try keyboard shortcut
            pyautogui.hotkey('ctrl', 's')
        time.sleep(3)  # Wait for spindle to spin up
        
        # Step 4: Go to XY zero
        print("Going to XY zero...")
        go_zero_button = pyautogui.locateOnScreen('images/go_to_zero.png', confidence=0.8)
        if go_zero_button:
            pyautogui.click(go_zero_button)
        else:
            # Fallback to REF ALL HOME button position
            pyautogui.click(371, 289)
        time.sleep(5)  # Wait for homing to complete
        
        # Step 5: Start the program
        print("Starting program...")
        start_button = pyautogui.locateOnScreen('images/start.png', confidence=0.8)
        if start_button:
            pyautogui.click(start_button)
        else:
            pyautogui.click(87, 555)  # START button position
        
        print("✓ G-code program running!")
        print("  - Z axis raised")
        print("  - Spindle started")
        print("  - Moved to XY zero")
        print("  - Program started")
        return True
        
    except Exception as e:
        print(f"Mach3 error: {e}")
        return False

def main():
    """Main loop"""
    print("=== CNC Controller Started ===")
    print(f"Checking {API_URL} every {CHECK_INTERVAL} seconds")
    print("Press Ctrl+C to stop\n")
    
    while True:
        try:
            # Check for new file
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Checking...")
            file_info = get_next_gcode()
            
            if file_info and file_info.get('url'):
                url = file_info['url']
                filename = file_info.get('filename', 'download.gcode')
                
                # Skip if already processed
                if filename not in processed_files:
                    print(f"\nNew file: {filename}")
                    
                    # Download
                    filepath = download_file(url, filename)
                    
                    if filepath:
                        # Run in Mach3
                        if run_in_mach3(filepath):
                            processed_files.add(filename)
                            print("✓ Success!\n")
                        else:
                            print("✗ Failed to run\n")
                    else:
                        print("✗ Download failed\n")
            
            # Wait before next check
            time.sleep(CHECK_INTERVAL)
            
        except KeyboardInterrupt:
            print("\nStopping...")
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(30)

if __name__ == "__main__":
    main()