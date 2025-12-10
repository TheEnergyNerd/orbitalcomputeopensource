# Fix Chunk Loading Errors

If you see errors like:
```
Loading failed for the <script> with source "http://localhost:3000/_next/static/chunks/main-app.js"
Loading failed for the <script> with source "http://localhost:3000/_next/static/chunks/app-pages-internals.js"
```

## Quick Fix:

1. **Stop the dev server** (Ctrl+C in the terminal)

2. **Clear Next.js cache:**
   ```bash
   rm -rf .next
   ```

3. **Kill any stuck processes:**
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

4. **Restart the dev server:**
   ```bash
   npm run dev
   ```

5. **Hard refresh your browser:**
   - Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
   - Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

## If that doesn't work:

1. **Clear browser cache completely:**
   - Open DevTools (F12)
   - Right-click the refresh button
   - Select "Empty Cache and Hard Reload"

2. **Clear node_modules cache:**
   ```bash
   rm -rf node_modules/.cache
   rm -rf .next
   npm run dev
   ```

3. **Check for port conflicts:**
   ```bash
   lsof -i:3000
   ```

The chunk loading errors are typically caused by:
- Stale build cache in `.next` directory
- Browser cache serving old chunk references
- Dev server not properly restarting after code changes
- Port conflicts with another process

