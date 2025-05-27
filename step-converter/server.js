const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Supabase configuration
const supabaseUrl = 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './temp_uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/octet-stream' || 
        file.originalname.toLowerCase().endsWith('.step') ||
        file.originalname.toLowerCase().endsWith('.stp')) {
      cb(null, true);
    } else {
      cb(new Error('Only STEP files are allowed'), false);
    }
  }
});

// Create directories
fs.ensureDirSync('./temp_uploads');
fs.ensureDirSync('./output');

// Helper function to upload file to Supabase storage
async function uploadToSupabase(filePath, bucketName, fileName) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: fileName.endsWith('.dxf') ? 'application/dxf' : 'application/octet-stream',
        upsert: true
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    return null;
  }
}

// Helper function to update database record
async function updateDatabaseRecord(recordId, dxfUrl) {
  try {
    const { data, error } = await supabase
      .from('parts')
      .update({ dxf_url: dxfUrl })
      .eq('id', recordId);

    if (error) {
      console.error('Database update error:', error);
      return false;
    }

    console.log(`Updated record ${recordId} with DXF URL: ${dxfUrl}`);
    return true;
  } catch (error) {
    console.error('Database update error:', error);
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main conversion endpoint
app.post('/convert', upload.single('stepfile'), async (req, res) => {
  try {
    console.log('Conversion request received');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No STEP file uploaded' });
    }
    
    const { kfactor = '0.38' } = req.body;
    const inputFile = req.file.path;
    const outputId = Date.now();
    const outputDxf = path.join('./output', `output_${outputId}.dxf`);
    const outputStep = path.join('./output', `unbend_${outputId}.step`);
    
    console.log(`Processing file: ${inputFile} with K-factor: ${kfactor}`);
    
    // Copy input file to yamuna models directory
    const yamunaInput = '/home/ec2-user/yamuna/models/input.step';
    await fs.copy(inputFile, yamunaInput);
    
    // Call Porter unfolder service
    const unfolderUrl = process.env.UNFOLDER_SERVICE_URL || 'http://unfolder:8080';
    
    try {
      // Send STEP file to unfolder service
      const formData = new FormData();
      formData.append('stepfile', fs.createReadStream(inputFile));
      formData.append('kfactor', kfactor);
      
      const unfolderResponse = await axios.post(`${unfolderUrl}/unfold`, formData, {
        headers: formData.getHeaders(),
        timeout: 120000
      });
      
      if (unfolderResponse.status === 200) {
      try {
        if (error) {
          console.error('Docker execution error:', error);
          return res.status(500).json({ error: 'Conversion failed', details: error.message });
        }
        
        console.log('Docker output:', stdout);
        if (stderr) console.log('Docker stderr:', stderr);
        
        // Copy outputs from yamuna to our output directory
        const yamunaDxf = '/home/ec2-user/yamuna/output/largest_face.dxf';
        const yamunaStep = '/home/ec2-user/yamuna/output/unbend_model.step';
        
        if (await fs.pathExists(yamunaDxf)) {
          await fs.copy(yamunaDxf, outputDxf);
        }
        if (await fs.pathExists(yamunaStep)) {
          await fs.copy(yamunaStep, outputStep);
        }
        
        // Cleanup temp input file
        await fs.remove(inputFile);
        
        res.json({
          success: true,
          message: 'Conversion completed successfully',
          outputId: outputId,
          files: {
            dxf: `output_${outputId}.dxf`,
            step: `unbend_${outputId}.step`
          }
        });
        
      } catch (processError) {
        console.error('Process error:', processError);
        res.status(500).json({ error: 'Processing failed', details: processError.message });
      }
    });
    
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Webhook endpoint for Supabase
app.post('/webhook/step-file', async (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    
    const { type, table, record } = req.body;
    
    if (type !== 'INSERT' && type !== 'UPDATE') {
      return res.json({ message: 'Ignored non-insert/update event' });
    }
    
    if (!record || !record.step_url) {
      return res.status(400).json({ error: 'No STEP file URL in webhook data' });
    }
    
    const stepFileUrl = record.step_url;
    const kfactor = record.k_factor || '0.38';
    const recordId = record.id;
    
    console.log(`Processing webhook for record ${recordId}: ${stepFileUrl}`);
    
    // Respond immediately to webhook
    res.json({ message: 'Webhook processing started', recordId: recordId });
    
    try {
      // Download STEP file
      const response = await axios.get(stepFileUrl, { responseType: 'stream' });
      const tempFile = `./temp_uploads/webhook_${recordId}_${Date.now()}.step`;
      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);
      
      writer.on('finish', async () => {
        try {
          console.log(`Downloaded STEP file for record ${recordId}`);
          
          // Copy to yamuna
          const yamunaInput = '/home/ec2-user/yamuna/models/input.step';
          await fs.copy(tempFile, yamunaInput);
          
          // Run conversion
          const dockerCommand = `cd /home/ec2-user/yamuna && docker-compose run -e K_FACTOR=${kfactor} --rm unfolder freecad /app/models/input.step -c /app/src/unfolder/unfold.py`;
          
          exec(dockerCommand, { timeout: 120000 }, async (error, stdout, stderr) => {
            try {
              if (error) {
                console.error('Webhook conversion error:', error);
                return;
              }
              
              console.log(`Conversion completed for record ${recordId}`);
              
              // Check for output files
              const yamunaDxf = '/home/ec2-user/yamuna/output/largest_face.dxf';
              const yamunaStep = '/home/ec2-user/yamuna/output/unbend_model.step';
              
              if (await fs.pathExists(yamunaDxf)) {
                // Upload DXF to Supabase storage
                const dxfFileName = `converted/record_${recordId}_${Date.now()}.dxf`;
                const dxfUrl = await uploadToSupabase(yamunaDxf, 'dxffiles', dxfFileName);
                
                if (dxfUrl) {
                  // Update database record with DXF URL
                  const updateSuccess = await updateDatabaseRecord(recordId, dxfUrl);
                  
                  if (updateSuccess) {
                    console.log(`✅ Successfully processed record ${recordId}`);
                    console.log(`DXF URL: ${dxfUrl}`);
                  } else {
                    console.error(`❌ Failed to update database for record ${recordId}`);
                  }
                } else {
                  console.error(`❌ Failed to upload DXF for record ${recordId}`);
                }
              } else {
                console.error(`❌ No DXF output found for record ${recordId}`);
              }
              
              // Cleanup temp file
              await fs.remove(tempFile);
              
            } catch (processError) {
              console.error('Webhook process error:', processError);
            }
          });
          
        } catch (processError) {
          console.error('Webhook file process error:', processError);
        }
      });
      
      writer.on('error', (error) => {
        console.error('File download error:', error);
      });
      
    } catch (downloadError) {
      console.error('Download error:', downloadError);
    }
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// Download endpoint for output files
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join('./output', filename);
  
  if (fs.pathExistsSync(filepath)) {
    res.download(filepath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Test Supabase connection endpoint
app.get('/test-supabase', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('parts')
      .select('id, step_url, dxf_url')
      .limit(1);
    
    if (error) {
      return res.status(500).json({ error: 'Supabase connection failed', details: error });
    }
    
    res.json({ 
      success: true, 
      message: 'Supabase connection working',
      sampleData: data 
    });
  } catch (error) {
    res.status(500).json({ error: 'Supabase test failed', details: error.message });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`STEP Converter API running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Convert endpoint: POST http://localhost:${port}/convert`);
  console.log(`Webhook endpoint: POST http://localhost:${port}/webhook/step-file`);
  console.log(`Test Supabase: GET http://localhost:${port}/test-supabase`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});