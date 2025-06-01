#!/usr/bin/env python3

import sys
import os
import subprocess

if len(sys.argv) != 3:
    print("Usage: python run_unfold.py <input.step> <output.dxf>")
    sys.exit(1)

input_file = sys.argv[1]
output_file = sys.argv[2]

# Create a temporary Dockerfile for direct unfold execution
dockerfile_content = """FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \\
    freecad \\
    python3 \\
    python3-pip \\
    xvfb \\
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install networkx ezdxf

WORKDIR /app

COPY src/ /app/src/

RUN mkdir -p /app/input /app/output

ENV PYTHONPATH=/app
ENV K_FACTOR=0.38

CMD ["sh", "-c", "xvfb-run -a freecad /app/input/input.step -c /app/src/unfolder/unfold.py"]
"""

with open("Dockerfile.unfold", "w") as f:
    f.write(dockerfile_content)

# Build the Docker image
print("Building Docker image...")
subprocess.run(["docker", "build", "-f", "Dockerfile.unfold", "-t", "unfolder-direct", "."])

# Copy input file to a temporary location
os.makedirs("temp_input", exist_ok=True)
os.makedirs("temp_output", exist_ok=True)
subprocess.run(["cp", input_file, "temp_input/input.step"])

# Run the Docker container
print("Running unfolder...")
subprocess.run([
    "docker", "run", "--rm",
    "-v", f"{os.path.abspath('temp_input')}:/app/input",
    "-v", f"{os.path.abspath('temp_output')}:/app/output",
    "-e", "K_FACTOR=0.38",
    "-e", "OUTPUT_DIR=/app/output",
    "unfolder-direct"
])

# Copy the output file
if os.path.exists("temp_output/largest_face.dxf"):
    subprocess.run(["cp", "temp_output/largest_face.dxf", output_file])
    print(f"Output saved to: {output_file}")
else:
    print("Error: Output file not generated")

# Cleanup
subprocess.run(["rm", "-rf", "temp_input", "temp_output", "Dockerfile.unfold"])