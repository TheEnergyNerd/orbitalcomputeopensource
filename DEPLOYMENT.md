# Deployment Guide

This guide covers deploying the Orbital Compute Simulator to Railway (backend) and Vercel (frontend).

## Prerequisites

- GitHub account
- Railway account (sign up at https://railway.app)
- Vercel account (sign up at https://vercel.com)
- Cesium Ion token (get one at https://cesium.com/ion/)

## Step 1: Push to GitHub

1. Create a new repository on GitHub (don't initialize with README)

2. Add the remote and push:
```bash
git remote add origin https://github.com/YOUR_USERNAME/orbitalcompute.git
git branch -M main
git add .
git commit -m "Initial commit: Orbital Compute Simulator"
git push -u origin main
```

## Step 2: Deploy Backend to Railway

1. Go to https://railway.app and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `orbitalcompute` repository
4. Railway will detect the backend automatically
5. Configure environment variables (if needed):
   - No environment variables required for basic deployment
6. Railway will automatically:
   - Detect Python
   - Install dependencies from `backend/requirements.txt`
   - Run `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Copy your Railway app URL (e.g., `https://your-app.railway.app`)

### Railway Configuration

The `railway.json` file configures:
- Build command: Installs Python dependencies
- Start command: Runs FastAPI with uvicorn
- Port: Uses Railway's `$PORT` environment variable

## Step 3: Deploy Frontend to Vercel

1. Go to https://vercel.com and sign in
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `.next` (auto-detected)
5. Add Environment Variables:
   - `NEXT_PUBLIC_CESIUM_ION_TOKEN`: Your Cesium Ion token
   - `NEXT_PUBLIC_API_BASE`: Your Railway backend URL (e.g., `https://your-app.railway.app`)
6. Click "Deploy"

### Vercel Configuration

The `vercel.json` file includes:
- API rewrites to proxy backend requests
- Environment variable defaults

**Important**: Update `vercel.json` with your actual Railway URL:
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://YOUR_RAILWAY_APP.railway.app/:path*"
    }
  ],
  "env": {
    "NEXT_PUBLIC_API_BASE": "https://YOUR_RAILWAY_APP.railway.app"
  }
}
```

## Step 4: Update CORS (if needed)

If you encounter CORS issues, update `backend/main.py` to allow your Vercel domain:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-vercel-app.vercel.app",
        "http://localhost:3000"  # For local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Environment Variables

### Railway (Backend)
- No environment variables required for basic deployment

### Vercel (Frontend)
- `NEXT_PUBLIC_CESIUM_ION_TOKEN`: Cesium Ion access token
- `NEXT_PUBLIC_API_BASE`: Railway backend URL

## Troubleshooting

### Backend not starting on Railway
- Check Railway logs: `railway logs`
- Ensure `requirements.txt` is in the `backend/` directory
- Verify Python version (3.11 recommended)

### Frontend build fails on Vercel
- Check build logs in Vercel dashboard
- Ensure `NEXT_PUBLIC_CESIUM_ION_TOKEN` is set
- Verify `NEXT_PUBLIC_API_BASE` points to your Railway URL

### CORS errors
- Add your Vercel domain to Railway backend CORS settings
- Check that `NEXT_PUBLIC_API_BASE` is correct

## Continuous Deployment

Both Railway and Vercel automatically deploy when you push to GitHub:
- Railway: Deploys backend on push to `main` branch
- Vercel: Deploys frontend on push to `main` branch

## Local Development

For local development, you can still run both services locally:

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

Update `frontend/.env.local`:
```
NEXT_PUBLIC_CESIUM_ION_TOKEN=your_token
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

