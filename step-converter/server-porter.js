const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://pynaxyfwywlqfvtjbtuc.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bmF4eWZ3eXdscWZ2dGpidHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwNzYxNiwiZXhwIjoyMDYzNzgzNjE2fQ.2jv211NlxOdDcbtE6GxGl7kg38JxvwWZx1sPz9HtzBg';
const supabase = createClient(supabaseUrl, supabaseKey);

// Porter service URLs
const unfolderServiceUrl = process.env.UNFOLDER_SERVICE_URL || 'http://unfolder:8080';

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
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Supabase upload error:', error);
    throw error;
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

// Helper function to call unfolder service
async function callUnfolderService(stepFilePath, kfactor = '0.38') {
  try {
    const formData = new FormData();
    formData.append('stepfile', fs.createReadStream(stepFilePath));
    formData.append('kfactor', kfactor);
    
    console.log(`Calling unfolder service: ${unfolderServiceUrl}/unfold`);
    
    const response = await axios.post(`${unfolderServiceUrl}/unfold`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 120000, // 2 minutes
      responseType: 'stream'
    });
    
    if (response.status === 200) {
      // Save the returned DXF file
      const outputPath = `./output/unfolded_${Date.now()}.dxf`;
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(outputPath));
        writer.on('error', reject);
      });
    } else {
      throw new Error(`Unfolder service returned status: ${response.status}`);
    }
  } catch (error) {
    console.error('Unfolder service error:', error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    services: {
      unfolder: unfolderServiceUrl
    }
  });
});

// Main conversion endpoint
app.post('/convert', upload.single('stepfile'), async (req, res) => {
  try {
    console.log('Conversion request received');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No STEP file uploaded' });
    }
    
    const inputFile = req.file.path;
    const kfactor = req.body.kfactor || '0.38';
    
    console.log(`Processing file: ${req.file.originalname}, K-factor: ${kfactor}`);
    
    // Call unfolder service
    const dxfPath = await callUnfolderService(inputFile, kfactor);
    
    // Upload DXF to Supabase
    const fileName = `converted_${Date.now()}.dxf`;
    const dxfUrl = await uploadToSupabase(dxfPath, 'dxf-files', fileName);
    
    // Clean up temporary files
    await fs.remove(inputFile);
    await fs.remove(dxfPath);
    
    res.json({
      success: true,
      dxf_url: dxfUrl,
      message: 'Conversion completed successfully'
    });
    
  } catch (error) {
    console.error('Conversion error:', error);
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
          
          // Call unfolder service
          const dxfPath = await callUnfolderService(tempFile, kfactor);
          
          if (dxfPath) {
            // Upload DXF to Supabase
            const fileName = `unfolded_${recordId}_${Date.now()}.dxf`;
            const dxfUrl = await uploadToSupabase(dxfPath, 'dxf-files', fileName);
            
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
            
            // Clean up files
            await fs.remove(dxfPath);
          } else {
            console.error(`❌ No DXF output from unfolder for record ${recordId}`);
          }
          
          // Clean up temp file
          await fs.remove(tempFile);
          
        } catch (processingError) {
          console.error(`Processing error for record ${recordId}:`, processingError);
          await fs.remove(tempFile);
        }
      });
      
      writer.on('error', (error) => {
        console.error(`File download error for record ${recordId}:`, error);
      });
      
    } catch (downloadError) {
      console.error(`Download error for record ${recordId}:`, downloadError);
    }
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// Test Supabase connection
app.get('/test-supabase', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('parts')
      .select('count(*)')
      .limit(1);
      
    if (error) throw error;
    
    res.json({ success: true, message: 'Supabase connection working' });
  } catch (error) {
    res.status(500).json({ error: 'Supabase connection failed', details: error.message });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 STEP Converter API running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🔄 Convert endpoint: POST http://localhost:${port}/convert`);
  console.log(`🪝 Webhook endpoint: POST http://localhost:${port}/webhook/step-file`);
  console.log(`🧪 Test Supabase: GET http://localhost:${port}/test-supabase`);
  console.log(`🏭 Unfolder service: ${unfolderServiceUrl}`);
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