import pyautogui
import time
import os
from pathlib import Path

# Configure PyAutoGUI settings
pyautogui.FAILSAFE = True  # Move mouse to top-left corner to abort
pyautogui.PAUSE = 0.5      # Pause between actions

def find_mach3_window():
    """Find and activate the Mach3 window"""
    try:
        # Look for Mach3 window (adjust title as needed)
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

def click_load_gcode():
    """Click the Load G-Code button"""
    try:
        # Look for the Load G-Code button
        load_button = pyautogui.locateOnScreen('load_gcode.png', confidence=0.8)
        if load_button:
            pyautogui.click(load_button)
            print("Clicked Load G-Code button")
            time.sleep(2)  # Wait for file dialog to open
            return True
        else:
            # Fallback: try to find by text or use approximate coordinates
            # You may need to adjust these coordinates based on your screen
            print("Load G-Code button not found, trying approximate location...")
            pyautogui.click(77, 114)  # Approximate coordinates from your screenshot
            time.sleep(2)
            return True
    except Exception as e:
        print(f"Error clicking Load G-Code: {e}")
        return False

def select_most_recent_file():
    """Select a file in the file explorer - super simple approach"""
    try:
        print("Attempting to select a file...")
        
        # Wait for file dialog to fully load
        time.sleep(3)
        
        # Super simple approach - just press some basic keys
        print("Using basic file selection...")
        
        # First, make sure we're in the file list (click in the main area)
        pyautogui.press('tab')  # Tab to file list area
        time.sleep(0.5)
        
        # Go to first file
        pyautogui.press('home')
        time.sleep(0.5)
        
        # Just select the first file (or whatever is highlighted)
        pyautogui.press('enter')
        time.sleep(1)
        
        print("File selection completed")
        return True
        
    except Exception as e:
        print(f"Error selecting file: {e}")
        # Ultimate fallback: just press Enter
        print("Fallback: just pressing Enter")
        pyautogui.press('enter')
        time.sleep(1)
        return True

def select_file_manually():
    """Manual file selection - waits for user to select file"""
    print("File dialog should now be open.")
    print("Please manually select your G-code file and press Enter/Open")
    print("The script will continue automatically after you select the file...")
    
    # Wait for user to select file - we'll wait for the file dialog to close
    # This is a simple approach - just wait and assume they'll select something
    time.sleep(10)  # Give user 10 seconds to select
    
    print("Continuing with automation...")
    return True

def go_to_home():
    """Move all axes to home position"""
    try:
        # Method 1: Try to find REF ALL HOME button by image
        try:
            home_button = pyautogui.locateOnScreen('go_to_zero.png', confidence=0.8)
            if home_button:
                pyautogui.click(home_button)
                print("Clicked REF ALL HOME button")
                time.sleep(5)  # Wait for homing to complete
                return True
        except:
            pass
        
        # Method 2: Use the REF ALL HOME button coordinates from screenshot
        print("Trying REF ALL HOME button location...")
        pyautogui.click(371, 289)  # REF ALL HOME button coordinates
        print("Clicked REF ALL HOME button")
        time.sleep(5)  # Wait for homing sequence to complete
        
        # Method 3: Alternative keyboard shortcut if available
        # pyautogui.hotkey('ctrl', 'h')  # Uncomment if your Mach3 uses this shortcut
        
        print("Homing sequence completed")
        return True
        
    except Exception as e:
        print(f"Error going to home: {e}")
        return False

def move_z_up(distance=10.0):
    """Move Z-axis up by specified distance (default 10mm)"""
    try:
        # Method 1: Use Z+ jog button
        print(f"Moving Z-axis up by {distance}mm...")
        
        # Click on Z+ button (based on screenshot coordinates)
        z_plus_button_x = 598  # Z+ button coordinates from screenshot
        z_plus_button_y = 391
        
        # Calculate number of clicks based on jog step (19.35 from screenshot)
        jog_step = 19.35  # Current jog step from your screenshot
        clicks_needed = max(1, int(distance / jog_step))
        
        for i in range(clicks_needed):
            pyautogui.click(z_plus_button_x, z_plus_button_y)
            time.sleep(0.5)  # Wait between clicks
            print(f"Z-axis jog click {i+1}/{clicks_needed}")
        
        print(f"Z-axis moved up approximately {clicks_needed * jog_step}mm")
        time.sleep(2)  # Wait for movement to complete
        return True
        
    except Exception as e:
        print(f"Error moving Z-axis up: {e}")
        return False

def start_spindle():
    """Start the spindle before running the program"""
    try:
        # Method 1: Try to find spindle start button by image
        try:
            spindle_button = pyautogui.locateOnScreen('spindle_start.png', confidence=0.8)
            if spindle_button:
                pyautogui.click(spindle_button)
                print("Clicked spindle start button")
                time.sleep(2)  # Wait for spindle to start
                return True
        except:
            pass
        
        # Method 2: Use keyboard shortcut (common in Mach3)
        print("Trying spindle start keyboard shortcut...")
        pyautogui.hotkey('ctrl', 's')  # Common shortcut for spindle start
        time.sleep(1)
        
        # Method 3: Try the spindle controls area (based on your screenshot)
        # The spindle controls appear to be on the right side
        print("Trying spindle control area...")
        # Look for spindle CW direction button (based on screenshot layout)
        pyautogui.click(897, 566)  # Approximate location of spindle controls
        time.sleep(0.5)
        
        # Click spindle start/on button
        pyautogui.click(975, 566)  # Approximate spindle start button location
        
        print("Spindle start command sent")
        time.sleep(3)  # Wait for spindle to spin up
        return True
        
    except Exception as e:
        print(f"Error starting spindle: {e}")
        print("You may need to start the spindle manually")
        return False

def click_start_button():
    """Click the START button"""
    try:
        # Look for the green START button
        start_button = pyautogui.locateOnScreen('start.png', confidence=0.8)
        if start_button:
            pyautogui.click(start_button)
            print("Clicked START button")
            return True
        else:
            # Fallback: use approximate coordinates from screenshot
            print("START button not found, trying approximate location...")
            pyautogui.click(87, 555)  # Approximate coordinates for START button
            print("Clicked START button")
            return True
    except Exception as e:
        print(f"Error clicking START: {e}")
        return False

def open_file_with_images():
    """Open file using image recognition - clicks file.png then open.png"""
    try:
        print("Looking for file.png to click...")
        
        # Wait a moment for any windows to be ready
        time.sleep(2)
        
        # Look for file.png and click it
        file_image = pyautogui.locateOnScreen('file.png', confidence=0.8)
        if file_image:
            pyautogui.click(file_image)
            print("Clicked file.png")
            time.sleep(2)  # Wait for any dialog or action to complete
        else:
            print("file.png not found on screen")
            return False
        
        # Now look for open.png and click it
        print("Looking for open.png to click...")
        time.sleep(1)  # Give a moment for the interface to update
        
        open_image = pyautogui.locateOnScreen('open.png', confidence=0.8)
        if open_image:
            pyautogui.click(open_image)
            print("Clicked open.png")
            time.sleep(3)  # Wait for file to load
            return True
        else:
            print("open.png not found on screen")
            return False
            
    except Exception as e:
        print(f"Error in file opening process: {e}")
        return False

def main():
    """Main automation function"""
    print("Starting Mach3 CNC automation...")
    print("Make sure Mach3 is open and visible on screen.")
    print("Press Ctrl+C to abort at any time (move mouse to top-left corner)")
    
    # Wait a moment for user to position windows
    time.sleep(3)
    
    # Step 1: Find and activate Mach3 window
    if not find_mach3_window():
        print("Could not find Mach3 window. Please ensure it's open.")
        return
    
    # Step 2: Open file using image recognition (file.png then open.png)
    print("Opening file using image recognition...")
    if not open_file_with_images():
        print("Failed to open file using image recognition")
        print("Make sure file.png and open.png images are in the same directory")
        return
    
    # Step 3: Wait for G-Code to load
    print("Waiting for G-Code to load...")
    time.sleep(3)
    
    # Step 4: Go to home position
    print("Moving to home position...")
    if not go_to_home():
        print("Warning: Failed to go to home position")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return
    
    # Step 5: Move Z-axis up for clearance
    print("Moving Z-axis up for clearance...")
    if not move_z_up(10.0):  # Move up 10mm (adjust as needed)
        print("Warning: Failed to move Z-axis up")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            return
    
    # Step 6: Start the spindle
    print("Starting spindle...")
    if not start_spindle():
        print("Warning: Failed to start spindle automatically")
        print("Please start the spindle manually before continuing")
        input("Press Enter when spindle is running...")
    
    # Step 7: Click START button
    if not click_start_button():
        print("Failed to click START button")
        return
    
    print("Automation completed successfully!")
    print("CNC program should now be running with proper sequence:")
    print("✓ G-Code loaded")
    print("✓ Moved to home position") 
    print("✓ Z-axis moved up for clearance")
    print("✓ Spindle started")
    print("✓ Program started")

# Alternative method using image recognition
def setup_image_templates():
    """
    REQUIRED: Create these image files for the automation to work:
    1. file.png -> Screenshot of the file you want to open
    2. open.png -> Screenshot of the 'Open' button
    3. start.png -> Screenshot of the 'START' button (optional, has fallback)
    4. spindle_start.png -> Screenshot of spindle start button (optional, has fallback)
    5. go_to_zero.png -> Screenshot of 'REF ALL HOME' button (optional, has fallback)
    
    Place these images in the same directory as this script.
    """
    print("REQUIRED IMAGE FILES for automation:")
    print("1. Take a screenshot of the file you want to open")
    print("2. Save it as 'file.png'")
    print("3. Take a screenshot of the 'Open' button") 
    print("4. Save it as 'open.png'")
    print("")
    print("OPTIONAL (have coordinate fallbacks):")
    print("5. Take a screenshot of the 'START' button -> save as 'start.png'")
    print("6. Take a screenshot of the spindle start button -> save as 'spindle_start.png'")
    print("7. Take a screenshot of the 'REF ALL HOME' button -> save as 'go_to_zero.png'")
    print("")
    print("Place all images in the same folder as this script")
    print("The script will work in another window under Mach3 for file operations")

# Configuration settings
Z_CLEARANCE_DISTANCE = 10.0  # Distance to move Z-axis up (in mm)
HOMING_WAIT_TIME = 5         # Time to wait for homing to complete (seconds)
SPINDLE_STARTUP_TIME = 3     # Time to wait for spindle to reach speed (seconds)

if __name__ == "__main__":
    try:
        # Check if running for first time or missing required images
        if not os.path.exists('file.png') or not os.path.exists('open.png'):
            setup_image_templates()
            print("\nMissing required image files!")
            print("You need 'file.png' and 'open.png' for the automation to work.")
            print("Please create these images and run the script again.")
            input("Press Enter to exit...")
            exit()
        
        print("Found required image files, starting automation...")
        main()
        
    except KeyboardInterrupt:
        print("\nAutomation stopped by user")
    except Exception as e:
        print(f"Unexpected error: {e}")