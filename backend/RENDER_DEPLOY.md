# Deploying AARK Backend to Render

## One-Time Setup

1. Go to render.com and sign in with GitHub
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - Name: aark-backend
   - Root Directory: backend
   - Runtime: Python 3
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
5. Add Environment Variables:
   - `GMAIL_ADDRESS` = sales.aarkfusion@gmail.com
   - `GMAIL_APP_PASSWORD` = (your 16-char Gmail app password)
   - `OWNER_EMAIL` = sales.aarkfusion@gmail.com
6. Click "Create Web Service"
7. Wait ~2 minutes for deploy
8. Your live URL will be: https://aark-backend-dkn9.onrender.com

## Gmail App Password Setup

1. Go to myaccount.google.com
2. Security → 2-Step Verification (enable if not already on)
3. Search "App Passwords" in the search bar
4. Select Mail + Other → type "AARK Website"
5. Copy the 16-character password → paste into Render env vars

## After Deploy

Test the health check:
```
curl https://aark-backend.onrender.com
```
Should return: `{"status": "AARK backend is live"}`

Update the fetch URL in checkout.html if your Render URL is different:
```
FROM: https://aark-backend.onrender.com/place-order
TO:   your actual Render URL/place-order
```

## Notes

- Render free tier spins down after inactivity — first request may take ~30s
- The backend uses Gmail SMTP with app password (not OAuth)
- Never commit the `.env` file — only `.env.example` is in git
- CORS is open to all origins — restrict to your domain in production
