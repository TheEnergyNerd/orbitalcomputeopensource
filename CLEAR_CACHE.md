# How to Clear Browser Cache for Orbital Compute Control Room

The `SimpleOrbitalGlobe.tsx` error is caused by cached JavaScript files in your browser. Follow these steps:

## Method 1: Hard Refresh (Recommended)
1. Open your browser to `http://localhost:3000`
2. **Mac**: Press `Cmd + Shift + R`
3. **Windows/Linux**: Press `Ctrl + Shift + R`

## Method 2: Clear Cache via DevTools
1. Open DevTools (F12 or Right-click → Inspect)
2. Right-click the refresh button in your browser
3. Select "Empty Cache and Hard Reload"

## Method 3: Clear All Site Data
1. Open DevTools (F12)
2. Go to the "Application" tab (Chrome) or "Storage" tab (Firefox)
3. Click "Clear site data" or "Clear storage"
4. Refresh the page

## Method 4: Incognito/Private Window
1. Open a new incognito/private window
2. Navigate to `http://localhost:3000`
3. This bypasses all cache

## If Still Not Working
1. Stop the dev server (Ctrl+C)
2. Delete `.next` folder: `rm -rf frontend/.next`
3. Restart: `cd frontend && npm run dev`
4. Hard refresh browser again

The error should disappear after clearing the cache, as the file `SimpleOrbitalGlobe.tsx` doesn't exist in the current codebase.

