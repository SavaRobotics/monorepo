#!/usr/bin/env python3
import os
import sys
import tempfile
import urllib.request
import json
from flask import Flask, request, send_file, jsonify
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy"}), 200

@app.route('/nest', methods=['GET'])
def nest_dxf_files():
    """
    GET endpoint to nest multiple DXF files.
    DXF file URLs should be provided as comma-separated query parameter: 
?urls=url1,url2,url3
    Optional parameters:
    - sheet_width: Width of the sheet (default: 1000)
    - sheet_height: Height of the sheet (default: 500)
    - spacing: Spacing between parts (default: 2.0)
    Returns the nested DXF file.
    """
    try:
        # Get DXF URLs from query parameters
        urls_param = request.args.get('urls')
        if not urls_param:
            return jsonify({"error": "Missing 'urls' query parameter"}), 400

        dxf_urls = [url.strip() for url in urls_param.split(',') if url.strip()]
        if not dxf_urls:
            return jsonify({"error": "No valid URLs provided"}), 400

        # Get optional parameters
        sheet_width = request.args.get('sheet_width',
os.environ.get('SHEET_WIDTH', '1000'))
        sheet_height = request.args.get('sheet_height',
os.environ.get('SHEET_HEIGHT', '500'))
        spacing = request.args.get('spacing', os.environ.get('PART_SPACING',
'2.0'))

        logger.info(f"Processing {len(dxf_urls)} DXF files for nesting")
        logger.info(f"Sheet size: {sheet_width}x{sheet_height}, spacing: {spacing}")

        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download all DXF files
            downloaded_files = []
            for i, url in enumerate(dxf_urls):
                try:
                    filename = f'input_{i}.dxf'
                    filepath = os.path.join(temp_dir, filename)
                    urllib.request.urlretrieve(url, filepath)
                    downloaded_files.append(filepath)
                    logger.info(f"Downloaded: {filename}")
                except Exception as e:
                    logger.error(f"Failed to download {url}: {e}")

            if not downloaded_files:
                return jsonify({"error": "No files could be downloaded"}), 400

            # Set environment variables
            env = os.environ.copy()
            env['SHEET_WIDTH'] = str(sheet_width)
            env['SHEET_HEIGHT'] = str(sheet_height)
            env['PART_SPACING'] = str(spacing)
            env['OUTPUT_DIR'] = temp_dir
            env['OUTPUT_NAME'] = 'nested_result'

            # Run nesting script
            cmd = ['python3', '/app/nest.py'] + downloaded_files

            logger.info(f"Running nesting command: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                cwd=temp_dir
            )

            if result.returncode != 0:
                logger.error(f"Nesting process failed: {result.stderr}")
                return jsonify({
                    "error": "Nesting process failed",
                    "details": result.stderr
                }), 500

            # Check for output files
            nested_dxf_path = os.path.join(temp_dir, 'nested_result.dxf')
            results_json_path = os.path.join(temp_dir, 'nesting_results.json')

            # Read results
            if os.path.exists(results_json_path):
                with open(results_json_path, 'r') as f:
                    nesting_info = json.load(f)
                logger.info(f"Nesting results: {nesting_info}")

            if not os.path.exists(nested_dxf_path):
                logger.error("No nested DXF file generated")
                return jsonify({"error": "No nested DXF file generated"}), 500

            # Return the nested DXF file
            logger.info(f"Returning nested DXF file")

            return send_file(
                nested_dxf_path,
                mimetype='application/dxf',
                as_attachment=True,
                download_name='nested.dxf'
            )

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

@app.route('/', methods=['GET'])
def index():
    """Root endpoint with usage information"""
    return jsonify({
        "service": "DXF Nesting API",
        "endpoints": {
            "/nest": {
                "method": "GET", 
                "description": "Nest multiple DXF files onto a sheet",
                "parameters": {
                    "urls": "Comma-separated URLs to DXF files (required)",
                    "sheet_width": "Width of the sheet (optional, default: 1000)",
                    "sheet_height": "Height of the sheet (optional, default: 500)",
                    "spacing": "Spacing between parts (optional, default: 2.0)"
                },
                "example": "/nest?urls=https://example.com/part1.dxf,https://example.com/part2.dxf&sheet_width=1200&sheet_height=600"
            },
            "/health": {
                "method": "GET",
                "description": "Health check endpoint"
            }
        }
    }), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    app.run(host='0.0.0.0', port=port, debug=False)