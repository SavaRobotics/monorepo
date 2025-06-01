#!/usr/bin/env python3
import os
import sys
import tempfile
import urllib.request
import urllib.parse
from flask import Flask, request, send_file, jsonify
import subprocess
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy"}), 200

@app.route('/unfold', methods=['GET'])
def unfold_step():
    """
    GET endpoint to unfold a STEP file into DXF.
    The STEP file URL should be provided as a query parameter: ?url=<step_url>
    Returns the unfolded DXF file.
    """
    try:
        # Get the STEP file URL from query parameters
        step_url = request.args.get('url')
        if not step_url:
            return jsonify({"error": "Missing 'url' query parameter"}), 400
        
        # Get optional parameters
        k_factor = request.args.get('k_factor', os.environ.get('K_FACTOR', '0.38'))
        
        logger.info(f"Processing STEP file from URL: {step_url}")
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download the STEP file
            input_path = os.path.join(temp_dir, 'input.step')
            
            try:
                urllib.request.urlretrieve(step_url, input_path)
                logger.info(f"Downloaded STEP file to: {input_path}")
            except Exception as e:
                logger.error(f"Failed to download STEP file: {e}")
                return jsonify({"error": f"Failed to download STEP file: {str(e)}"}), 400
            
            # Set environment variables for the unfolding process
            env = os.environ.copy()
            env['K_FACTOR'] = str(k_factor)
            env['OUTPUT_DIR'] = temp_dir
            
            # Run the unfold script using xvfb-run to handle display
            cmd = [
                'xvfb-run', '-a',
                'freecad', input_path,
                '-c', '/app/src/unfolder/unfold.py'
            ]
            
            logger.info(f"Running command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                cwd=temp_dir  # Set working directory to temp_dir
            )
            
            if result.returncode != 0:
                logger.error(f"Unfold process failed: {result.stderr}")
                return jsonify({
                    "error": "Unfold process failed",
                    "details": result.stderr
                }), 500
            
            # Look for the output DXF file (expecting largest_face.dxf)
            output_files = []
            for filename in os.listdir(temp_dir):
                if filename.endswith('.dxf'):
                    output_files.append(os.path.join(temp_dir, filename))
            
            if not output_files:
                logger.error("No output DXF file found")
                return jsonify({"error": "No output DXF file generated"}), 500
            
            # Return the first DXF file found (typically 'largest_face.dxf')
            output_path = output_files[0]
            logger.info(f"Returning unfolded DXF: {os.path.basename(output_path)}")
            
            return send_file(
                output_path,
                mimetype='application/dxf',
                as_attachment=True,
                download_name='unfolded.dxf'
            )
            
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@app.route('/', methods=['GET'])
def index():
    """Root endpoint with usage information"""
    return jsonify({
        "service": "STEP to DXF Unfolder API",
        "endpoints": {
            "/unfold": {
                "method": "GET",
                "description": "Unfold a STEP file into DXF",
                "parameters": {
                    "url": "URL to the STEP file (required)",
                    "k_factor": "K-factor for unfolding (optional, default: 0.38)"
                },
                "example": "/unfold?url=https://example.com/file.step&k_factor=0.4"
            },
            "/health": {
                "method": "GET",
                "description": "Health check endpoint"
            }
        }
    }), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)