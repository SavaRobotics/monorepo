# Simple G-code Runner

A simple Python script that downloads G-code files from URLs and runs them in Mach3 CNC software.

## Features

- Downloads G-code files from any URL
- Automatically loads and runs files in Mach3
- Safety features: raises Z-axis, starts spindle, goes to zero
- Image recognition for GUI automation

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure you have the required images in the `images/` folder:
   - `load_gcode.png` - Load G-code button
   - `open.png` - Open file button  
   - `z_up.png` - Z-axis up button
   - `spindle_start.png` - Spindle start button
   - `go_to_zero.png` - Go to zero button
   - `start.png` - Start program button

## Usage

1. Open Mach3 CNC software
2. Run the script with a G-code URL:

```bash
python simple_controller.py <gcode_url>
```

### Example

```bash
python simple_controller.py https://example.com/path/to/your/file.gcode
```

## How It Works

1. **Download**: Downloads the G-code file from the provided URL
2. **Load**: Clicks the load G-code button in Mach3 and opens the file
3. **Safety**: Raises the Z-axis for safety
4. **Prepare**: Starts the spindle and moves to zero position  
5. **Run**: Starts the G-code program

## Requirements

- Python 3.7+
- Mach3 CNC software (must be open and running)
- Windows OS (for pyautogui compatibility)

## Safety Notes

⚠️ **Always ensure your CNC machine is properly set up and safe before running any G-code!**

- The script raises the Z-axis before starting
- Make sure your workpiece and tooling are properly secured
- Monitor the machine during operation 