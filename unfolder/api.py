#!/usr/bin/env python3
"""
HTTP API wrapper for the unfolder service
Converts STEP files to DXF via HTTP requests
"""

import os
import sys
import tempfile
import shutil
from flask import Flask, request, jsonify, send_file
from werkzeug.utils import secure_filename
import logging

# Add the unfolder code to path
sys.path.append('/app/unfolder_code')

try:
    from unfold_api import convert_step_to_dxf
except ImportError as e:
    print(f"Error importing unfold_api module: {e}")
    sys.exit(1)

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
    Convert STEP file to DXF
    Expects multipart/form-data with:
    - stepfile: STEP file upload
    - kfactor: K-factor value (optional, defaults to 0.38)
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
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save uploaded file
            filename = secure_filename(file.filename)
            step_path = os.path.join(temp_dir, filename)
            file.save(step_path)
            
            # Set output path
            dxf_filename = filename.rsplit('.', 1)[0] + '.dxf'
            dxf_path = os.path.join(temp_dir, dxf_filename)
            
            # Set environment variable for K-factor
            os.environ['K_FACTOR'] = kfactor
            
            # Convert STEP to DXF
            try:
                success = convert_step_to_dxf(step_path, dxf_path)
                
                if success and os.path.exists(dxf_path):
                    logger.info(f"Successfully converted {filename} to DXF")
                    
                    # Return the DXF file
                    return send_file(
                        dxf_path,
                        as_attachment=True,
                        download_name=dxf_filename,
                        mimetype='application/dxf'
                    )
                else:
                    logger.error(f"Conversion failed for {filename}")
                    return jsonify({'error': 'Conversion failed - no DXF output generated'}), 500
                    
            except Exception as conversion_error:
                logger.error(f"Conversion error: {str(conversion_error)}")
                return jsonify({'error': f'Conversion failed: {str(conversion_error)}'}), 500
                
    except Exception as e:
        logger.error(f"Request processing error: {str(e)}")
        return jsonify({'error': f'Request processing failed: {str(e)}'}), 500

@app.route('/convert', methods=['POST'])  
def convert_alias():
    """Alias for /unfold endpoint for compatibility"""
    return unfold_step_file()

@app.route('/', methods=['GET'])
def root():
    """Root endpoint with service info"""
    return jsonify({
        'service': 'Yamuna Unfolder API',
        'version': '1.0.0',
        'endpoints': {
            'health': 'GET /health',
            'unfold': 'POST /unfold',
            'convert': 'POST /convert (alias for /unfold)'
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