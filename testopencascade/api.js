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

app.get('/view-dxf', async (req, res) => {
  const dxfFileUrl = req.query.url || req.headers['dxf-url'];
  
  if (!dxfFileUrl) {
    return res.status(400).send('Missing dxf-url parameter or header');
  }

  // Fetch DXF file content
  let dxfContent;
  try {
    const response = await axios.get(dxfFileUrl);
    dxfContent = response.data;
  } catch (error) {
    return res.status(500).send('Failed to fetch DXF file: ' + error.message);
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DXF File Viewer</title>
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
    <div id="loading">Loading DXF file...</div>
    <div id="error"></div>
    <div id="info" style="display: none;">
      <h3>DXF Model Viewer</h3>
      <p>File: <span id="filename"></span></p>
      <p>Controls: Left click + drag to rotate, scroll to zoom, right click + drag to pan</p>
    </div>
    <div id="controls" style="display: none;">
      <button onclick="resetView()">Reset View</button>
      <button onclick="toggleGrid()">Toggle Grid</button>
      <button onclick="changeColor()">Change Color</button>
      <button onclick="autoFit()">Auto Fit</button>
      <button onclick="toggle2D3D()">Toggle 2D/3D</button>
    </div>
    <div id="stats" style="display: none;">
      <p>Entities: <span id="entities">0</span></p>
      <p>Layers: <span id="layers">0</span></p>
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
    
    let scene, camera, renderer, controls;
    let dxfGroup, gridHelper;
    let colorIndex = 4; // Changed from 0 to 4 for pink (0xff00ff)
    let is3D = true;
    const colors = [0x00ff00, 0xff0000, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    const dxfContent = \`${dxfContent.replace(/`/g, '\\`')}\`;
    
    function init() {
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      
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
      document.getElementById('viewer-container').appendChild(renderer.domElement);
      
      // Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      
      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(100, 100, 50);
      scene.add(directionalLight);
      
      // Grid (hidden by default)
      gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
      gridHelper.visible = false;
      scene.add(gridHelper);
      
      // Handle window resize
      window.addEventListener('resize', onWindowResize);
      
      // Parse and display DXF
      parseDXF();
      
      // Start animation
      animate();
    }
    
    // Simple DXF parser
    function parseDXFContent(content) {
      const lines = content.split(/\\r\\n|\\n|\\r/);
      const entities = [];
      let i = 0;
      
      while (i < lines.length) {
        if (lines[i].trim() === 'ENTITIES') {
          i++;
          while (i < lines.length && lines[i].trim() !== 'ENDSEC') {
            if (lines[i].trim() === '0' && i + 1 < lines.length) {
              const entityType = lines[i + 1].trim();
              const entity = { type: entityType };
              i += 2;
              
              // Read entity data
              let currentVertex = null;
              while (i < lines.length && lines[i].trim() !== '0') {
                const code = parseInt(lines[i].trim());
                const value = lines[i + 1] ? lines[i + 1].trim() : '';
                
                switch (code) {
                  case 10: // X coordinate
                    if (entityType === 'LWPOLYLINE') {
                      // For LWPOLYLINE, each 10 starts a new vertex
                      if (!entity.vertices) entity.vertices = [];
                      currentVertex = { x: parseFloat(value) };
                      entity.vertices.push(currentVertex);
                    } else {
                      if (!entity.vertices) entity.vertices = [];
                      if (!entity.vertices[0]) entity.vertices[0] = {};
                      entity.vertices[0].x = parseFloat(value);
                    }
                    break;
                  case 20: // Y coordinate
                    if (entityType === 'LWPOLYLINE' && currentVertex) {
                      currentVertex.y = parseFloat(value);
                    } else {
                      if (!entity.vertices) entity.vertices = [];
                      if (!entity.vertices[0]) entity.vertices[0] = {};
                      entity.vertices[0].y = parseFloat(value);
                    }
                    break;
                  case 30: // Z coordinate
                    if (entityType === 'LWPOLYLINE' && currentVertex) {
                      currentVertex.z = parseFloat(value);
                    } else {
                      if (!entity.vertices) entity.vertices = [];
                      if (!entity.vertices[0]) entity.vertices[0] = {};
                      entity.vertices[0].z = parseFloat(value);
                    }
                    break;
                  case 11: // X2 coordinate (for lines)
                    if (!entity.vertices) entity.vertices = [];
                    if (!entity.vertices[1]) entity.vertices[1] = {};
                    entity.vertices[1].x = parseFloat(value);
                    break;
                  case 21: // Y2 coordinate
                    if (!entity.vertices) entity.vertices = [];
                    if (!entity.vertices[1]) entity.vertices[1] = {};
                    entity.vertices[1].y = parseFloat(value);
                    break;
                  case 31: // Z2 coordinate
                    if (!entity.vertices) entity.vertices = [];
                    if (!entity.vertices[1]) entity.vertices[1] = {};
                    entity.vertices[1].z = parseFloat(value);
                    break;
                  case 40: // Radius
                    entity.radius = parseFloat(value);
                    break;
                  case 50: // Start angle
                    entity.startAngle = parseFloat(value) * Math.PI / 180;
                    break;
                  case 51: // End angle
                    entity.endAngle = parseFloat(value) * Math.PI / 180;
                    break;
                  case 70: // Flags (polyline closed = 1)
                    if (value === '1') entity.shape = true;
                    break;
                  case 8: // Layer
                    entity.layer = value;
                    break;
                  case 62: // Color
                    entity.color = parseInt(value);
                    break;
                }
                i += 2;
              }
              
              // For circles and arcs, set center from first vertex
              if ((entityType === 'CIRCLE' || entityType === 'ARC') && entity.vertices && entity.vertices[0]) {
                entity.center = entity.vertices[0];
                delete entity.vertices;
              }
              
              entities.push(entity);
            } else {
              i++;
            }
          }
          break;
        }
        i++;
      }
      
      return { entities, tables: {} };
    }
    
    function parseDXF() {
      const loadingDiv = document.getElementById('loading');
      const errorDiv = document.getElementById('error');
      
      try {
        // Using simple DXF parser
        console.log('Parsing DXF content...');
        const dxf = parseDXFContent(dxfContent);
        
        if (!dxf) {
          throw new Error('Failed to parse DXF file');
        }
        
        console.log('DXF parsed:', dxf);
        
        // Update filename
        document.getElementById('filename').textContent = '${dxfFileUrl}'.split('/').pop();
        
        // Create group for DXF entities
        dxfGroup = new THREE.Group();
        
        let entityCount = 0;
        const bounds = new THREE.Box3();
        
        // Process entities
        if (dxf.entities) {
          dxf.entities.forEach(entity => {
            entityCount++;
            const objects = createEntityObject(entity, dxf);
            if (objects) {
              if (Array.isArray(objects)) {
                objects.forEach(obj => {
                  dxfGroup.add(obj);
                  bounds.expandByObject(obj);
                });
              } else {
                dxfGroup.add(objects);
                bounds.expandByObject(objects);
              }
            }
          });
        }
        
        scene.add(dxfGroup);
        
        // Update stats
        const layerCount = dxf.tables && dxf.tables.layers ? Object.keys(dxf.tables.layers).length : 0;
        document.getElementById('entities').textContent = entityCount.toLocaleString();
        document.getElementById('layers').textContent = layerCount.toLocaleString();
        
        if (bounds.isEmpty()) {
          bounds.setFromPoints([new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 0)]);
        }
        
        const size = bounds.getSize(new THREE.Vector3());
        document.getElementById('bbox').textContent = 
          \`\${size.x.toFixed(1)} x \${size.y.toFixed(1)} x \${size.z.toFixed(1)}\`;
        
        // Update grid size
        const maxDim = Math.max(size.x, size.y) * 2;
        scene.remove(gridHelper);
        gridHelper = new THREE.GridHelper(maxDim, 20, 0x444444, 0x222222);
        gridHelper.visible = false; // Keep grid hidden by default
        scene.add(gridHelper);
        
        // Auto fit camera
        window.autoFit();
        
        // Apply 3D effect by default
        if (is3D && dxfGroup) {
          const toAdd = [];
          dxfGroup.traverse((child) => {
            if (child.geometry && (child.type === 'Line' || child.type === 'LineLoop')) {
              // Create vertical lines at each vertex for 3D effect
              const positions = child.geometry.attributes.position.array;
              for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                const z = positions[i + 2];
                
                const vertGeom = new THREE.BufferGeometry();
                vertGeom.setFromPoints([
                  new THREE.Vector3(x, y, z),
                  new THREE.Vector3(x, y, z + 10)
                ]);
                const vertLine = new THREE.Line(vertGeom, child.material.clone());
                vertLine.userData.is3DEffect = true;
                toAdd.push(vertLine);
              }
              
              // Create top copy
              const topCopy = child.clone();
              topCopy.position.z = 10;
              topCopy.userData.is3DEffect = true;
              toAdd.push(topCopy);
            }
          });
          toAdd.forEach(obj => dxfGroup.add(obj));
        }
        
        loadingDiv.style.display = 'none';
        document.getElementById('info').style.display = 'block';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('stats').style.display = 'block';
        
        // Force a color refresh to handle nested DXF visibility issues
        setTimeout(() => {
          window.changeColor();
        }, 100);
        
      } catch (error) {
        console.error('Error parsing DXF:', error);
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Error parsing DXF file: ' + error.message;
      }
    }
    
    function createEntityObject(entity, dxf) {
      const material = new THREE.LineBasicMaterial({ 
        color: getEntityColor(entity, dxf),
        linewidth: 2
      });
      
      switch (entity.type) {
        case 'LINE':
          return createLine(entity, material);
        case 'LWPOLYLINE':
        case 'POLYLINE':
          return createPolyline(entity, material);
        case 'CIRCLE':
          return createCircle(entity, material);
        case 'ARC':
          return createArc(entity, material);
        case 'ELLIPSE':
          return createEllipse(entity, material);
        case 'SPLINE':
          return createSpline(entity, material);
        case 'POINT':
          return createPoint(entity);
        case 'TEXT':
        case 'MTEXT':
          return null; // Skip text for now
        default:
          console.warn('Unsupported entity type:', entity.type);
          return null;
      }
    }
    
    function getEntityColor(entity, dxf) {
      // Get color from entity or layer
      if (entity.color) {
        return entity.color;
      }
      
      if (entity.layer && dxf.tables && dxf.tables.layers) {
        const layer = dxf.tables.layers[entity.layer];
        if (layer && layer.color) {
          return layer.color;
        }
      }
      
      return colors[colorIndex]; // Default color
    }
    
    function createLine(entity, material) {
      const geometry = new THREE.BufferGeometry();
      const points = [
        new THREE.Vector3(entity.vertices[0].x, entity.vertices[0].y, entity.vertices[0].z || 0),
        new THREE.Vector3(entity.vertices[1].x, entity.vertices[1].y, entity.vertices[1].z || 0)
      ];
      geometry.setFromPoints(points);
      return new THREE.Line(geometry, material);
    }
    
    function createPolyline(entity, material) {
      const points = entity.vertices.map(v => 
        new THREE.Vector3(v.x, v.y, v.z || 0)
      );
      
      if (entity.shape) { // closed polyline
        points.push(points[0]);
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      return new THREE.Line(geometry, material);
    }
    
    function createCircle(entity, material) {
      const curve = new THREE.EllipseCurve(
        entity.center.x, entity.center.y,
        entity.radius, entity.radius,
        0, 2 * Math.PI,
        false,
        0
      );
      
      const points = curve.getPoints(64);
      const points3D = points.map(p => new THREE.Vector3(p.x, p.y, entity.center.z || 0));
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
      return new THREE.LineLoop(geometry, material);
    }
    
    function createArc(entity, material) {
      const startAngle = entity.startAngle || 0;
      const endAngle = entity.endAngle || Math.PI * 2;
      
      const curve = new THREE.EllipseCurve(
        entity.center.x, entity.center.y,
        entity.radius, entity.radius,
        startAngle, endAngle,
        false,
        0
      );
      
      const points = curve.getPoints(64);
      const points3D = points.map(p => new THREE.Vector3(p.x, p.y, entity.center.z || 0));
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
      return new THREE.Line(geometry, material);
    }
    
    function createEllipse(entity, material) {
      const curve = new THREE.EllipseCurve(
        entity.center.x, entity.center.y,
        entity.majorAxisEndPoint.x, entity.minorRadius || entity.majorAxisEndPoint.x * entity.axisRatio,
        entity.startAngle || 0, entity.endAngle || 2 * Math.PI,
        false,
        0
      );
      
      const points = curve.getPoints(64);
      const points3D = points.map(p => new THREE.Vector3(p.x, p.y, entity.center.z || 0));
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
      return new THREE.Line(geometry, material);
    }
    
    function createSpline(entity, material) {
      if (!entity.controlPoints || entity.controlPoints.length < 2) return null;
      
      const points = entity.controlPoints.map(p => 
        new THREE.Vector3(p.x, p.y, p.z || 0)
      );
      
      const curve = new THREE.CatmullRomCurve3(points);
      const curvePoints = curve.getPoints(50);
      
      const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      return new THREE.Line(geometry, material);
    }
    
    function createPoint(entity) {
      const geometry = new THREE.SphereGeometry(0.5, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(entity.position.x, entity.position.y, entity.position.z || 0);
      return mesh;
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
    
    window.toggleGrid = function() {
      gridHelper.visible = !gridHelper.visible;
    }
    
    window.changeColor = function() {
      if (dxfGroup) {
        colorIndex = (colorIndex + 1) % colors.length;
        dxfGroup.traverse((child) => {
          if (child.material) {
            child.material.color.setHex(colors[colorIndex]);
          }
        });
      }
    }
    
    window.autoFit = function() {
      if (dxfGroup) {
        const box = new THREE.Box3().setFromObject(dxfGroup);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5;
        
        camera.position.set(center.x + cameraZ, center.y + cameraZ, cameraZ);
        controls.target.copy(center);
        controls.update();
      }
    }
    
    window.toggle2D3D = function() {
      is3D = !is3D;
      if (is3D) {
        // Add 3D effect
        if (dxfGroup) {
          const toAdd = [];
          dxfGroup.traverse((child) => {
            if (child.geometry && child.position.z === 0 && (child.type === 'Line' || child.type === 'LineLoop')) {
              // Create vertical lines at each vertex for 3D effect
              const positions = child.geometry.attributes.position.array;
              for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                const z = positions[i + 2];
                
                const vertGeom = new THREE.BufferGeometry();
                vertGeom.setFromPoints([
                  new THREE.Vector3(x, y, z),
                  new THREE.Vector3(x, y, z + 10)
                ]);
                const vertLine = new THREE.Line(vertGeom, child.material.clone());
                vertLine.userData.is3DEffect = true;
                toAdd.push(vertLine);
              }
              
              // Create top copy
              const topCopy = child.clone();
              topCopy.position.z = 10;
              topCopy.userData.is3DEffect = true;
              toAdd.push(topCopy);
            }
          });
          toAdd.forEach(obj => dxfGroup.add(obj));
        }
      } else {
        // Remove 3D effect objects
        const toRemove = [];
        dxfGroup.traverse((child) => {
          if (child.userData.is3DEffect || child.position.z > 0) {
            toRemove.push(child);
          }
        });
        toRemove.forEach(child => dxfGroup.remove(child));
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

app.get('/view-gcode', async (req, res) => {
  const gcodeFileUrl = req.query.url || req.headers['gcode-url'];
  
  if (!gcodeFileUrl) {
    return res.status(400).send('Missing gcode-url parameter or header');
  }

  // Fetch G-code file content
  let gcodeContent;
  try {
    const response = await axios.get(gcodeFileUrl);
    gcodeContent = response.data;
  } catch (error) {
    return res.status(500).send('Failed to fetch G-code file: ' + error.message);
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>G-code Viewer</title>
  <style>
    body { 
      margin: 0; 
      font-family: Arial, sans-serif;
      background: #0a0a0a;
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
    button.active {
      background: #4CAF50;
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
    #layer-control {
      position: absolute;
      bottom: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      padding: 10px;
      border-radius: 5px;
    }
    #layer-slider {
      width: 200px;
      margin: 0 10px;
    }
    .control-group {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }
    .control-group label {
      margin-right: 10px;
      min-width: 80px;
    }
  </style>
</head>
<body>
  <div id="viewer-container">
    <div id="loading">Loading G-code file...</div>
    <div id="error"></div>
    <div id="info" style="display: none;">
      <h3>G-code Viewer</h3>
      <p>File: <span id="filename"></span></p>
      <p>Controls: Left click + drag to rotate, scroll to zoom, right click + drag to pan</p>
    </div>
    <div id="controls" style="display: none;">
      <button onclick="resetView()">Reset View</button>
      <button onclick="toggleTravelMoves()" id="travel-btn" class="active">Travel Moves</button>
      <button onclick="toggleColorMode()">Color Mode: <span id="color-mode">Layer</span></button>
      <button onclick="autoFit()">Auto Fit</button>
      <button onclick="toggleAnimation()" id="animate-btn">Animate</button>
    </div>
    <div id="stats" style="display: none;">
      <p>Total Moves: <span id="moves">0</span></p>
      <p>Layers: <span id="layers">0</span></p>
      <p>Total Distance: <span id="distance">0</span> mm</p>
      <p>Extrusion Distance: <span id="extrusion">0</span> mm</p>
      <p>Build Volume: <span id="volume">0x0x0</span> mm</p>
      <p>Est. Time: <span id="time">0</span> min</p>
    </div>
    <div id="layer-control" style="display: none;">
      <div class="control-group">
        <label>Layer:</label>
        <input type="range" id="layer-slider" min="0" max="100" value="100" oninput="updateLayer(this.value)">
        <span id="layer-number">All</span>
      </div>
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
    
    let scene, camera, renderer, controls;
    let toolpathGroup, travelGroup, currentLayerGroup;
    let gcodeData = { moves: [], layers: new Map(), bounds: { min: {x: 0, y: 0, z: 0}, max: {x: 0, y: 0, z: 0} }, stats: {} };
    let showTravelMoves = true;
    let colorMode = 'layer'; // layer, speed, type
    let animating = false;
    let animationIndex = 0;
    let maxLayer = 0;
    let currentLayer = -1; // -1 means show all
    
    const gcodeContent = \`${gcodeContent.replace(/`/g, '\\`')}\`;
    
    function init() {
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0a);
      
      // Camera
      camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        10000
      );
      camera.position.set(200, 200, 200);
      
      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      document.getElementById('viewer-container').appendChild(renderer.domElement);
      
      // Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      
      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
      directionalLight.position.set(100, 100, 50);
      scene.add(directionalLight);
      
      // Grid
      const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
      scene.add(gridHelper);
      
      // Build plate
      const plateGeometry = new THREE.BoxGeometry(200, 1, 200);
      const plateMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x333333, 
        transparent: true, 
        opacity: 0.5 
      });
      const plate = new THREE.Mesh(plateGeometry, plateMaterial);
      plate.position.y = -0.5;
      scene.add(plate);
      
      // Groups for organizing geometry
      toolpathGroup = new THREE.Group();
      travelGroup = new THREE.Group();
      currentLayerGroup = new THREE.Group();
      scene.add(toolpathGroup);
      scene.add(travelGroup);
      scene.add(currentLayerGroup);
      
      // Handle window resize
      window.addEventListener('resize', onWindowResize);
      
      // Parse and display G-code
      parseGCode();
      
      // Start animation
      animate();
    }
    
    function parseGCode() {
      const loadingDiv = document.getElementById('loading');
      const errorDiv = document.getElementById('error');
      
      try {
        console.log('Parsing G-code...');
        const lines = gcodeContent.split(/\\r\\n|\\n|\\r/);
        
        let currentPos = { x: 0, y: 0, z: 0, e: 0, f: 0 };
        let absoluteMode = true;
        let previousPos = { ...currentPos };
        let currentLayerZ = 0;
        let layerCount = 0;
        let totalDistance = 0;
        let extrusionDistance = 0;
        let travelDistance = 0;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith(';')) continue;
          
          // Remove comments
          const parts = line.split(';')[0].trim().split(' ');
          if (!parts.length) continue;
          
          const cmd = parts[0].toUpperCase();
          
          // Parse coordinates from the command
          const coords = {};
          parts.slice(1).forEach(part => {
            const axis = part[0].toUpperCase();
            const value = parseFloat(part.slice(1));
            if (!isNaN(value)) coords[axis] = value;
          });
          
          switch (cmd) {
            case 'G0': // Rapid move (travel)
            case 'G1': // Linear move (extrusion or travel)
              previousPos = { ...currentPos };
              
              // Update position
              if (absoluteMode) {
                if ('X' in coords) currentPos.x = coords.X;
                if ('Y' in coords) currentPos.y = coords.Y;
                if ('Z' in coords) currentPos.z = coords.Z;
                if ('E' in coords) currentPos.e = coords.E;
              } else {
                if ('X' in coords) currentPos.x += coords.X;
                if ('Y' in coords) currentPos.y += coords.Y;
                if ('Z' in coords) currentPos.z += coords.Z;
                if ('E' in coords) currentPos.e += coords.E;
              }
              if ('F' in coords) currentPos.f = coords.F;
              
              // Detect layer change
              if (currentPos.z !== previousPos.z && currentPos.z > currentLayerZ) {
                currentLayerZ = currentPos.z;
                layerCount++;
                gcodeData.layers.set(currentLayerZ, layerCount);
              }
              
              // Calculate distance
              const dx = currentPos.x - previousPos.x;
              const dy = currentPos.y - previousPos.y;
              const dz = currentPos.z - previousPos.z;
              const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
              
              // Determine move type
              const isExtrusion = cmd === 'G1' && 'E' in coords && coords.E > 0;
              const isTravel = cmd === 'G0' || (cmd === 'G1' && !isExtrusion);
              
              if (distance > 0.001) { // Ignore tiny moves
                totalDistance += distance;
                if (isExtrusion) {
                  extrusionDistance += distance;
                } else {
                  travelDistance += distance;
                }
                
                gcodeData.moves.push({
                  type: cmd,
                  start: { ...previousPos },
                  end: { ...currentPos },
                  feedrate: currentPos.f,
                  extrusion: currentPos.e - previousPos.e,
                  layer: layerCount,
                  isTravel: isTravel,
                  isExtrusion: isExtrusion,
                  distance: distance
                });
              }
              
              // Update bounds
              gcodeData.bounds.min.x = Math.min(gcodeData.bounds.min.x, currentPos.x);
              gcodeData.bounds.min.y = Math.min(gcodeData.bounds.min.y, currentPos.y);
              gcodeData.bounds.min.z = Math.min(gcodeData.bounds.min.z, currentPos.z);
              gcodeData.bounds.max.x = Math.max(gcodeData.bounds.max.x, currentPos.x);
              gcodeData.bounds.max.y = Math.max(gcodeData.bounds.max.y, currentPos.y);
              gcodeData.bounds.max.z = Math.max(gcodeData.bounds.max.z, currentPos.z);
              break;
              
            case 'G28': // Home
              currentPos = { x: 0, y: 0, z: 0, e: currentPos.e, f: currentPos.f };
              break;
              
            case 'G90': // Absolute positioning
              absoluteMode = true;
              break;
              
            case 'G91': // Relative positioning
              absoluteMode = false;
              break;
          }
        }
        
        // Update stats
        gcodeData.stats = {
          totalMoves: gcodeData.moves.length,
          totalDistance: totalDistance,
          extrusionDistance: extrusionDistance,
          travelDistance: travelDistance,
          layers: layerCount,
          estimatedTime: totalDistance / 3000 // Rough estimate: 50mm/s average
        };
        
        maxLayer = layerCount;
        
        console.log('G-code parsed:', gcodeData);
        
        // Update UI
        document.getElementById('filename').textContent = '${gcodeFileUrl}'.split('/').pop();
        document.getElementById('moves').textContent = gcodeData.stats.totalMoves.toLocaleString();
        document.getElementById('layers').textContent = gcodeData.stats.layers;
        document.getElementById('distance').textContent = gcodeData.stats.totalDistance.toFixed(1);
        document.getElementById('extrusion').textContent = gcodeData.stats.extrusionDistance.toFixed(1);
        const size = {
          x: gcodeData.bounds.max.x - gcodeData.bounds.min.x,
          y: gcodeData.bounds.max.y - gcodeData.bounds.min.y,
          z: gcodeData.bounds.max.z - gcodeData.bounds.min.z
        };
        document.getElementById('volume').textContent = 
          \`\${size.x.toFixed(1)}x\${size.y.toFixed(1)}x\${size.z.toFixed(1)}\`;
        document.getElementById('time').textContent = gcodeData.stats.estimatedTime.toFixed(1);
        
        // Setup layer slider
        const slider = document.getElementById('layer-slider');
        slider.max = maxLayer;
        slider.value = maxLayer;
        
        // Create 3D visualization
        createToolpaths();
        
        // Auto fit camera
        window.autoFit();
        
        loadingDiv.style.display = 'none';
        document.getElementById('info').style.display = 'block';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('stats').style.display = 'block';
        document.getElementById('layer-control').style.display = 'block';
        
      } catch (error) {
        console.error('Error parsing G-code:', error);
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Error parsing G-code file: ' + error.message;
      }
    }
    
    function createToolpaths() {
      // Clear existing geometry
      toolpathGroup.clear();
      travelGroup.clear();
      
      // Create materials
      const extrusionMaterial = new THREE.LineBasicMaterial({ 
        vertexColors: true,
        linewidth: 2
      });
      
      const travelMaterial = new THREE.LineDashedMaterial({ 
        color: 0x666666,
        dashSize: 1,
        gapSize: 1,
        transparent: true,
        opacity: 0.5
      });
      
      // Process moves
      const extrusionPoints = [];
      const extrusionColors = [];
      const travelPoints = [];
      
      gcodeData.moves.forEach((move, index) => {
        const start = new THREE.Vector3(move.start.x, move.start.z, -move.start.y);
        const end = new THREE.Vector3(move.end.x, move.end.z, -move.end.y);
        
        if (move.isTravel) {
          if (travelPoints.length > 0) {
            const lastPoint = travelPoints[travelPoints.length - 1];
            if (!lastPoint.equals(start)) {
              // Add connecting line
              travelPoints.push(lastPoint.clone());
              travelPoints.push(start);
            }
          }
          travelPoints.push(start);
          travelPoints.push(end);
        } else {
          if (extrusionPoints.length > 0) {
            const lastPoint = extrusionPoints[extrusionPoints.length - 1];
            if (!lastPoint.equals(start)) {
              // Add invisible connecting segment
              extrusionPoints.push(lastPoint.clone());
              extrusionPoints.push(start);
              extrusionColors.push(new THREE.Color(0, 0, 0));
              extrusionColors.push(new THREE.Color(0, 0, 0));
            }
          }
          extrusionPoints.push(start);
          extrusionPoints.push(end);
          
          // Color based on mode
          let color;
          if (colorMode === 'layer') {
            const hue = (move.layer / maxLayer) * 0.8; // 0 to 0.8 (red to purple)
            color = new THREE.Color().setHSL(hue, 1, 0.5);
          } else if (colorMode === 'speed') {
            const speed = move.feedrate / 6000; // Normalize to 0-1 (assuming max 6000 mm/min)
            color = new THREE.Color().setHSL(0.3 - speed * 0.3, 1, 0.5); // Green (fast) to red (slow)
          } else { // type
            color = new THREE.Color(0x00ff00); // Green for extrusion
          }
          
          extrusionColors.push(color);
          extrusionColors.push(color);
        }
      });
      
      // Create extrusion geometry
      if (extrusionPoints.length > 0) {
        const extrusionGeometry = new THREE.BufferGeometry().setFromPoints(extrusionPoints);
        extrusionGeometry.setAttribute('color', new THREE.Float32BufferAttribute(
          extrusionColors.flatMap(c => [c.r, c.g, c.b]), 3
        ));
        const extrusionLines = new THREE.LineSegments(extrusionGeometry, extrusionMaterial);
        toolpathGroup.add(extrusionLines);
      }
      
      // Create travel geometry
      if (travelPoints.length > 0) {
        const travelGeometry = new THREE.BufferGeometry().setFromPoints(travelPoints);
        const travelLines = new THREE.LineSegments(travelGeometry, travelMaterial);
        travelLines.computeLineDistances();
        travelGroup.add(travelLines);
      }
    }
    
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    function animate() {
      requestAnimationFrame(animate);
      
      if (animating && gcodeData.moves.length > 0) {
        // Animation logic
        animationIndex = (animationIndex + 1) % gcodeData.moves.length;
        updateLayerDisplay(Math.floor(animationIndex / gcodeData.moves.length * maxLayer));
      }
      
      controls.update();
      renderer.render(scene, camera);
    }
    
    // Control functions
    window.resetView = function() {
      camera.position.set(200, 200, 200);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    
    window.toggleTravelMoves = function() {
      showTravelMoves = !showTravelMoves;
      travelGroup.visible = showTravelMoves;
      document.getElementById('travel-btn').classList.toggle('active', showTravelMoves);
    }
    
    window.toggleColorMode = function() {
      const modes = ['layer', 'speed', 'type'];
      const currentIndex = modes.indexOf(colorMode);
      colorMode = modes[(currentIndex + 1) % modes.length];
      document.getElementById('color-mode').textContent = 
        colorMode.charAt(0).toUpperCase() + colorMode.slice(1);
      createToolpaths();
    }
    
    window.autoFit = function() {
      const center = new THREE.Vector3(
        (gcodeData.bounds.min.x + gcodeData.bounds.max.x) / 2,
        (gcodeData.bounds.min.z + gcodeData.bounds.max.z) / 2,
        -(gcodeData.bounds.min.y + gcodeData.bounds.max.y) / 2
      );
      
      const size = Math.max(
        gcodeData.bounds.max.x - gcodeData.bounds.min.x,
        gcodeData.bounds.max.y - gcodeData.bounds.min.y,
        gcodeData.bounds.max.z - gcodeData.bounds.min.z
      );
      
      const distance = size * 1.3; // Changed from 2 to 1.3 for 50% closer zoom
      camera.position.set(center.x + distance, center.y + distance, center.z + distance);
      controls.target.copy(center);
      controls.update();
    }
    
    window.toggleAnimation = function() {
      animating = !animating;
      animationIndex = 0;
      document.getElementById('animate-btn').classList.toggle('active', animating);
    }
    
    window.updateLayer = function(value) {
      const layer = parseInt(value);
      if (layer === maxLayer) {
        currentLayer = -1;
        document.getElementById('layer-number').textContent = 'All';
        showAllLayers();
      } else {
        currentLayer = layer;
        document.getElementById('layer-number').textContent = layer;
        showLayerUpTo(layer);
      }
    }
    
    function showAllLayers() {
      toolpathGroup.visible = true;
      currentLayerGroup.clear();
    }
    
    function showLayerUpTo(targetLayer) {
      toolpathGroup.visible = false;
      currentLayerGroup.clear();
      
      // Recreate geometry for layers up to target
      const material = new THREE.LineBasicMaterial({ 
        vertexColors: true,
        linewidth: 2
      });
      
      const points = [];
      const colors = [];
      
      gcodeData.moves.forEach(move => {
        if (move.layer <= targetLayer && !move.isTravel) {
          const start = new THREE.Vector3(move.start.x, move.start.z, -move.start.y);
          const end = new THREE.Vector3(move.end.x, move.end.z, -move.end.y);
          
          points.push(start);
          points.push(end);
          
          const hue = (move.layer / maxLayer) * 0.8;
          const color = new THREE.Color().setHSL(hue, 1, 0.5);
          colors.push(color);
          colors.push(color);
        }
      });
      
      if (points.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(
          colors.flatMap(c => [c.r, c.g, c.b]), 3
        ));
        const lines = new THREE.LineSegments(geometry, material);
        currentLayerGroup.add(lines);
      }
    }
    
    function updateLayerDisplay(layer) {
      document.getElementById('layer-slider').value = layer;
      updateLayer(layer);
    }
    
    // Initialize
    init();
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

const PORT = 7892;
app.listen(PORT, () => {
  console.log(`CAD viewer server running on port ${PORT}`);
});