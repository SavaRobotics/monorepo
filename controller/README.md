# CNC Controller for Windows

This controller monitors your database for new G-code files and automatically runs them in Mach3.

## Features

- Continuously monitors API/database for new G-code files
- Downloads files to local folder
- Automatically loads and runs in Mach3
- Tracks processed files to avoid duplicates
- Simple Windows-compatible dependencies

## Setup

1. **Install Python** (if not already installed)
   - Download from python.org
   - Make sure to check "Add Python to PATH"

2. **Install dependencies**
   ```cmd
   pip install -r requirements.txt
   ```

3. **Configure the controller**
   
   Edit `config.py` or `simple_controller.py` with your settings:
   - `API_URL`: Your API endpoint that returns G-code download links
   - `GCODE_FOLDER`: Where to save downloaded files (default: C:/CNC/GCode)
   - `CHECK_INTERVAL`: How often to check for new files (default: 10 seconds)

4. **API Response Format**
   
   Your API should return JSON in this format:
   ```json
   {
     "url": "https://your-bucket.com/path/to/file.gcode",
     "filename": "part123.gcode",
     "file_id": "unique-id-123"
   }
   ```

## Usage

### Simple Version (Recommended to start)
```cmd
python simple_controller.py
```

### Full Version (More features)
```cmd
python main_enhanced.py
```

## How It Works

1. **Monitoring Loop**
   - Checks your API every 10 seconds
   - Downloads new G-code files
   - Skips already processed files

2. **Mach3 Integration**
   - Finds and activates Mach3 window
   - Uses Ctrl+O to open file dialog
   - Types the file path
   - Clicks START button

3. **File Management**
   - Downloads to C:/CNC/GCode/
   - Keeps track of processed files
   - Validates basic G-code format

## Troubleshooting

**Mach3 not found:**
- Make sure Mach3 is running
- Window title must contain "Mach3"

**START button not clicking:**
- Take a screenshot of your START button
- Save as `images/start.png` in the images folder
- Or adjust coordinates in code

**Can't download files:**
- Check your API_URL is correct
- Verify internet connection
- Check API returns correct format

## Environment Variables (Optional)

Create a `.env` file:
```
API_BASE_URL=https://your-api.com
CNC_API_KEY=your-api-key
GCODE_FOLDER=C:/CNC/GCode
CHECK_INTERVAL=10
```

## Example API Implementation

If using Supabase:
```python
# In your API endpoint
def get_next_gcode():
    # Query your database for pending jobs
    # Return first unprocessed file
    return {
        "url": storage_url,
        "filename": "part123.gcode",
        "file_id": "abc123"
    }
```