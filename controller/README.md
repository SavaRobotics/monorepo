# CNC Controller System

A complete CNC automation system that includes:
- Simple G-code runner for direct file execution
- FastAPI server for remote workflow integration
- Integration with Mastra workflow automation

## Features

### Simple G-code Runner
- Downloads G-code files from any URL
- Automatically loads and runs files in Mach3
- Safety features: raises Z-axis, starts spindle, goes to zero
- Image recognition for GUI automation

### FastAPI Server
- Remote HTTP API for triggering CNC operations
- Background job processing with status tracking
- Integration with automated workflows
- Comprehensive logging and error handling

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

### Option 1: Direct Script Usage

1. Open Mach3 CNC software
2. Run the script with a G-code URL:

```bash
python simple_controller.py <gcode_url>
```

**Example:**
```bash
python simple_controller.py https://example.com/path/to/your/file.gcode
```

### Option 2: FastAPI Server (Recommended for Integration)

1. Open Mach3 CNC software
2. Start the FastAPI server:

```bash
python start_cnc_server.py
```

Or manually:
```bash
python fastapi_server.py
```

3. The server will be available at:
   - **API**: `http://localhost:8000`
   - **Documentation**: `http://localhost:8000/docs`
   - **Health Check**: `http://localhost:8000/health`

4. Trigger G-code execution via HTTP:

```bash
# GET request
curl "http://localhost:8000/run-gcode?url=https://pynaxyfwywlqfvtjbtuc.supabase.co/storage/v1/object/public/gcodefiles//nested_6parts_1.5mm_complete.gcode"

# POST request
curl -X POST "http://localhost:8000/run-gcode" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/file.gcode"}'
```

### Option 3: Automated Workflow Integration

The system integrates with Mastra workflows for complete CAD-to-CNC automation:

1. Set environment variables on the workflow computer:
```bash
export WINDOWS_CNC_IP=192.168.4.68  # IP of Windows CNC computer
export CNC_CONTROLLER_PORT=8000       # Port of FastAPI server
```

2. The workflow will automatically:
   - Generate G-code from CAD files
   - Upload to cloud storage
   - Trigger CNC execution remotely
   - Provide comprehensive analysis

## API Endpoints

### GET /run-gcode
Triggers G-code execution with URL parameter.

**Parameters:**
- `url` (string): URL to the G-code file

**Response:**
```json
{
  "success": true,
  "message": "G-code job started successfully",
  "job_id": "job_1234567890"
}
```

### GET /job-status/{job_id}
Get the status of a specific job.

**Response:**
```json
{
  "status": "completed",
  "url": "https://example.com/file.gcode"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "controller_script_exists": true,
  "python_executable": "C:\\Python\\python.exe",
  "active_jobs": 0
}
```

## Configuration

### Environment Variables

- `CNC_SERVER_HOST`: Server bind address (default: `0.0.0.0`)
- `CNC_SERVER_PORT`: Server port (default: `8000`)
- `WINDOWS_CNC_IP`: IP address for workflow integration
- `CNC_CONTROLLER_PORT`: Port for workflow integration

### Network Setup

For remote integration:
1. Ensure Windows firewall allows port 8000
2. Make sure both computers are on the same network
3. Use static IP for the Windows CNC computer (recommended)

## How It Works

### Simple Controller Flow
1. **Download**: Downloads the G-code file from the provided URL
2. **Load**: Clicks the load G-code button in Mach3 and opens the file
3. **Safety**: Raises the Z-axis for safety
4. **Prepare**: Starts the spindle and moves to zero position  
5. **Run**: Starts the G-code program

### FastAPI Server Flow
1. **Receive**: HTTP request with G-code URL
2. **Validate**: URL format and accessibility
3. **Queue**: Background task execution
4. **Execute**: Runs simple_controller.py with the URL
5. **Track**: Job status and logging
6. **Response**: Immediate response with job ID

### Workflow Integration
1. **CAD Processing**: Workflow processes CAD files through unfold/nesting
2. **G-code Generation**: Converts to machine-ready G-code
3. **Cloud Upload**: Stores G-code in accessible storage
4. **Remote Trigger**: HTTP call to Windows CNC computer
5. **Execution**: Automatic Mach3 operation
6. **Analysis**: Comprehensive workflow reporting

## Requirements

- Python 3.7+
- Mach3 CNC software (must be open and running)
- Windows OS (for pyautogui compatibility)
- Network connectivity for remote integration

## Safety Notes

⚠️ **Always ensure your CNC machine is properly set up and safe before running any G-code!**

- The script raises the Z-axis before starting
- Make sure your workpiece and tooling are properly secured
- Monitor the machine during operation
- Test with safe/dummy operations first
- Ensure emergency stop is accessible

## Troubleshooting

### Common Issues

1. **Mach3 not found**: Ensure Mach3 is running and visible
2. **Image recognition fails**: Update screenshots in `images/` folder
3. **Network connection**: Check firewall and IP configuration
4. **Permission errors**: Run as administrator if needed
5. **Timeout errors**: Increase timeout values for large files

### Logs

- Server logs: `cnc_server.log`
- Console output shows real-time status
- Use `/health` endpoint to check system status 