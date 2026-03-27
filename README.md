# SUWE — Built for the Market

> A fintech + community platform for Nigerian informal market traders.  
> Track sales · Save with Ajo · Connect with traders · Build credit

---

## What is SUWE?

SUWE helps market traders — pepper sellers, fabric vendors, food traders — do three things:

1. **Track their business** — log sales, see real profit, get AI restock suggestions
2. **Save together** — digital Ajo groups with Interswitch-protected payments
3. **Connect** — community feed for price alerts, bulk buying, and trade news

Built for the 40 million+ informal traders in Nigeria who have never had access to proper financial tools. SUWE meets them where they are — simple language, mobile-friendly, built for low connectivity.

---

## Pages Built

| Page | File | Status |
|------|------|--------|
| Landing / Sign In | `frontend/pages/index.html` | ✅ Done |
| Onboarding | `frontend/pages/onboarding.html` | ✅ Done |
| Dashboard | `frontend/pages/dashboard.html` | ✅ Done |
| Community Feed | `frontend/pages/community.html` | ✅ Done |
| Ajo Groups | `frontend/pages/ajo.html` | ✅ Done |
| Credit Score | `frontend/pages/creditscore.html` | ✅ Done |
| Sales & Inventory | `frontend/pages/sales_and_inventory.html` | ✅ Done |

---

## Folder Structure

```
BBS--SUWE/
├── backend/
│   ├── server.js                         ← Node/Express backend server
│   ├── package.json                      ← Backend dependencies
│   └── package-lock.json
│
├── frontend/
│   ├── css/                              ← Stylesheets
│   ├── js/
│   │   ├── supabase.js                   ← Auth + shared Supabase logic
│   │   ├── feed.js                       ← Community feed backend logic
│   │   └── main.js                       ← Shared utilities
│   └── pages/
│       ├── index.html                    ← Landing page + sign in
│       ├── onboarding.html               ← New user setup
│       ├── dashboard.html                ← Main trader dashboard
│       ├── community.html                ← Community feed
│       ├── ajo.html                      ← Ajo savings groups
│       ├── creditscore.html              ← AI credit score
│       └── sales_and_inventory.html      ← Sales tracker + inventory
│
├── suwe_schema.sql                       ← Full database schema (run once in Supabase)
└── README.md                             ← This file
```

---

## Tech Stack

| Layer | Tool | Cost |
|-------|------|------|
| Frontend hosting | Vercel | Free |
| Database + Auth | Supabase | Free |
| Backend server | Node.js + Express | Free (Vercel serverless) |
| Payments | Interswitch | Per transaction |
| AI credit scoring | Claude API (Anthropic) | Pay per use |
| Real-time feed | Supabase Realtime | Free |

---

## Auth — What's Working

| Method | Status |
|--------|--------|
| Email + Password signup | ✅ Working |
| Email + Password login | ✅ Working |
| Google OAuth | ✅ Working |
| Facebook OAuth | ❌ Not added |

Auth is handled in `frontend/js/supabase.js`. No email confirmation step — users go straight from signup → onboarding → dashboard.

**User flow:**
```
Sign up / Sign in
      ↓
New user → onboarding.html (complete your trader profile)
      ↓
Returning user → dashboard.html (straight in)
```

---

## Payments — Interswitch

Interswitch integration has been started for Ajo group contributions. Handles automatic monthly collection and distribution so no member ever touches cash directly.

Integration lives in `backend/server.js`.

---

## Database — Supabase

### Tables

| Table | What it stores |
|-------|---------------|
| `profiles` | Trader info — name, market, credit score, avatar |
| `posts` | All feed posts — updates, price alerts, bulk buys, ajo invites |
| `comments` | Replies to posts |
| `likes` | Who liked what |
| `bulk_participants` | Who joined a bulk buy |
| `ajo_requests` | Requests to join Ajo groups from the feed |
| `follows` | Who follows who |

Full schema with RLS policies, triggers, and real-time config is in `suwe_schema.sql`.

### Real-time

The community feed updates live for all users:
- New posts appear at the top instantly
- Comments appear without refreshing
- Like counts tick up for everyone watching
- Bulk buy spots fill in real time

---

## Setup Guide (For New Developers)

### Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/BBS--SUWE.git
cd BBS--SUWE
```

### Step 2 — Install backend dependencies

```bash
cd backend
npm install
```

### Step 3 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) → create a free project named `suwe`
2. Go to **SQL Editor → New Query**
3. Paste the entire contents of `suwe_schema.sql` and click **Run**
4. You should see "Success" — all tables, triggers, RLS policies created

### Step 4 — Environment variables

Environment variables are already configured on Vercel for the live deployment.

For **local development**, create a `.env` file inside `/backend`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
INTERSWITCH_CLIENT_ID=your-interswitch-client-id
INTERSWITCH_CLIENT_SECRET=your-interswitch-secret
```

Also update the keys at the top of `frontend/js/supabase.js` and `frontend/js/feed.js`.

### Step 5 — Run locally

```bash
# Start backend
cd backend
node server.js

# Frontend — open directly in browser
open frontend/pages/index.html
```

### Step 6 — Supabase Auth settings

In Supabase Dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/**`

In **Authentication → Settings**:
- Email confirmations: **OFF** (we redirect manually)
- Google OAuth: **ON** (credentials already configured)

---

## Deploying Updates

Both team members use the same process:

```bash
git add .
git commit -m "describe what you changed"
git push
```

Vercel detects the push and auto-deploys in about 60 seconds. No manual steps.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Vercel 404 after login | Redirect URL path is wrong | Check `redirectTo` in `supabase.js` matches actual file path |
| `localhost:3000` in URL | Supabase Site URL not updated | Set Site URL to Vercel URL in Supabase Auth settings |
| Supabase connection error | Project paused | Go to Supabase dashboard → click Resume |
| Real-time feed not updating | Tables not in realtime publication | Re-run the realtime section of `suwe_schema.sql` |
| Blank page after sign in | `window.location.href` missing in signup | Add manual redirect in `supabase.js` after successful signup |

---

## In Progress / Known Issues

- [ ] Facebook OAuth — not added yet
- [ ] Claude AI credit score — API integration fix for live deployment
- [ ] Interswitch — complete payment flow for Ajo contributions
- [ ] Email signup redirect — ensure `supabase.js` redirects to `onboarding.html` correctly

---

## Team

| Role | Work done |
|------|-----------|
| Frontend | Landing page, Dashboard, Feed, Ajo, Credit Score page designs + logic |
| Backend | Auth (Supabase), Onboarding, Sales & Inventory, server.js, Interswitch, Vercel deployment |

---

*SUWE — Built for the market. Built for Nigeria.*
