# Adeptio edge auth Worker — v2.4.1.edge.auth (B1 · B2 · B3 · B4)

The **server-authoritative** identity service. When the SPA's `auth_mode` is **remote**, sign-in
runs here: the Worker owns the credentials (**Argon2id** in **Turso**), binds **LDAP/AD** and
**RADIUS** over `connect()`, and returns an **httpOnly** session cookie. The browser never sees a
password hash — that is the custody flip from the v2.4.0 demo.

> Status: written to spec and unit-tested for the byte-level LDAP/RADIUS logic
> (`test/contract-test.mjs`). The socket + Argon2id paths run in the Workers runtime, so they are
> proven at **deploy** (the `/__seed` + `/__mailtest` self-checks and a real bind), not in this
> sandbox (which has no outbound network and can't `npm install`).

## File map

| File | Role |
|---|---|
| `src/index.js` | Router — the 8 auth endpoints + mode switch + import + guarded `/__seed` & `/__mailtest`, CORS |
| `src/turso.js` | libSQL HTTP client — the authoritative `accounts·sessions·tokens·audit` store |
| `src/argon2.js` | Argon2id hash/verify (hash-wasm) + transparent re-hash from the v2.4.0 SHA-256 seeds |
| `src/sessions.js` | httpOnly/Secure/SameSite cookie + id helpers |
| `src/ldap.js` · `src/ldap-ber.js` | LDAPS simple bind over `connect()` (B3); BER encoder/parser split out + unit-tested |
| `src/radius.js` · `src/radius-packet.js` | RadSec Access-Request over `connect()` (B4); PAP packet split out + unit-tested |
| `src/mailer.js` · `src/mail-relay.js` · `src/templates.js` | SMTP-over-`connect()` + the relay interface + 5 bilingual templates |
| `wrangler.toml` | Vars + secret notes | `.github/workflows/deploy-worker.yml` | deploy-on-push (D6) | `test/contract-test.mjs` | runnable checks |

## Endpoints

| Method · Path | Body | Does |
|---|---|---|
| `POST /auth/verify` | `{email,password}` | Verify by mode (Argon2id · LDAP bind · RADIUS) → set session cookie |
| `GET  /auth/me` | — | Current session profile (no hash); enforces 30-min idle |
| `POST /auth/signout` | — | Drop the session, clear the cookie |
| `POST /auth/invite` | `{email,name,scope}` | Invited account + invite mail (72 h) |
| `POST /auth/activate` | `{token,password}` | Set a local password (Argon2id), activate |
| `POST /auth/reset/request` | `{email}` | Reset mail — no account enumeration |
| `POST /auth/reset/complete` | `{token,password}` | Set a new local password |
| `POST /auth/set-password` | `{token,password}` | Finish a directory→local switch |
| `POST /auth/mode` | `{email,mode}` | Switch credential mode (B2) |
| `POST /provision/import` | `{rows,mode}` | Bulk create / link (B5 seam) |
| `POST /provision/provider` | `{id,type,host,baseDN,…}` | Author the real LDAP/RADIUS connection (admin session; **non-secret only**) |
| `POST /__seed` | header `x-seed-token` | Seed the demo roster as Argon2id (first deploy) |
| `POST /__mailtest` | header `x-mailtest-token` | Prove SMTP end-to-end |

Fail-closed: if a directory is unreachable the verify returns `503 directory_down` (D2) — the
**break-glass** local admin (`sysadmin@`, pinned to a local password) is the only door that stays open.

## Deploy

```bash
cd worker
npm install                      # hash-wasm
wrangler secret put TURSO_TOKEN
wrangler secret put PASSWORD_PEPPER
wrangler secret put RADIUS_SECRET        # if using RADIUS
wrangler secret put SMTP_USER            # adeptio.stage@gmail.com
wrangler secret put SMTP_PASS            # 16-char Gmail App Password (2FA required)
wrangler secret put MAILTEST_TOKEN
wrangler secret put SEED_TOKEN
wrangler deploy                  # or just push to main — the Action deploys
```

Then seed + self-check:

```bash
curl -X POST "https://adeptio-auth.<sub>.workers.dev/__seed"     -H "x-seed-token: <SEED_TOKEN>"
curl -X POST "https://adeptio-auth.<sub>.workers.dev/__mailtest?to=you@example.com" -H "x-mailtest-token: <MAILTEST_TOKEN>"
```

## Wire the SPA to it

1. In the SPA, set `js/api-config.js` → `base: "https://adeptio-auth.<sub>.workers.dev"`.
2. Set the Worker's `ALLOWED_ORIGIN` var to the SPA origin (Pages/custom domain) — CORS + link base.
3. In the app, flip **auth_mode → Edge Worker** (Sys Admin → Directory providers, or the launcher chip).
   Sign-in now verifies at the edge; `auth_mode=local` keeps the in-browser simulator for offline demos.
4. **Configure the real server** in **Sys Admin → Directory providers**: edit host / transport / base DN / user-DN
   template and **Save config** — in Edge mode this POSTs `/provision/provider` (admin session) and the next
   bind uses it **live, no redeploy**. Only the **bind secret** needs a deploy step (`wrangler secret put RADIUS_SECRET`);
   LDAP/AD verify binds as the user, so it needs no service-account secret for the baseline.

## Turso (already provisioned)

`adeptio-hr-v241` is live (`TURSO_URL` is set in `wrangler.toml`). The Worker creates its own schema
on first request and uses its own tables, distinct from the browser sync's `*_*` groups — no collision.
Put the **full-access token** in the `TURSO_TOKEN` secret (never in the repo).

## LDAP / RADIUS notes

- **AD**: leave `LDAP_USER_DN_TEMPLATE` empty → the Worker binds with the **UPN** (e-mail). For generic
  LDAP set a template, e.g. `uid={user},ou=people,dc=phoungern,dc=la`. A service-account search-then-bind
  is the next hardening step; the socket flow is unchanged.
- **RADIUS**: RadSec (TLS/2083) only — Workers can't do UDP/1812 (use a site agent for that). PAP is
  implemented per RFC 2865 §5.2; set `RADIUS_SECRET`.
