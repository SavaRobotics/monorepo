# FreeCAD Docker Unfolder

This directory contains the Docker setup for the CAD unfolder tool used by the Mastra workflow.

## 📁 Structure

```
docker/unfolder/
├── Dockerfile.freecad-unfolder    # Docker container definition
├── process_cad.py                 # Python script that runs inside container
├── build-docker-setup.sh          # Build script for Docker image
├── unfolder/                      # Contains unfold.py script
├── sheet_metal/                   # FreeCAD Sheet Metal workbench
└── README.md                      # This file
```

## 🔧 Setup

1. **Build the Docker image:**
   ```bash
   cd docker/unfolder/
   ./build-docker-setup.sh
   ```

2. **Verify the image is built:**
   ```bash
   docker images | grep freecad-unfolder
   ```

## 🚀 Usage

The Mastra workflow automatically uses this Docker image via the `docker-unfold-tool.ts` in `src/mastra/tools/unfolder/`.

### Manual Testing

You can test the Docker container manually:

```bash
docker run --rm \
  -v /tmp/output:/workspace \
  -e CAD_FILE_URL=https://your-domain.com/part.step \
  -e K_FACTOR=0.038 \
  -e OUTPUT_FORMAT=dxf \
  freecad-unfolder:latest
```

## 🔄 Workflow Integration

1. **User submits** CAD file URL via Next.js form
2. **Mastra workflow** calls `docker-unfold-tool.ts`
3. **Docker tool** spins up container with volume mounting
4. **Container** downloads STEP file and processes it with FreeCAD
5. **Results** are returned as base64-encoded DXF/STEP files
6. **AI agent** analyzes results and provides manufacturing insights

## 📋 Requirements

- Docker installed and running
- FreeCAD dependencies (handled in Docker container)
- Minimum 2GB RAM for FreeCAD processing
- Network access for downloading STEP files

## 🐛 Troubleshooting

**Container build fails:**
- Check Docker is running: `docker --version`
- Verify internet connection for package downloads

**Processing fails:**
- Check CAD file URL is accessible
- Verify file is valid STEP format
- Check Docker container logs

**No output files:**
- Ensure volume mounting permissions are correct
- Verify STEP file contains sheet metal geometry
- Check FreeCAD processing logs 