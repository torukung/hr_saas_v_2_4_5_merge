# Adeptio v2.4.5 Merged — Deploy runbook (T8)

**Shape:** a **static client** (`index.html` + `js/` + `css/` + `.nojekyll`) served by **Cloudflare Pages**, talking to a **Cloudflare Worker** (`worker/src/v245.js`) that owns **D1** (the 15‑store split DB), **KV** (sessions) and **R2** (dated backup folders). Single‑tenant. Local‑first today; this kit makes it live without changing the demo's behaviour.

Repo: `hr_saas_v_2_4_5_merge` · CF account: `Pathom.bot@gmail.com`.

> **What runs where:** I can configure **Cloudflare** for you (create D1, run the migration, make KV + R2, set the bindings, deploy the Worker) using my Cloudflare tools — **after** you push to Git. The **GitHub push** and the **secret values** (App Passwords / API tokens) have to come from you. Then you continue in Claude Code.

---

## Step 1 — Push this folder to GitHub (you)
Push the whole folder to `hr_saas_v_2_4_5_merge` (main). It already contains `.nojekyll`, the client, `worker/`, `wrangler.toml`, `migrations/`, `package.json`, and `.github/workflows/deploy.yml`.

```bash
git init && git add -A && git commit -m "v2.4.5 Merged — full app + deploy kit"
git branch -M main
git remote add origin https://github.com/torukung/hr_saas_v_2_4_5_merge.git
git push -u origin main
```
The CI smoke job runs on push and must stay green (renders all 294 screens). The Worker‑deploy job is gated on the two CF secrets below, so it won't fail before Cloudflare is set up.

## Step 2 — Serve the client on Cloudflare Pages (you, 2 min)
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick `hr_saas_v_2_4_5_merge`.
- Framework preset: **None** · Build command: *(empty)* · **Build output directory: `/`** (it's already static).
- Save & deploy → you get `https://<project>.pages.dev`.
*(Alternative: GitHub Pages — Settings → Pages → Deploy from `main` / root. The `.nojekyll` is already there.)*

## Step 3 — Cloudflare data plane (I do this for you after the push)
Once the repo is up, tell me to go and I'll, via my Cloudflare tools:
1. **D1** — create `adeptio-hr-v245` (or reuse your existing `adeptio-gantt`) and run `migrations/0001_init.sql` (15 store rows + backups/sessions/audit).
2. **KV** — create the `SESSIONS` namespace.
3. **R2** — create the `adeptio-hr-backups` bucket.
4. Hand you the **IDs** to drop into `wrangler.toml` (`database_id`, KV `id`) — or I'll PR them.

## Step 4 — Secrets (you)
Only you should hold these — never commit them:
```bash
wrangler secret put PEPPER              # carried from edge-auth
wrangler secret put SMTP_APP_PASSWORD   # Gmail App Password (mail relay)
wrangler secret put LINE_TOKEN          # LINE OA channel token
wrangler secret put WA_TOKEN            # WhatsApp Cloud-API token
wrangler secret put SMS_KEY             # SMS provider key
```
And add repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (GitHub → Settings → Secrets) so the Action can deploy.

## Step 5 — Deploy the Worker
```bash
npm i
npm run d1:init        # apply the schema (once)
npm run deploy         # wrangler deploy  → https://adeptio-hr-v245.<acct>.workers.dev
```
…or just push to `main` and let the Action do it.

## Step 6 — Point the client at the Worker (Claude Code)
The client persists locally today (`js/db.js`). To go live, set the Worker URL and switch the sync layer (`js/turso-sync.js`) to call:
- `GET/PUT /api/sync/:store` (push/pull each split store)
- `GET/POST /api/backup`, `POST /api/restore/:id` (the BACKUP cell maps 1:1; backups also land in R2 dated folders)
`db_identity` is **server‑authoritative** — the browser never pushes it. This is the one real code change left and is best done in Claude Code with the live Worker URL.

---

## Endpoint map (worker/src/v245.js)
| Route | Purpose |
|---|---|
| `GET /api/health` | liveness + store count |
| `GET /api/sync` · `GET/PUT /api/sync/:store` | pull all / pull · push one store (identity rejected) |
| `GET/POST /api/backup` · `POST /api/restore/:id` | full‑split backup sets ↔ D1 + R2 dated folders |
| `POST /mail` · `/webhook/:ch` · `/punch` | mail / LINE·WA·SMS / device seams (stubs until keyed) |

## Status / honest notes
- ✅ Client is deploy‑ready and smoke‑green (294 screens).
- ✅ D1 schema, Worker, wrangler, Actions, runbook all in‑folder.
- ⚠️ **Stubs to harden in Claude Code:** session auth (Argon2 + KV TTL — scaffolded in `worker/src/sessions.js`/`argon2.js`), the real SMTP/LINE/WA/SMS adapters, and the client sync rewiring (Step 6). The existing `worker/` also carries the Turso edge‑auth path — keep or retire it; D1 is the v2.4.5 target.
- 🚫 No Cloudflare resources were created yet (you asked to hold CF integration) — Step 3 is on me, on your go.
