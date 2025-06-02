FROM node:18-alpine

WORKDIR /app

# Create package.json
RUN echo '{\
  "name": "step-viewer-server",\
  "version": "1.0.0",\
  "main": "api.js",\
  "dependencies": {\
    "express": "^4.18.2",\
    "axios": "^1.6.0"\
  }\
}' > package.json

# Install dependencies
RUN npm install

# Copy application file
COPY api.js .

# Expose port
EXPOSE 7892

# Start the server
CMD ["node", "api.js"]