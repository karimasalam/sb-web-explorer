#!/bin/bash

echo "Starting development environment..."

# Start the backend server
(cd server && npm install && node index.js) &

# Start the frontend
(npm install && npm start) &

echo "Development environment started!"
echo "Backend: http://localhost:3001"
echo "Frontend: http://localhost:3000"

# Wait for both processes
wait
