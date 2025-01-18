@echo off
echo Starting development environment...

:: Start the backend server
start cmd /k "cd server && npm install && node index.js"

:: Start the frontend
start cmd /k "npm install && npm start"

echo Development environment started!
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
