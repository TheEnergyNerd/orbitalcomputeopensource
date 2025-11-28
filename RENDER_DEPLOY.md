# Deploy Backend to Render (Free Alternative to Railway)

Since Railway trial expired, here's how to deploy to Render's free tier.

## Quick Steps

1. **Sign up at Render**: https://render.com (free tier available)

2. **Create a New Web Service**:
   - Go to Dashboard → "New" → "Web Service"
   - Connect your GitHub repository
   - Select the `orbitalcompute` repository

3. **Configure the Service**:
   - **Name**: `orbitalcompute-backend` (or any name)
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Root Directory**: Leave empty (or set to `backend` if Render requires it)
   - **Runtime**: `Python 3`
   - **Build Command**: 
     ```bash
     cd backend && pip install -r requirements.txt
     ```
   - **Start Command**:
     ```bash
     cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
     ```
   - **Environment**: `Python 3`

4. **Environment Variables** (if needed):
   - `PORT`: Render sets this automatically
   - No other variables needed for basic deployment

5. **Click "Create Web Service"**

6. **Wait for deployment** (takes 5-10 minutes on free tier)

7. **Copy your Render URL** (e.g., `https://orbitalcompute-backend.onrender.com`)

8. **Update Vercel Environment Variable**:
   - Go to Vercel → Your Project → Settings → Environment Variables
   - Update `NEXT_PUBLIC_API_BASE` to your Render URL
   - Redeploy frontend

## Render Free Tier Limitations

- **Cold starts**: Service spins down after 15 minutes of inactivity (first request takes ~30 seconds)
- **Sleep**: Free tier services sleep after inactivity
- **Upgrade**: $7/month for always-on service

## Alternative: Fly.io (Also Free)

Fly.io has a free tier with better performance:

1. Sign up at https://fly.io
2. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
3. Run: `fly launch` in your project root
4. Follow prompts to deploy

## Quick Fix: Just Redeploy on Railway

If you want to keep Railway:
1. Go to Railway dashboard
2. Upgrade to paid plan ($5/month)
3. Click "Redeploy" on your service
4. It should work immediately

