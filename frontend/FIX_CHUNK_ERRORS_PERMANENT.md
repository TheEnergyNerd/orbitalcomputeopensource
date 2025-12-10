# Permanent Fix for Chunk Loading Errors

If you keep seeing:
```
Loading failed for the <script> with source "http://localhost:3000/_next/static/chunks/main-app.js"
```

## Root Cause
This happens when:
1. Browser cache has stale chunk references
2. Dev server restarts but browser still tries to load old chunks
3. Chunks are generated but browser requests them before they're ready

## Permanent Solution

### Option 1: Use the Restart Script (Recommended)
```bash
cd frontend
./restart-dev.sh
```

This script:
- Kills all Next.js processes
- Clears .next cache
- Clears node_modules cache
- Starts fresh dev server

### Option 2: Manual Steps
```bash
# 1. Stop the server (Ctrl+C in terminal)

# 2. Kill any stuck processes
pkill -f "next dev"
pkill -f "next-server"
lsof -ti:3000 | xargs kill -9

# 3. Clear caches
cd frontend
rm -rf .next
rm -rf node_modules/.cache

# 4. Restart
npm run dev
```

### Option 3: Browser Fix (If server is running)
1. **Hard refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear site data:**
   - Open DevTools (F12)
   - Application tab → Clear storage → Clear site data
   - Refresh

### Option 4: Disable Browser Cache (Development Only)
In Firefox DevTools:
1. F12 → Settings (gear icon)
2. Check "Disable HTTP Cache (when toolbox is open)"
3. Keep DevTools open while developing

## Prevention
- Always stop the dev server properly (Ctrl+C) before restarting
- Clear .next folder when switching branches
- Use hard refresh (Ctrl+Shift+R) after server restarts

## Why This Keeps Happening
Next.js generates chunks dynamically in dev mode. If the browser has cached references to chunks that were deleted/regenerated, it tries to load them and fails. The solution is to clear both server cache (.next) and browser cache.

