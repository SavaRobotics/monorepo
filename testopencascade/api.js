const express = require('express');
const axios = require('axios');
const app = express();

app.get('/view-stl', async (req, res) => {
  const stlFileUrl = req.query.url || req.headers['stl-url'];
  
  if (!stlFileUrl) {
    return res.status(400).send('Missing stl-url parameter or header');
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STL File Viewer</title>
  <style>
    body { 
      margin: 0; 
      font-family: Arial, sans-serif;
      background: #1a1a1a;
      color: white;
      overflow: hidden;
    }
    #viewer-container {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      padding: 20px;
      border-radius: 5px;
      font-size: 18px;
    }
    #error {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255,0,0,0.8);
      padding: 20px;
      border-radius: 5px;
      display: none;
    }
    #info {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0,0,0,0.7);
      padding: 15px;
      border-radius: 5px;
      font-size: 14px;
    }
    #controls {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      padding: 10px;
      border-radius: 5px;
    }
    button {
      margin: 5px;
      padding: 8px 15px;
      background: #2194ce;
      border: none;
      border-radius: 3px;
      color: white;
      cursor: pointer;
    }
    button:hover {
      background: #1a7fb5;
    }
    #stats {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0,0,0,0.7);
      padding: 10px;
      border-radius: 5px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div id="viewer-container">
    <div id="loading">Loading STL file...</div>
    <div id="error"></div>
    <div id="info" style="display: none;">
      <h3>STL Model Viewer</h3>
      <p>File: <span id="filename"></span></p>
      <p>Controls: Left click + drag to rotate, scroll to zoom, right click + drag to pan</p>
    </div>
    <div id="controls" style="display: none;">
      <button onclick="resetView()">Reset View</button>
      <button onclick="toggleWireframe()">Wireframe</button>
      <button onclick="toggleAxes()">Toggle Axes</button>
      <button onclick="toggleGrid()">Toggle Grid</button>
      <button onclick="changeColor()">Change Color</button>
      <button onclick="autoFit()">Auto Fit</button>
    </div>
    <div id="stats" style="display: none;">
      <p>Vertices: <span id="vertices">0</span></p>
      <p>Triangles: <span id="triangles">0</span></p>
      <p>Bounding Box: <span id="bbox">0x0x0</span></p>
    </div>
  </div>

  <script async src="https://unpkg.com/es-module-shims@1.6.3/dist/es-module-shims.js"></script>
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
      }
    }
  </script>
  
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { STLLoader } from 'three/addons/loaders/STLLoader.js';
    
    let scene, camera, renderer, controls;
    let model, axesHelper, gridHelper;
    let wireframe = false;
    let colorIndex = 0;
    const colors = [0x2194ce, 0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181];
    const stlUrl = '${stlFileUrl}';
    
    function init() {
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      scene.fog = new THREE.Fog(0x1a1a1a, 200, 1000);
      
      // Camera
      camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        10000
      );
      camera.position.set(100, 100, 100);
      
      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      document.getElementById('viewer-container').appendChild(renderer.domElement);
      
      // Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = false;
      controls.minDistance = 10;
      controls.maxDistance = 5000;
      
      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);
      
      const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
      directionalLight1.position.set(100, 100, 50);
      directionalLight1.castShadow = true;
      directionalLight1.shadow.camera.near = 0.1;
      directionalLight1.shadow.camera.far = 500;
      directionalLight1.shadow.mapSize.width = 2048;
      directionalLight1.shadow.mapSize.height = 2048;
      scene.add(directionalLight1);
      
      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
      directionalLight2.position.set(-100, 100, -100);
      scene.add(directionalLight2);
      
      // Helpers
      gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
      scene.add(gridHelper);
      
      axesHelper = new THREE.AxesHelper(75);
      scene.add(axesHelper);
      
      // Handle window resize
      window.addEventListener('resize', onWindowResize);
      
      // Load STL file
      loadSTL();
      
      // Start animation
      animate();
    }
    
    function loadSTL() {
      const loader = new STLLoader();
      const loadingDiv = document.getElementById('loading');
      const errorDiv = document.getElementById('error');
      
      console.log('Loading STL from:', stlUrl);
      
      loader.load(
        stlUrl,
        function (geometry) {
          console.log('STL loaded successfully');
          loadingDiv.style.display = 'none';
          
          // Update filename
          document.getElementById('filename').textContent = stlUrl.split('/').pop();
          
          // Create mesh
          const material = new THREE.MeshPhongMaterial({
            color: colors[colorIndex],
            specular: 0x111111,
            shininess: 200,
            side: THREE.DoubleSide
          });
          
          model = new THREE.Mesh(geometry, material);
          model.castShadow = true;
          model.receiveShadow = true;
          
          // Center the model
          geometry.computeBoundingBox();
          const center = geometry.boundingBox.getCenter(new THREE.Vector3());
          model.position.sub(center);
          
          scene.add(model);
          
          // Update stats
          const vertices = geometry.attributes.position.count;
          const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;
          const size = geometry.boundingBox.getSize(new THREE.Vector3());
          
          document.getElementById('vertices').textContent = vertices.toLocaleString();
          document.getElementById('triangles').textContent = Math.floor(triangles).toLocaleString();
          document.getElementById('bbox').textContent = 
            \`\${size.x.toFixed(1)} x \${size.y.toFixed(1)} x \${size.z.toFixed(1)}\`;
          
          // Auto fit camera
          window.autoFit();
          
          // Show UI
          document.getElementById('info').style.display = 'block';
          document.getElementById('controls').style.display = 'block';
          document.getElementById('stats').style.display = 'block';
          
          // Update grid size based on model
          const maxDim = Math.max(size.x, size.y, size.z);
          scene.remove(gridHelper);
          gridHelper = new THREE.GridHelper(maxDim * 2, 20, 0x444444, 0x222222);
          scene.add(gridHelper);
          
          // Update axes size
          scene.remove(axesHelper);
          axesHelper = new THREE.AxesHelper(maxDim);
          scene.add(axesHelper);
        },
        function (xhr) {
          // Progress callback
          if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            loadingDiv.textContent = \`Loading STL file... \${Math.round(percentComplete)}%\`;
          }
        },
        function (error) {
          // Error callback
          console.error('Error loading STL:', error);
          loadingDiv.style.display = 'none';
          errorDiv.style.display = 'block';
          errorDiv.textContent = 'Error loading STL file: ' + error.message;
        }
      );
    }
    
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    
    // Control functions
    window.resetView = function() {
      camera.position.set(100, 100, 100);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    
    window.toggleWireframe = function() {
      if (model) {
        wireframe = !wireframe;
        model.material.wireframe = wireframe;
      }
    }
    
    window.toggleAxes = function() {
      axesHelper.visible = !axesHelper.visible;
    }
    
    window.toggleGrid = function() {
      gridHelper.visible = !gridHelper.visible;
    }
    
    window.changeColor = function() {
      if (model) {
        colorIndex = (colorIndex + 1) % colors.length;
        model.material.color.setHex(colors[colorIndex]);
      }
    }
    
    window.autoFit = function() {
      if (model) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add some padding
        
        camera.position.set(cameraZ, cameraZ, cameraZ);
        controls.target.copy(center);
        controls.update();
      }
    }
    
    // Initialize
    init();
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

// Keep the STEP endpoint for backward compatibility
app.get('/view-step', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial; padding: 50px;">
        <h1>STEP files require conversion</h1>
        <p>This server now supports STL files directly. Please use the /view-stl endpoint with an STL file URL.</p>
        <p>Example: <code>http://localhost:7892/view-stl?url=YOUR_STL_URL</code></p>
      </body>
    </html>
  `);
});

const PORT = 7892;
app.listen(PORT, () => {
  console.log(`STL viewer server running on port ${PORT}`);
});