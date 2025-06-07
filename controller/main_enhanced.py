import pyautogui
import time
import os
import requests
import json
from pathlib import Path
from datetime import datetime
import hashlib

# Configure PyAutoGUI settings
pyautogui.FAILSAFE = True  # Move mouse to top-left corner to abort
pyautogui.PAUSE = 0.5      # Pause between actions

# Configuration
API_URL = "YOUR_API_ENDPOINT_HERE"  # Replace with your API endpoint
API_KEY = os.environ.get("API_KEY", "your-api-key-here")  # Get from environment or config
GCODE_FOLDER = Path("C:/CNC/GCode")  # Local folder for G-code files
CHECK_INTERVAL = 10  # Seconds between checks
PROCESSED_FILES_LOG = Path("C:/CNC/processed_files.json")

# Ensure directories exist
GCODE_FOLDER.mkdir(parents=True, exist_ok=True)
PROCESSED_FILES_LOG.parent.mkdir(parents=True, exist_ok=True)

def load_processed_files():
    """Load list of already processed files"""
    if PROCESSED_FILES_LOG.exists():
        with open(PROCESSED_FILES_LOG, 'r') as f:
            return json.load(f)
    return []

def save_processed_files(processed_files):
    """Save list of processed files"""
    with open(PROCESSED_FILES_LOG, 'w') as f:
        json.dump(processed_files, f, indent=2)

def check_for_new_gcode():
    """Check database/API for new G-code file"""
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(API_URL, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Expected response format:
        # {
        #   "file_url": "https://your-bucket.com/path/to/file.gcode",
        #   "file_id": "unique-file-id",
        #   "filename": "part123.gcode"
        # }
        
        if data and "file_url" in data:
            return data
        
        return None
        
    except requests.RequestException as e:
        print(f"Error checking for new G-code: {e}")
        return None

def download_gcode(file_data):
    """Download G-code file from URL"""
    try:
        file_url = file_data["file_url"]
        filename = file_data.get("filename", f"gcode_{datetime.now().strftime('%Y%m%d_%H%M%S')}.gcode")
        
        # Ensure filename ends with .gcode
        if not filename.endswith('.gcode'):
            filename += '.gcode'
        
        filepath = GCODE_FOLDER / filename
        
        print(f"Downloading G-code from: {file_url}")
        
        response = requests.get(file_url, stream=True, timeout=30)
        response.raise_for_status()
        
        # Download with progress
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        print(f"Download progress: {progress:.1f}%", end='\r')
        
        print(f"\nDownloaded successfully: {filepath}")
        return filepath
        
    except Exception as e:
        print(f"Error downloading G-code: {e}")
        return None

def validate_gcode(filepath):
    """Basic validation of G-code file"""
    try:
        with open(filepath, 'r') as f:
            content = f.read(1000)  # Read first 1000 chars
            
        # Basic checks
        if len(content) < 10:
            print("G-code file too small")
            return False
            
        # Check for common G-code commands
        gcode_indicators = ['G0', 'G1', 'G2', 'G3', 'M3', 'M5', 'G90', 'G91']
        if not any(indicator in content.upper() for indicator in gcode_indicators):
            print("File doesn't appear to contain valid G-code")
            return False
            
        return True
        
    except Exception as e:
        print(f"Error validating G-code: {e}")
        return False

def find_mach3_window():
    """Find and activate the Mach3 window"""
    try:
        # Look for Mach3 window
        mach3_window = pyautogui.getWindowsWithTitle("Mach3")
        if mach3_window:
            mach3_window[0].activate()
            time.sleep(1)
            return True
        else:
            print("Mach3 window not found!")
            return False
    except:
        print("Error finding Mach3 window")
        return False

def load_gcode_file(filepath):
    """Load G-code file into Mach3"""
    try:
        print(f"Loading G-code file: {filepath}")
        
        # Method 1: Try using image recognition for File menu
        if os.path.exists('images/file.png') and os.path.exists('images/open.png'):
            # Click File menu
            file_button = pyautogui.locateOnScreen('images/file.png', confidence=0.8)
            if file_button:
                pyautogui.click(file_button)
                time.sleep(1)
                
                # Click Open
                open_button = pyautogui.locateOnScreen('images/open.png', confidence=0.8)
                if open_button:
                    pyautogui.click(open_button)
                    time.sleep(2)
        else:
            # Method 2: Use keyboard shortcuts
            print("Using keyboard shortcuts...")
            pyautogui.hotkey('ctrl', 'o')  # Common shortcut for Open
            time.sleep(2)
        
        # Type the filepath
        pyautogui.typewrite(str(filepath))
        time.sleep(1)
        
        # Press Enter to open
        pyautogui.press('enter')
        time.sleep(3)
        
        print("G-code file loaded")
        return True
        
    except Exception as e:
        print(f"Error loading G-code file: {e}")
        return False

def run_gcode_sequence():
    """Run the complete sequence: raise Z, start spindle, go to XY zero, run program"""
    try:
        # Step 1: Raise Z axis for safety (do this FIRST before any XY movement)
        print("Raising Z-axis for safety...")
        z_up_button = pyautogui.locateOnScreen('images/z_up.png', confidence=0.8)
        if z_up_button:
            # Click Z up button multiple times
            for i in range(3):
                pyautogui.click(z_up_button)
                time.sleep(0.5)
                print(f"  Z-axis raised {i+1}/3")
        else:
            # Fallback to coordinates
            for i in range(3):
                pyautogui.click(598, 391)  # Z+ button position
                time.sleep(0.5)
        time.sleep(1)
        
        # Step 2: Start spindle
        print("Starting spindle...")
        spindle_button = pyautogui.locateOnScreen('images/spindle_start.png', confidence=0.8)
        if spindle_button:
            pyautogui.click(spindle_button)
            print("  Clicked spindle start button")
        else:
            # Try keyboard shortcut
            pyautogui.hotkey('ctrl', 's')
            print("  Used keyboard shortcut for spindle")
        time.sleep(3)  # Wait for spindle to reach speed
        
        # Step 3: Go to XY zero position
        print("Moving to XY zero position...")
        go_zero_button = pyautogui.locateOnScreen('images/go_to_zero.png', confidence=0.8)
        if go_zero_button:
            pyautogui.click(go_zero_button)
            print("  Clicked go to zero button")
        else:
            # Fallback to REF ALL HOME button position
            pyautogui.click(371, 289)
            print("  Used fallback coordinates for zero")
        time.sleep(5)  # Wait for movement to complete
        
        # Step 4: Start the program
        print("Starting G-code program...")
        start_button = pyautogui.locateOnScreen('images/start.png', confidence=0.8)
        if start_button:
            pyautogui.click(start_button)
            print("  Clicked START button")
        else:
            pyautogui.click(87, 555)  # Fallback coordinates for START
            print("  Used fallback coordinates for START")
        
        print("\n✓ G-code program started successfully!")
        print("  ✓ Z-axis raised for safety")
        print("  ✓ Spindle running")
        print("  ✓ Positioned at XY zero")
        print("  ✓ Program running")
        return True
        
    except Exception as e:
        print(f"Error running G-code sequence: {e}")
        return False

def report_status(file_id, status):
    """Report status back to API"""
    try:
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "file_id": file_id,
            "status": status,
            "timestamp": datetime.now().isoformat()
        }
        
        response = requests.post(f"{API_URL}/status", json=data, headers=headers, timeout=10)
        response.raise_for_status()
        print(f"Status reported: {status}")
        
    except Exception as e:
        print(f"Error reporting status: {e}")

def main_loop():
    """Main monitoring loop"""
    print("=== CNC Controller Started ===")
    print(f"Monitoring for new G-code files...")
    print(f"G-code folder: {GCODE_FOLDER}")
    print(f"Check interval: {CHECK_INTERVAL} seconds")
    print("\nPress Ctrl+C to stop\n")
    
    processed_files = load_processed_files()
    
    while True:
        try:
            # Check for new G-code
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Checking for new G-code...")
            file_data = check_for_new_gcode()
            
            if file_data:
                file_id = file_data.get("file_id", "unknown")
                
                # Skip if already processed
                if file_id in processed_files:
                    print(f"File {file_id} already processed, skipping...")
                else:
                    print(f"\nNew G-code found: {file_data.get('filename', 'unknown')}")
                    
                    # Download the file
                    filepath = download_gcode(file_data)
                    
                    if filepath and validate_gcode(filepath):
                        # Find and activate Mach3
                        if find_mach3_window():
                            # Load the G-code file
                            if load_gcode_file(filepath):
                                # Run the sequence
                                if run_gcode_sequence():
                                    # Mark as processed
                                    processed_files.append(file_id)
                                    save_processed_files(processed_files)
                                    report_status(file_id, "running")
                                    
                                    print("\n✓ G-code loaded and running!")
                                    print("Waiting for next file...\n")
                                else:
                                    report_status(file_id, "error_running")
                            else:
                                report_status(file_id, "error_loading")
                        else:
                            print("Please ensure Mach3 is running!")
                            report_status(file_id, "error_mach3_not_found")
                    else:
                        report_status(file_id, "error_download")
            else:
                print("No new files")
            
            # Wait before next check
            time.sleep(CHECK_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\nStopping controller...")
            break
        except Exception as e:
            print(f"\nUnexpected error: {e}")
            print("Continuing in 30 seconds...")
            time.sleep(30)

if __name__ == "__main__":
    # Create required directories
    GCODE_FOLDER.mkdir(parents=True, exist_ok=True)
    
    # Check if Mach3 is running
    if not find_mach3_window():
        print("WARNING: Mach3 not detected. Please start Mach3 before continuing.")
        input("Press Enter when Mach3 is running...")
    
    # Start the main loop
    try:
        main_loop()
    except Exception as e:
        print(f"Fatal error: {e}")
        input("Press Enter to exit...")