# Clear Browser Cache - Permanent Fix

If you keep seeing chunk loading errors, **this is a browser cache issue**, not a server issue.

## Quick Fix (Do This First):

### Firefox:
1. **Open DevTools** (F12)
2. **Right-click the refresh button** (while DevTools is open)
3. Select **"Empty Cache and Hard Reload"**

OR

1. **Press Ctrl+Shift+Delete** (Windows) or **Cmd+Shift+Delete** (Mac)
2. Select **"Cached Web Content"**
3. Time range: **"Everything"**
4. Click **"Clear Now"**
5. Refresh the page

### Chrome/Edge:
1. **Press Ctrl+Shift+Delete** (Windows) or **Cmd+Shift+Delete** (Mac)
2. Select **"Cached images and files"**
3. Time range: **"All time"**
4. Click **"Clear data"**
5. Refresh the page

## Permanent Solution (Disable Cache in DevTools):

### Firefox:
1. Open DevTools (F12)
2. Click the **Settings gear icon** (top right of DevTools)
3. Check **"Disable HTTP Cache (when toolbox is open)"**
4. **Keep DevTools open** while developing
5. The cache will be disabled as long as DevTools is open

### Chrome/Edge:
1. Open DevTools (F12)
2. Go to **Network tab**
3. Check **"Disable cache"**
4. **Keep DevTools open** while developing

## Why This Happens:

Next.js generates chunks dynamically in dev mode. When you restart the server:
- Old chunks are deleted
- New chunks are generated with different names/hashes
- Your browser tries to load old chunks from cache
- Those chunks don't exist anymore → error

## The Solution:

**Always keep DevTools open with cache disabled** while developing. This prevents the browser from caching chunks.

## If It Still Happens:

1. Stop the dev server (Ctrl+C)
2. Run: `cd frontend && ./restart-dev.sh`
3. Wait for "Ready" message
4. Clear browser cache (see above)
5. Hard refresh (Ctrl+Shift+R)

The server is working fine - this is purely a browser cache issue.

