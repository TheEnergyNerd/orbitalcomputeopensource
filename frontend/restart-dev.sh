#!/bin/bash

# Kill any existing Next.js processes
echo "Stopping existing Next.js processes..."
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Wait a moment
sleep 2

# Clear Next.js cache
echo "Clearing .next cache..."
rm -rf .next

# Clear node_modules cache
echo "Clearing node_modules cache..."
rm -rf node_modules/.cache

# Start dev server
echo "Starting dev server..."
npm run dev

