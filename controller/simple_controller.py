"""
Simple G-code Runner - Just give it a URL and it runs the G-code
"""

import pyautogui
import time
import requests
from pathlib import Path
import sys
import os

# Set UTF-8 encoding for Windows console
if os.name == 'nt':  # Windows
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Configuration
GCODE_FOLDER = Path("C:/CNC/GCode")
GCODE_FOLDER.mkdir(parents=True, exist_ok=True)

def download_gcode(url):
    """Download G-code file from URL"""
    try:
        print(f"[DOWNLOAD] Downloading from: {url}")
        
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        # Get filename from URL or use default
        filename = url.split('/')[-1]
        if not filename.endswith('.gcode'):
            filename = "downloaded.gcode"
        
        filepath = GCODE_FOLDER / filename
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        print(f"[SUCCESS] Downloaded to: {filepath}")
        return filepath
        
    except Exception as e:
        print(f"[ERROR] Download failed: {e}")
        return None

def run_in_mach3(filepath):
    """Load and run G-code in Mach3"""
    try:
        # Find Mach3 window
        windows = pyautogui.getWindowsWithTitle("Mach3")
        if not windows:
            print("[ERROR] Mach3 not found! Please open Mach3 first.")
            return False
        
        # Activate Mach3
        windows[0].activate()
        time.sleep(1.5)
        
        # Load G-code file
        print("[LOADING] Loading G-code file...")
        load_gcode_button = pyautogui.locateOnScreen('images/load_gcode.png', confidence=0.8)
        if load_gcode_button:
            pyautogui.click(load_gcode_button)
            time.sleep(2)
            # Type filepath
            pyautogui.typewrite(str(filepath))
            time.sleep(1)
            # Click open button
            open_button = pyautogui.locateOnScreen('images/open.png', confidence=0.8)
            if open_button:
                pyautogui.click(open_button)
                time.sleep(3)
        else:
            # Fallback to keyboard shortcut
            print("[FALLBACK] Using keyboard shortcut...")
            pyautogui.hotkey('ctrl', 'o')
            time.sleep(2)
            pyautogui.typewrite(str(filepath))
            time.sleep(1)
            pyautogui.press('enter')
            time.sleep(3)
        
        # Raise Z axis for safety
        print("[SAFETY] Raising Z axis...")
        z_up_button = pyautogui.locateOnScreen('images/z_up.png', confidence=0.8)
        if z_up_button:
            for i in range(3):
                pyautogui.click(z_up_button)
                time.sleep(0.5)
        else:
            for i in range(3):
                pyautogui.click(598, 391)
                time.sleep(0.5)
        
        # Start spindle
        print("[SPINDLE] Starting spindle...")
        spindle_button = pyautogui.locateOnScreen('images/spindle_start.png', confidence=0.8)
        if spindle_button:
            pyautogui.click(spindle_button)
        else:
            pyautogui.hotkey('ctrl', 's')
        time.sleep(3)
        
        # Go to zero
        print("[POSITIONING] Going to zero...")
        go_zero_button = pyautogui.locateOnScreen('images/go_to_zero.png', confidence=0.8)
        if go_zero_button:
            pyautogui.click(go_zero_button)
        else:
            pyautogui.click(371, 289)
        time.sleep(5)
        
        # Start program
        print("[STARTING] Starting program...")
        start_button = pyautogui.locateOnScreen('images/start.png', confidence=0.8)
        if start_button:
            pyautogui.click(start_button)
        else:
            pyautogui.click(87, 555)
        
        print("[SUCCESS] G-code program running!")
        return True
        
    except Exception as e:
        print(f"[ERROR] Mach3 error: {e}")
        return False

def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: python simple_controller.py <gcode_url>")
        print("Example: python simple_controller.py https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/gcodefiles/nested_6parts_1.5mm_complete.gcode")
        return
    
    url = sys.argv[1]
    
    print("=== Simple G-code Runner ===")
    print(f"URL: {url}")
    print()
    
    # Download the file
    filepath = download_gcode(url)
    if not filepath:
        return
    
    # Run in Mach3
    success = run_in_mach3(filepath)
    
    if success:
        print("\n[COMPLETE] Job completed successfully!")
    else:
        print("\n[FAILED] Job failed!")

if __name__ == "__main__":
    main()