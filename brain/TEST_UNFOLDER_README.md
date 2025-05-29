# Unfolder Test Instructions

This test setup demonstrates how to call the FreeCAD subprocess for unfolding STEP files to DXF.

## Files Created

1. `test-Dockerfile` - Test Docker image with FreeCAD and dependencies
2. `test-docker-compose.yml` - Docker compose configuration for testing
3. `test-unfolder.ts` - TypeScript test script (runs on host)
4. `test-unfolder-docker.py` - Python test script (runs inside container)
5. `test.step` - Sample STEP file for testing (already exists)

## How to Run the Test

### Option 1: Using Docker (Recommended)

1. Build and start the test container:
```bash
cd brain
docker-compose -f test-docker-compose.yml up -d --build
```

2. Run the test inside the container:
```bash
docker-compose -f test-docker-compose.yml exec unfolder-test python3 /app/brain/test-unfolder-docker.py
```

3. Check the output:
```bash
ls -la output/
cat output/largest_face.dxf | head -20
```

4. Clean up when done:
```bash
docker-compose -f test-docker-compose.yml down
rm -rf output/
```

### Option 2: Using TypeScript (requires FreeCAD installed locally)

1. Ensure FreeCAD is installed on your system
2. Run the TypeScript test:
```bash
cd brain
npx ts-node test-unfolder.ts
```

## Key Implementation Details

The unfolder subprocess works as follows:

1. **Environment Variables**:
   - `K_FACTOR`: Sheet metal K-factor (default 0.38)
   - `OUTPUT_DIR`: Directory for output files

2. **FreeCAD Command**:
   ```bash
   freecad <step_file> -c <unfold_script.py>
   ```

3. **Output**:
   - Creates `largest_face.dxf` in the OUTPUT_DIR
   - Also creates `largest_face_raw.dxf` and `unbend_model.step`

## Integration Notes

To integrate this into your new system:

1. **Subprocess Call**: Use the same command structure shown in the test scripts
2. **Environment Setup**: Pass K_FACTOR and OUTPUT_DIR as environment variables
3. **File Handling**: Use temporary directories for input/output files
4. **Error Handling**: Check subprocess return code and file existence

## Cleanup

After testing, you can remove the test files:
```bash
rm test-Dockerfile test-docker-compose.yml test-unfolder.ts test-unfolder-docker.py TEST_UNFOLDER_README.md
rm -rf output/
```