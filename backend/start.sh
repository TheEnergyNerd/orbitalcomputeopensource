#!/bin/bash
# Auto-restart backend server with file watching

cd "$(dirname "$0")"

# Kill any existing uvicorn processes
pkill -f "uvicorn main:app" || true
sleep 1

# Start with auto-reload (watches for file changes)
echo "Starting backend server on port 8000 with auto-reload..."
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

