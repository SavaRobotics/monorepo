# CAD-to-CNC Workflow Integration Setup

This guide explains how to set up the complete end-to-end CAD-to-CNC manufacturing workflow using Mastra and the CNC Controller system.

## System Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Workflow      │    │   Cloud Storage   │    │  Windows CNC    │
│   Computer      │───▶│   (Supabase)     │◀───│   Computer      │
│  (webdemo)      │    │                  │    │  (controller)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                                                │
        │              HTTP API Call                     │
        └────────────────────────────────────────────────┘
```

## Prerequisites

### Workflow Computer (webdemo)
- Node.js and npm/yarn
- Mastra framework
- Network access to Windows CNC computer

### Windows CNC Computer (controller)  
- Windows OS
- Python 3.7+
- Mach3 CNC software
- Network connectivity

## Installation Steps

### 1. Setup Windows CNC Computer

1. **Clone/copy the controller folder** to the Windows machine:
```cmd
# Copy the entire controller/ folder to Windows machine
```

2. **Install Python dependencies**:
```cmd
cd controller
pip install -r requirements.txt
```

3. **Configure Mach3 images**:
   - Take screenshots of Mach3 UI elements
   - Save them in the `images/` folder with exact names:
     - `load_gcode.png`
     - `open.png`
     - `z_up.png`
     - `spindle_start.png`
     - `go_to_zero.png`
     - `start.png`

4. **Test the simple controller**:
```cmd
# Open Mach3 first, then test with a sample G-code URL
python simple_controller.py https://example.com/test.gcode
```

5. **Start the FastAPI server**:
```cmd
python start_cnc_server.py
```

The server will be available at `http://localhost:8000`

### 2. Setup Workflow Computer (webdemo)

1. **Install dependencies**:
```bash
cd webdemo
npm install
```

2. **Configure environment variables**:
```bash
# Create .env file or set environment variables
export WINDOWS_CNC_IP=192.168.1.100      # Replace with actual Windows IP
export CNC_CONTROLLER_PORT=8000           # Port of FastAPI server
export SUPABASE_URL=your_supabase_url
export SUPABASE_KEY=your_supabase_key
```

3. **Build Mastra workflow**:
```bash
npm run build:mastra
```

4. **Start the development server**:
```bash
npm run dev:mastra
```

## Network Configuration

### Windows Firewall Setup
1. Open Windows Defender Firewall
2. Click "Allow an app or feature through Windows Defender Firewall"
3. Add Python.exe and allow it through both private and public networks
4. Or create a specific rule for port 8000

### IP Address Configuration
1. **Find Windows computer IP**:
```cmd
ipconfig
```

2. **Set static IP** (recommended):
   - Go to Network Settings → Change adapter options
   - Right-click network connection → Properties
   - Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
   - Set static IP address

3. **Update workflow environment**:
```bash
export WINDOWS_CNC_IP=192.168.1.100  # Use actual static IP
```

## Testing the Integration

### 1. Test FastAPI Server
```bash
# From any computer on the network
curl http://192.168.1.100:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "controller_script_exists": true,
  "python_executable": "C:\\Python\\python.exe",
  "active_jobs": 0
}
```

### 2. Test CNC Trigger
```bash
# Test with a simple G-code URL
curl "http://192.168.1.100:8000/run-gcode?url=https://example.com/test.gcode"
```

### 3. Test Complete Workflow
1. Run the Mastra workflow with a CAD file URL
2. Monitor the workflow progress
3. Check that CNC controller is triggered automatically
4. Verify Mach3 loads and runs the G-code

## Workflow Usage

### Running the Complete Workflow

1. **Start Windows CNC server**:
```cmd
# On Windows machine
cd controller
python start_cnc_server.py
```

2. **Open Mach3** and ensure it's ready for operation

3. **Execute workflow**:
```bash
# On workflow computer
cd webdemo
npm run dev:mastra

# Then trigger workflow with CAD file URL
```

The workflow will automatically:
1. ✅ Analyze CAD file input
2. ✅ Unfold CAD to DXF
3. ✅ Upload DXF to cloud storage
4. ✅ Update parts database
5. ✅ Retrieve all DXF files
6. ✅ Generate nested DXF layout
7. ✅ Upload nested DXF
8. ✅ Generate G-code from nested DXF
9. ✅ Upload G-code to cloud
10. ✅ **Trigger CNC controller remotely** ← New step!
11. ✅ Provide comprehensive analysis

### Monitoring and Status

- **Workflow progress**: Monitor via Mastra dashboard
- **CNC server logs**: Check `controller/cnc_server.log`
- **Job status**: `GET http://windows-ip:8000/job-status/{job_id}`
- **Active jobs**: `GET http://windows-ip:8000/jobs`

## Troubleshooting

### Common Issues

1. **Connection Refused**:
   - Check Windows firewall settings
   - Verify server is running on Windows machine
   - Confirm IP address and port

2. **Workflow Timeout**:
   - Increase timeout in CNC controller tool (default 30s)
   - Check network latency

3. **Mach3 Automation Fails**:
   - Update screenshots in `images/` folder
   - Ensure Mach3 is in foreground
   - Check screen resolution compatibility

4. **Permission Errors**:
   - Run Python scripts as Administrator
   - Check file system permissions

### Logs and Debugging

- **Workflow logs**: Available in Mastra dashboard
- **CNC server logs**: `controller/cnc_server.log`
- **Console output**: Real-time status from both systems
- **FastAPI docs**: `http://windows-ip:8000/docs` for API testing

## Security Considerations

- Use this setup only on trusted local networks
- Consider VPN for remote access
- Implement authentication for production use
- Regular backup of configuration and logs
- Test emergency stop procedures

## Performance Optimization

- Use static IPs to avoid DNS lookup delays
- Increase timeouts for large G-code files
- Monitor network bandwidth usage
- Consider local caching for frequently used files

## Maintenance

- Regularly update Python dependencies
- Keep Mach3 and Windows updated
- Backup configuration files
- Test workflow periodically with known good files
- Monitor disk space for logs and temporary files 