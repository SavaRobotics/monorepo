import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const TEST_STEP_FILE = path.join(__dirname, 'test.step');
const OUTPUT_DIR = path.join(__dirname, 'output');
const K_FACTOR = '0.38';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Check if test.step exists
if (!fs.existsSync(TEST_STEP_FILE)) {
  console.error(`Error: ${TEST_STEP_FILE} not found. Please add a test.step file to the brain directory.`);
  process.exit(1);
}

console.log('=== Unfolder Test Starting ===');
console.log(`Input file: ${TEST_STEP_FILE}`);
console.log(`Output directory: ${OUTPUT_DIR}`);
console.log(`K-factor: ${K_FACTOR}`);

// Set up environment variables
const env = {
  ...process.env,
  K_FACTOR: K_FACTOR,
  OUTPUT_DIR: OUTPUT_DIR,
  PYTHONPATH: '/app'
};

// Construct the FreeCAD command
const freecadCommand = 'freecad';
// The unfold.py script is now in brain/src/mcp_servers/unfolder/src/unfolder/
const scriptPath = path.join(__dirname, 'src', 'mcp_servers', 'unfolder', 'src', 'unfolder', 'unfold.py');
const args = [TEST_STEP_FILE, '-c', scriptPath];

console.log(`\nRunning command: ${freecadCommand} ${args.join(' ')}`);

// Spawn the FreeCAD process
const freecadProcess = spawn(freecadCommand, args, {
  env: env,
  cwd: __dirname
});

// Collect output
let stdout = '';
let stderr = '';

freecadProcess.stdout.on('data', (data) => {
  const output = data.toString();
  stdout += output;
  console.log('[STDOUT]:', output.trim());
});

freecadProcess.stderr.on('data', (data) => {
  const output = data.toString();
  stderr += output;
  console.error('[STDERR]:', output.trim());
});

// Handle process completion
freecadProcess.on('close', (code) => {
  console.log(`\nFreeCAD process exited with code: ${code}`);
  
  // Check for expected output file
  const expectedDxfPath = path.join(OUTPUT_DIR, 'largest_face.dxf');
  
  if (code === 0 && fs.existsSync(expectedDxfPath)) {
    console.log(`\n✅ Success! DXF file created at: ${expectedDxfPath}`);
    
    // Show file stats
    const stats = fs.statSync(expectedDxfPath);
    console.log(`   File size: ${stats.size} bytes`);
    console.log(`   Created: ${stats.birthtime}`);
    
    // Optionally show first few lines of DXF
    const dxfContent = fs.readFileSync(expectedDxfPath, 'utf8');
    const lines = dxfContent.split('\n').slice(0, 10);
    console.log('\n   First 10 lines of DXF:');
    lines.forEach((line, i) => console.log(`   ${i + 1}: ${line}`));
  } else {
    console.error(`\n❌ Failed to create DXF file`);
    console.error(`   Expected file at: ${expectedDxfPath}`);
    console.error(`   File exists: ${fs.existsSync(expectedDxfPath)}`);
    
    // List files in output directory
    console.log('\n   Files in output directory:');
    if (fs.existsSync(OUTPUT_DIR)) {
      const files = fs.readdirSync(OUTPUT_DIR);
      files.forEach(file => console.log(`   - ${file}`));
    }
  }
  
  // Clean up if needed
  process.exit(code || 0);
});

// Handle errors
freecadProcess.on('error', (error) => {
  console.error('Failed to start FreeCAD process:', error);
  console.error('\nMake sure FreeCAD is installed and available in PATH');
  console.error('You might need to run this inside the Docker container');
  process.exit(1);
});