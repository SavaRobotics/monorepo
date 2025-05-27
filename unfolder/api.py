#!/usr/bin/env python3
"""
Simple HTTP API wrapper for the working unfolder service
Uses the proven FreeCAD approach that actually works
"""

import os
import sys
import tempfile
import shutil
import subprocess
import requests
import json
from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import logging

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def allowed_file(filename):
    """Check if file has allowed extension"""
    allowed_extensions = {'step', 'stp'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'OK',
        'service': 'unfolder',
        'timestamp': str(os.popen('date').read().strip())
    })

@app.route('/unfold', methods=['POST'])
def unfold_step_file():
    """
    Convert STEP file to DXF using the working FreeCAD approach
    """
    try:
        # Check if file is present
        if 'stepfile' not in request.files:
            return jsonify({'error': 'No stepfile provided'}), 400
        
        file = request.files['stepfile']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Only STEP files allowed.'}), 400
        
        # Get K-factor
        kfactor = request.form.get('kfactor', '0.38')
        try:
            kfactor_float = float(kfactor)
            if not (0.1 <= kfactor_float <= 1.0):
                return jsonify({'error': 'K-factor must be between 0.1 and 1.0'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid K-factor value'}), 400
        
        logger.info(f"Processing file: {file.filename}, K-factor: {kfactor}")
        
        # Create temporary directories
        with tempfile.TemporaryDirectory() as temp_dir:
            input_dir = os.path.join(temp_dir, 'input')
            output_dir = os.path.join(temp_dir, 'output')
            os.makedirs(input_dir)
            os.makedirs(output_dir)
            
            # Save uploaded file
            filename = secure_filename(file.filename)
            step_path = os.path.join(input_dir, filename)
            file.save(step_path)
            
            logger.info(f"Saved STEP file: {step_path}")
            
            # Set environment variables
            env = os.environ.copy()
            env['K_FACTOR'] = str(kfactor)
            env['OUTPUT_DIR'] = output_dir
            env['DISPLAY'] = ':99'
            
            # Start virtual display (FreeCAD needs this)
            xvfb_proc = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1024x768x24'], 
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            try:
                # Check if script exists
                script_path = '/app/src/unfolder/unfold.py'
                logger.info(f"Script exists at {script_path}: {os.path.exists(script_path)}")
                if os.path.exists(script_path):
                    with open(script_path, 'r') as f:
                        first_line = f.readline().strip()
                        logger.info(f"First line of script: {first_line}")
                
                # Use the working FreeCAD approach
                cmd = [
                    'freecad', 
                    step_path, 
                    '-c', script_path
                ]
                
                logger.info(f"Running FreeCAD: {' '.join(cmd)}")
                
                # Run FreeCAD with mounted input/output
                result = subprocess.run(
                    cmd,
                    env=env,
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                logger.info(f"FreeCAD exit code: {result.returncode}")
                if result.stdout:
                    logger.info(f"FreeCAD stdout: {result.stdout}")
                if result.stderr:
                    logger.info(f"FreeCAD stderr: {result.stderr}")
                
                # Check for output DXF file
                dxf_path = os.path.join(output_dir, 'largest_face.dxf')
                
                if result.returncode == 0 and os.path.exists(dxf_path):
                    logger.info(f"Successfully converted {filename} to DXF")
                    
                    # Return the DXF file
                    dxf_filename = filename.rsplit('.', 1)[0] + '.dxf'
                    return send_file(
                        dxf_path,
                        as_attachment=True,
                        download_name=dxf_filename,
                        mimetype='application/dxf'
                    )
                else:
                    logger.error(f"Conversion failed. Return code: {result.returncode}")
                    logger.error(f"Expected DXF at: {dxf_path}")
                    logger.error(f"DXF exists: {os.path.exists(dxf_path)}")
                    return jsonify({
                        'error': 'Conversion failed',
                        'details': result.stderr if result.stderr else 'No DXF output generated'
                    }), 500
                    
            finally:
                # Clean up virtual display
                xvfb_proc.terminate()
                
    except Exception as e:
        logger.error(f"Request processing error: {str(e)}")
        return jsonify({'error': f'Request processing failed: {str(e)}'}), 500

@app.route('/webhook/step-file', methods=['POST'])
def webhook_step_file():
    """
    Webhook endpoint to handle Supabase triggers
    Downloads STEP file, converts to DXF, uploads back to Supabase
    """
    try:
        # Parse webhook payload
        data = request.get_json()
        if not data or 'record' not in data:
            return jsonify({'error': 'Invalid webhook payload'}), 400
        
        record = data['record']
        step_url = record.get('step_url')
        part_id = record.get('id')
        
        if not step_url or not part_id:
            return jsonify({'error': 'Missing step_url or id in record'}), 400
        
        logger.info(f"Processing webhook for part {part_id}, step_url: {step_url}")
        
        # Download STEP file
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                # Download the STEP file
                response = requests.get(step_url, timeout=30)
                response.raise_for_status()
                
                # Save to temp file
                step_filename = f"part_{part_id}.step"
                step_path = os.path.join(temp_dir, step_filename)
                
                with open(step_path, 'wb') as f:
                    f.write(response.content)
                
                logger.info(f"Downloaded STEP file: {step_filename}")
                
                # Convert using direct FreeCAD approach (same as unfold endpoint)
                logger.info(f"Starting conversion: {step_path}")
                
                # Create output directory
                input_dir = os.path.join(temp_dir, 'input')
                output_dir = os.path.join(temp_dir, 'output')
                os.makedirs(input_dir, exist_ok=True)
                os.makedirs(output_dir, exist_ok=True)
                
                # Set environment variables
                env = os.environ.copy()
                env['K_FACTOR'] = os.environ.get('K_FACTOR', '0.38')
                env['OUTPUT_DIR'] = output_dir
                env['DISPLAY'] = ':99'
                
                # Start virtual display (FreeCAD needs this)
                xvfb_proc = subprocess.Popen(['Xvfb', ':99', '-screen', '0', '1024x768x24'], 
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                try:
                    
                    # Check if script exists
                    script_path = '/app/src/unfolder/unfold.py'
                    logger.info(f"Script exists at {script_path}: {os.path.exists(script_path)}")
                    if os.path.exists(script_path):
                        with open(script_path, 'r') as f:
                            first_line = f.readline().strip()
                            logger.info(f"First line of script: {first_line}")
                    
                    # Use the working FreeCAD approach
                    cmd = [
                        'freecad', 
                        step_path, 
                        '-c', script_path
                    ]
                    
                    logger.info(f"Running FreeCAD: {' '.join(cmd)}")
                    
                    # Run FreeCAD with mounted input/output
                    result = subprocess.run(
                        cmd,
                        env=env,
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    logger.info(f"FreeCAD exit code: {result.returncode}")
                    if result.stdout:
                        logger.info(f"FreeCAD stdout: {result.stdout}")
                    if result.stderr:
                        logger.error(f"FreeCAD stderr: {result.stderr}")
                    else:
                        logger.info("FreeCAD stderr: (empty)")
                    
                    # Check for output DXF file
                    dxf_path = os.path.join(output_dir, 'largest_face.dxf')
                    
                    if result.returncode == 0 and os.path.exists(dxf_path):
                        logger.info(f"Successfully converted part {part_id} to DXF")
                        dxf_filename = f"part_{part_id}.dxf"
                    else:
                        logger.error(f"Conversion failed. Return code: {result.returncode}")
                        logger.error(f"Expected DXF at: {dxf_path}")
                        logger.error(f"DXF exists: {os.path.exists(dxf_path)}")
                        return jsonify({
                            'error': 'Conversion failed',
                            'details': result.stderr if result.stderr else 'No DXF output generated'
                        }), 500
                        
                finally:
                    # Clean up virtual display
                    xvfb_proc.terminate()
                
                # Upload DXF to Supabase Storage
                supabase_url = os.environ.get('SUPABASE_URL')
                supabase_key = os.environ.get('SUPABASE_KEY')
                
                if not supabase_url or not supabase_key:
                    return jsonify({'error': 'Missing Supabase configuration'}), 500
                
                # Upload to Supabase storage
                storage_url = f"{supabase_url}/storage/v1/object/dxf-files/{dxf_filename}"
                
                with open(dxf_path, 'rb') as f:
                    files_upload = {'file': (dxf_filename, f, 'application/dxf')}
                    headers = {
                        'Authorization': f'Bearer {supabase_key}',
                    }
                    
                    upload_response = requests.post(storage_url, files=files_upload, headers=headers, timeout=30)
                    upload_response.raise_for_status()
                
                # Get public URL for the uploaded DXF
                dxf_url = f"{supabase_url}/storage/v1/object/public/dxf-files/{dxf_filename}"
                
                # Update the parts record with DXF URL
                update_url = f"{supabase_url}/rest/v1/parts"
                update_headers = {
                    'Authorization': f'Bearer {supabase_key}',
                    'Content-Type': 'application/json',
                    'apikey': supabase_key
                }
                update_data = {'dxf_url': dxf_url}
                update_params = {'id': f'eq.{part_id}'}
                
                update_response = requests.patch(
                    update_url, 
                    json=update_data, 
                    headers=update_headers, 
                    params=update_params,
                    timeout=30
                )
                update_response.raise_for_status()
                
                logger.info(f"Updated part {part_id} with DXF URL: {dxf_url}")
                
                return jsonify({
                    'success': True,
                    'part_id': part_id,
                    'dxf_url': dxf_url,
                    'message': 'STEP file successfully converted and uploaded'
                })
                    
            except requests.RequestException as e:
                logger.error(f"Download/upload error for part {part_id}: {str(e)}")
                return jsonify({'error': f'Network error: {str(e)}'}), 500
            except Exception as e:
                logger.error(f"Processing error for part {part_id}: {str(e)}")
                return jsonify({'error': f'Processing failed: {str(e)}'}), 500
        
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return jsonify({'error': f'Webhook processing failed: {str(e)}'}), 500

@app.route('/convert', methods=['POST'])  
def convert_alias():
    """Alias for /unfold endpoint for compatibility"""
    return unfold_step_file()

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with service info"""
    return jsonify({
        'service': 'Yamuna Unfolder API (Working Version)',
        'version': '2.0.0',
        'endpoints': {
            'health': 'GET /health',
            'unfold': 'POST /unfold',
            'convert': 'POST /convert (alias for /unfold)',
            'webhook': 'POST /webhook/step-file'
        },
        'usage': {
            'method': 'POST',
            'endpoint': '/unfold',
            'content_type': 'multipart/form-data',
            'fields': {
                'stepfile': 'STEP file upload (required)',
                'kfactor': 'K-factor value 0.1-1.0 (optional, default: 0.38)'
            }
        }
    })

if __name__ == '__main__':
    # Create required directories
    os.makedirs('/app/input', exist_ok=True)
    os.makedirs('/app/output', exist_ok=True)
    
    # Start the Flask server
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"Starting Unfolder API server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)