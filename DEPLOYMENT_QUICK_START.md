# Quick Deployment Guide

## ✅ Step 1: Deploy Backend to Railway

1. Go to https://railway.app → Sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select `orbitalcompute` repository
4. Railway will auto-detect the Dockerfile
5. Wait for build to complete
6. **Copy your Railway URL** (e.g., `https://orbitalcompute-backend.railway.app`)

## ✅ Step 2: Update vercel.json

Replace `your-railway-app.railway.app` in `vercel.json` with your actual Railway URL:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR_ACTUAL_RAILWAY_URL.railway.app/:path*"
    }
  ]
}
```

Then commit and push:
```bash
git add vercel.json
git commit -m "Update Railway URL in vercel.json"
git push
```

## ✅ Step 3: Deploy Frontend to Vercel

1. Go to https://vercel.com → Sign in
2. Click "Add New..." → "Project"
3. Import `orbitalcompute` repository
4. Configure:
   - **Root Directory**: `frontend`
   - **Framework**: Next.js (auto-detected)
5. Add Environment Variables:
   - `NEXT_PUBLIC_API_BASE`: `https://YOUR_RAILWAY_URL.railway.app`
   - `NEXT_PUBLIC_CESIUM_ION_TOKEN`: (optional, add later if needed)
6. Click "Deploy"

## ✅ Step 4: Update Railway CORS (if needed)

If you get CORS errors, update `backend/main.py` to allow your Vercel domain:

```python
ALLOWED_ORIGINS_STR = os.getenv("ALLOWED_ORIGINS", "*")
```

Or set `ALLOWED_ORIGINS` environment variable in Railway to your Vercel URL.

## 🎉 Done!

Both services will auto-deploy on every git push to `main`.

