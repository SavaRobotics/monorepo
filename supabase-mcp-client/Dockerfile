FROM python:3.11-slim

# Install Node.js and npm for running the Supabase MCP server
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install npx globally
RUN npm install -g npx

# Copy application files
COPY client.py .
COPY .env .

# Set environment to use unbuffered output
ENV PYTHONUNBUFFERED=1

# Run the client
CMD ["python", "client.py"]
