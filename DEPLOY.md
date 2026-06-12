# SmartStock AI — Deployment Guide (Free Forever)

Architecture:

```
Vercel (FE)  ─────►  Render (BE)  ─────►  MongoDB Atlas (DB)
                       ▲
                       │  every 10 min
                  GitHub Actions
                  (keep-alive)
```

| Layer | Where | Plan | Cost | Cold start? |
|-------|-------|------|------|-------------|
| Frontend | Vercel | Hobby | FREE | Never |
| Backend  | Render | Free Web Service | FREE | Solved by keep-alive |
| Keep-alive | GitHub Actions | Free | FREE | n/a |
| Database | MongoDB Atlas | M0 | FREE (512 MB) | Never |

**Total monthly cost: ₹0.** No credit card required anywhere.

---

## Current state

| Step | Status | Notes |
|------|--------|-------|
| FE deployed | DONE | https://client-alpha-nine-86.vercel.app |
| BE deployed | TODO | Use `render.yaml` blueprint |
| DB created  | TODO | Create Atlas M0 cluster |
| Keep-alive  | TODO | Set `RENDER_BACKEND_URL` GitHub variable |
| FE → BE wired | TODO | Set `VITE_API_URL` in Vercel after BE is live |

---

## 1. MongoDB Atlas (5 min)

1. Sign up at https://cloud.mongodb.com (use the same Google account as everywhere else).
2. **Create a cluster** → **M0 Sandbox (FREE FOREVER)**.
   - Provider: **AWS** — Region: **Mumbai (ap-south-1)**.
   - Cluster name: `smartstock`.
3. **Database Access** → **Add New Database User**:
   - Username: `smartstock`
   - Password: click "Autogenerate" → **save it somewhere safe**.
   - Built-in role: `Atlas admin`.
4. **Network Access** → **Add IP Address** → **Allow Access From Anywhere** (`0.0.0.0/0`).
   - Render free-tier outbound IPs are dynamic; this is the only practical option.
5. **Database** → **Connect** → **Drivers** → copy the connection string:
   ```
   mongodb+srv://smartstock:<password>@smartstock.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Insert the DB name `MERNDB` before `?`:
   ```
   mongodb+srv://smartstock:<password>@smartstock.xxxxx.mongodb.net/MERNDB?retryWrites=true&w=majority
   ```
7. Save this string — Render will ask for it.

---

## 2. Push to GitHub (one-time)

```powershell
git init
git add .
git commit -m "Initial commit"

# Option A: gh CLI (one-liner)
gh repo create smartstock-ai --public --source=. --push

# Option B: manual
# 1. Create empty repo on github.com
# 2. git remote add origin https://github.com/<you>/smartstock-ai.git
# 3. git push -u origin main
```

> **Before pushing**, run `git status` and confirm NO `.env`, `*_cookies.txt`, or `node_modules/` show up. The repo's `.gitignore` covers these — but double-check.

---

## 3. Backend → Render (5 min, one-click)

The repo already contains `render.yaml`.

1. Go to https://dashboard.render.com → sign in with GitHub.
2. **New +** → **Blueprint** → connect the `smartstock-ai` repo.
3. Render reads `render.yaml` and prompts for three secrets:
   - `MONGODB_URI` → paste the Atlas string from Step 1.7.
   - `CLIENT_URL` → `https://client-alpha-nine-86.vercel.app`
     (comma-separate to add more, e.g. `https://a.vercel.app,https://b.vercel.app`)
   - `GEMINI_API_KEY` → get one free at https://aistudio.google.com/app/apikey
4. Click **Apply**.
5. Wait ~4 min. Final URL will be: `https://smartstock-api.onrender.com`
6. Open `https://smartstock-api.onrender.com/api/v1/health` — you should see `{"status":"ok","db":"connected",...}`.

---

## 4. Keep-Alive → GitHub Actions (defeats the 15-min sleep)

The workflow at `.github/workflows/keepalive.yml` pings the backend every 10 minutes from a GitHub-hosted runner. This is the single most important step — without it, every demo will start with a 30-50 second wake-up delay.

1. On GitHub → repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**:
   - Name: `RENDER_BACKEND_URL`
   - Value: `https://smartstock-api.onrender.com` (no trailing slash)
2. Go to the **Actions** tab → **Keep-Alive Backend** → **Run workflow** (manual trigger for the first test).
3. If you see a green check, you're done. From now on it runs every 10 min automatically.

> The free tier gives 2000 min/mo of Actions on private repos and unlimited on public. Each ping uses ~10 s. You will use ~12 min/day = 360 min/month — well within free limits.

---

## 5. Frontend → Vercel (FE already live, just needs API URL)

```powershell
# Set the env var on Vercel
vercel env add VITE_API_URL production --cwd "c:\Users\Admin\Desktop\Clg Mern\client"
# When prompted, paste: https://smartstock-api.onrender.com/api/v1

# Redeploy with the new env baked in
vercel deploy --prod --cwd "c:\Users\Admin\Desktop\Clg Mern\client"
```

Or via dashboard: https://vercel.com/ajaysinh-parmars-projects/client/settings/environment-variables → add `VITE_API_URL` for the Production environment → Redeploy.

---

## 6. Smoke test

```powershell
# Backend
curl https://smartstock-api.onrender.com/api/v1/health

# Frontend
start https://client-alpha-nine-86.vercel.app
```

In the FE, run through:
1. Register a new user.
2. Log in.
3. Create a product.
4. Ring a sale.

If all 4 work, the pipeline is live. Show the green keep-alive checkmark on the Actions tab to your professor as proof of zero cold starts.

---

## Demo-day checklist (10 min before the demo)

| | Step |
|--|------|
| ☐ | Open https://smartstock-api.onrender.com/api/v1/health — confirm `status: ok` |
| ☐ | Check GitHub Actions tab — latest keep-alive run is green |
| ☐ | Open the Vercel URL on the demo laptop and the projector |
| ☐ | Log in with the demo account (or register a fresh one live) |
| ☐ | Have a backup local stack ready (`npm run dev` in both folders) just in case |

---

## Re-deploys

- **FE**: `vercel deploy --prod --cwd client` (or push to `main` with Vercel git integration)
- **BE**: any `git push origin main` triggers Render auto-deploy
- **DB schema**: SSH into Render shell → run scripts in `server/src/migrations/`

---

## Future upgrade path (if you outgrow Render)

When the project gets real traffic or you want true zero cold starts:

1. **Fly.io** — `server/Dockerfile` and `server/fly.toml` are already in the repo. Run:
   ```powershell
   cd server
   fly launch --no-deploy
   fly secrets set MONGODB_URI=... JWT_SECRET=... CLIENT_URL=... GEMINI_API_KEY=...
   fly deploy
   ```
   Requires a credit card on signup; the free allowance covers a single small VM with no cold start.

2. **Render paid** — $7/mo Starter plan removes the 15-min sleep entirely.

---

## Environment variable reference

### Vercel (FE)

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://smartstock-api.onrender.com/api/v1` |

### Render (BE)

| Key | Value | Source |
|-----|-------|--------|
| `NODE_ENV` | `production` | render.yaml |
| `PORT` | `10000` | render.yaml |
| `JWT_EXPIRES_IN` | `7d` | render.yaml |
| `JWT_SECRET` | _(auto-generated)_ | Render |
| `MONGODB_URI` | _(your Atlas string)_ | dashboard prompt |
| `CLIENT_URL` | _(your Vercel URL — comma-list ok)_ | dashboard prompt |
| `VERCEL_PROJECT_SLUG` | `client` | render.yaml |
| `GEMINI_API_KEY` | _(your Gemini key)_ | dashboard prompt |
| `SMART_ALERTS_CRON` | `0 9 * * *` | render.yaml |

### GitHub Actions (keep-alive)

| Key | Value | Where |
|-----|-------|-------|
| `RENDER_BACKEND_URL` | `https://smartstock-api.onrender.com` | Repo → Settings → Variables |

### MongoDB Atlas

| Setting | Value |
|---------|-------|
| Cluster tier | M0 (free) |
| Region | AWS Mumbai (ap-south-1) |
| DB user | `smartstock` |
| Network access | `0.0.0.0/0` |
| DB name | `MERNDB` |
