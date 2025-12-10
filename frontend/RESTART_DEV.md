# Restart Development Server

If you're experiencing chunk loading errors, follow these steps:

1. Stop the current dev server (Ctrl+C in the terminal where it's running)

2. Clear the Next.js cache:
   ```bash
   cd frontend
   rm -rf .next
   ```

3. Restart the dev server:
   ```bash
   npm run dev
   ```

4. If issues persist, also clear node_modules cache:
   ```bash
   rm -rf node_modules/.cache
   npm run dev
   ```

5. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

The chunk loading errors are typically caused by:
- Stale build cache
- Dev server not properly restarted after code changes
- Browser cache serving old chunk references

