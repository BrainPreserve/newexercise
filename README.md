# Brain Health Exercise App — Starter (From Scratch)

This repository is a clean, minimal, **from-scratch rebuild** that:
- Reads your **`data/master.csv` exactly** (no guessing).
- Provides **Plan**, **Exercise Library**, **Progress (placeholder)**, **Ask the Coach**, **Data**, **Settings** tabs.
- Implements **combined filters** in Library: Exercise Type(s) + Goal(s).
- Shows **protocol_start**, **progression_rule**, **contraindications_flags**, and a **Details** section (direct/indirect cognitive benefits, mechanisms, safety notes, equipment) for each protocol.
- Offers **AI Coaching** via a Netlify Function (`/.netlify/functions/coach`) using `OPENAI_API_KEY`, with a **deterministic fallback** (rules-based) when the key is absent.

## Quick Start (Novice‑friendly)

### 1) Create a new private GitHub repo
1. Go to GitHub → **New repository** → Name it: `brain-exercise-app` → **Private** → Create.
2. On your computer, download the ZIP of this starter and unzip it.
3. Drag all files/folders into your local repo folder, then commit and push to GitHub.
   - Files you should see at the top level:
     - `index.html`
     - `netlify.toml`
     - `assets/styles.css`
     - `assets/app.js`
     - `data/master.csv`
     - `netlify/functions/coach.js`

### 2) Netlify: New site from Git
1. In Netlify → **Add new site** → **Import from Git** → Select your GitHub account → pick `brain-exercise-app`.
2. **Build settings:** No framework build is needed.
   - **Base directory:** (leave empty)
   - **Build command:** (leave empty)
   - **Publish directory:** `.`
   - **Functions directory:** auto‑detected from `netlify.toml`
3. After deploy succeeds, open the site.

### 3) Add your API keys (optional for AI)
1. Netlify Site → **Site settings** → **Environment variables**.
2. Add `OPENAI_API_KEY` with your key value (and `SERPAPI_KEY` later if needed).
3. **Deploy → Trigger deploy → Clear cache and deploy site** (so the function sees the new env var).

### 4) Validate
- **Library filters:** Select **Exercise Type(s)** and **Goal(s)** together → You should see only matching rows.
- **Plan:** Enter safety inputs (SBP, HRV delta, Sleep efficiency, CGM TIR) → Click **Generate Today’s Plan**.
- **Card → AI Coaching:** Click the **AI Coaching** button → If key present, LLM response. Otherwise, deterministic fallback.
- **Ask the Coach:** Enter a question → server function responds (AI if key is set).

## Important Notes
- **No inline JavaScript.** All JS is in `assets/app.js` → CSP‑friendly.
- **CSV fidelity:** We do not alter or infer missing fields. If a column is absent, that value shows as `—`.
- **Where to add logic next:** The gating rules live in `assets/app.js` (`gatesAdvice`). Update safely there.

---

© BrainPreserve (Larry). For older adults’ brain health coaching MVP.
