# Multi-language Dockerfile: Node.js + Python
FROM node:20-bullseye

# Set working directory
WORKDIR /app

# Install Python and build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    git \
    # FreeCAD and dependencies for unfolder service
    freecad \
    libocct-data-exchange-7.5 \
    libocct-foundation-7.5 \
    libocct-modeling-algorithms-7.5 \
    libocct-modeling-data-7.5 \
    libocct-ocaf-7.5 \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment for isolation
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy and install Python dependencies first (for better caching)
COPY src/mcp_servers/requirements.txt ./python-requirements.txt
RUN pip install --no-cache-dir -r python-requirements.txt

# Copy Node.js package files and install dependencies
COPY package.json tsconfig.json tsconfig.build.json ./
COPY tailwind.config.js postcss.config.js next.config.js ./
RUN npm install

# Copy all source code
COPY src/ ./src/
COPY app/ ./app/

# Build Next.js and compile TypeScript
RUN npm run build

# Verify both Python and Node.js MCP servers are available
#RUN python3 -c "import sys; sys.path.append('./src'); from mcp_servers.nesting import server; print('✅ Python nesting server imported successfully')" || echo "❌ Python nesting server failed"
#RUN npx @supabase/mcp-server-postgrest --version 2>/dev/null || echo "✅ Supabase MCP server available"

# Set environment variables
ENV PYTHONPATH="/app/src"
ENV NODE_ENV="production"

# Expose port 3000 for Next.js
EXPOSE 3000

# Run the main application
CMD ["npm", "run", "start"]