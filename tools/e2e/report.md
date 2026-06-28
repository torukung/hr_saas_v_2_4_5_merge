# Adeptio Adaptive HR — Platform UI v2.3.2.db · E2E Test & Remediation Report

**Target:** `https://torukung.github.io/hr_saas_v_2_3_2_db/` (deployed) · fixes verified against the **local source** (served locally)
**Engine:** Playwright + real Chromium (headless) · client-rendered SPA driven through the browser, not curl
**Suites:** [`e2e.mjs`](e2e.mjs) (full crawl) · [`exports-test`](exports-test.mjs) · [`groupb`](groupb-test.mjs) · [`groupc`](groupc-test.mjs) · [`groupd`](groupd-test.mjs) · [`groupe`](groupe-test.mjs) · raw crawl data in [`results.json`](results.json)
**Date:** 2026-06-12 (audit 2026-06-11 → remediation 2026-06-12)

---

## TL;DR

The **initial E2E audit found zero functional defects** across 172 routes and all 5 personas. The only findings were a URL/scope item (S1) and a family of placeholder "toast-only" buttons that looked interactive but did no real work (S2 + S3). Those placeholders have now been **remediated in five passes (Groups A–E)** and each fix verified by a dedicated re-runnable test.

| Status | Result |
|---|---|
| Initial audit — functional defects | **0** (172 routes, 0 console errors, 9/9 flows persisted, 12/12 robustness) |
| Stub buttons identified (S2+S3) | 52 toast-actions + the Lao toggle |
| **Now wired to real, persisted work** | **44 verified** (+ a mobile twin & a conditional clone) |
| **Honestly deferred** (greyed "build-phase" affordance) | **9 verified** |
| Group test results | **A 10/10 · B 13/13 · C 11/11 · D 10/10 · E 9/9** |
| Regression (structural `smoke.js`) | **ALL CHECKS PASS** (172 screens) · 0 console errors anywhere |

> ⚠️ **Pending deploy.** All remediation lives in the **local source**. The live `hr_saas_v_2_3_2_db` GitHub Pages site still serves the old toast-only build until the source is pushed/redeployed. The group tests therefore serve the local files; re-run them post-deploy by pointing `e2e.mjs` at the live URL.

---

## Remediation — stub buttons wired up (Groups A–E)

Each previously-inert `toast:` button now either performs a **real, persisted write to a DB store** (re-verified after a full page reload) or, where there is genuinely nothing to back it yet, is shown as an **honest greyed "build-phase" affordance** with a tooltip.

| Group | Buttons | What they do now | Stores touched | Verified |
|---|---|---|---|---|
| **A — Exports** | 10 | Generate real CSV/JSON file downloads (payslips, tax, requests, team, org chart, variance, exceptions, board pack, GDPR "my data") | reads all stores → Blob | **10/10** |
| **B — Documents & templates** | 13 | Generate `DOC-####` records (incl. bulk Finance ×3, contract renewals ×3); publish / preview / clone templates | `db_docs`, `db_comms.templates` | **13/13** |
| **C — Workflow state-changes** | 11 (+1 twin) | Open/approve profile change, delegate, route-to-finance, acknowledge policy, coach, escalate, note, remind, role-approve, ledger-adjust | `db_workflow`, `db_docs`, `db_audit`, `db_comms` | **11/11** |
| **D — Communication** | 10 | Nudge, publish schedule, per-gateway test sends, test-all, reconnect, add channel, new template | `db_comms` (messages/channels/templates) | **10/10** |
| **E — Honest deferrals** | 9 | Greyed `.soon` + tooltip + honest toast; **write nothing** (auto-approve, duplicate week, holiday calendar, edit mode, CEO request, fallback editor, integration catalog, Lao variant, **Lao language toggle**) | none (inert) | **9/9** |

Notes:
- The mobile-queue **"Post"** (TC-0109) button shares Group C's `wf-ledger-adjust` handler with its web twin.
- The **"Clone as custom"** button (only renders on already-published templates) was found during remediation and also wired (Group B).
- Genuinely functional file actions that already worked (report/audit CSV, backup JSON) were left intact.
- Each group has an npm script: `npm run test:exports | test:groupb | test:groupc | test:groupd | test:groupe`.

**Verification method:** every write is asserted in the live DB store **and re-checked after `page.reload()`** (proving real `localStorage` persistence); Group E asserts the button is greyed, tooltipped, and appends **nothing** to the audit ledger. All runs: **0 console errors**.

---

## S1 — ⚠️ Process / scope: the URL in the task body points at a *different, older app* (unchanged)

The task body said test `https://torukung.github.io/hr_saas_v_2_3/`, which is **not** this project:

| URL | `<title>` | DB stores? | Reports / dbviews? | Persistence? |
|---|---|---|---|---|
| `…/hr_saas_v_2_3/` | *Platform UI v2.3* | **No** | No | No (in-memory only) |
| `…/hr_saas_v_2_3_2_db/` ✅ tested | *Platform UI v2.3.2.db* | **Yes (10 stores)** | Yes | Yes (localStorage per tenant×store) |

The brief's requirements ("verify data persisted in the DB stores", "extend the smoke test in `tools/`") only exist in `v2.3.2.db`. Confirmed with you; all work targets `hr_saas_v_2_3_2_db`.

---

## S2 — ✅ RESOLVED: the Lao (ລາວ) language toggle

**Was:** a non-functional toggle on all 86 screens that toasted "staged" without switching language.
**Now:** greyed `.soon` affordance with tooltip *"Lao language pack staged for the build phase."* It no longer pretends to be active. (Wiring the actual `js/i18n.js` Lao strings remains a build-phase task.) — *Group E, verified.*

---

## S3 — ✅ RESOLVED: ~50 placeholder action buttons

**Was:** a family of buttons that showed a success toast without producing an artifact or state change.
**Now:** every one is either a **real persisted action** (Groups A–D, 44 verified) or an **honest greyed deferral** (Group E, 9 verified). The complete original inventory remains enumerated in [`results.json → stubActions`](results.json); after remediation only the 8 intended Group-E deferrals remain as `toast:` actions (all greyed + tooltipped), confirmed by a source scan.

---

## S4 — ℹ️ Informational: Essential-tier persona gating (unchanged, expected)

On **Essential**, CEO and System Admin personas correctly redirect to the launcher (R4 tier-gate), exercised fully on **Professional**. Not a broken route — documented so it isn't mistaken for one.

---

## What the initial audit verified to *work*

### 1. Route crawl — 172 routes, zero defects
All 5 personas × {web, mobile} × every screen × {Essential, Professional}: app rendered, `<h1>`/title present, no token leaks, **no console/page errors**, and **every `data-go` target resolves**.

| Tier | staff | manager | hr | ceo | sysadmin |
|---|---|---|---|---|---|
| Essential | 20 | 16 | 20 | 13* | 17* |
| Professional | 20 | 16 | 20 | 13 | 17 |

<sub>*CEO/SysAdmin on Essential render the launcher via the tier gate (S4); they render fully on Professional.</sub>

### 2. Primary user flows — persisted across reload
Staff submit-request `LV-0489` + clock punch; Manager approve `LV-0481`; HR hire `EMP-0250` (+ auto `db_leave` balance) + advance `PR-2026-06` + broadcast; SysAdmin db-add (`db_people` 32→33) + backup/restore round-trip; Reports generate `RPT-1011`. All re-read from `localStorage` after reload. ✅

### 3. Robustness — 12/12
Bogus detail params, unknown personas/devices/screens, and cold deep-links all handled gracefully (no throw, no leak, safe fallback).

### 4. Responsive
`0 px` horizontal overflow at 390×844.

---

## Screenshots

The harness writes a PNG **automatically for every failure**. The audit run had **zero failures**, so `screenshots/` holds only proof-of-run evidence:

- [`screenshots/02-evidence_launcher_pro.png`](screenshots/02-evidence_launcher_pro.png) — launcher, Professional tier
- [`screenshots/03-evidence_ceo_board.png`](screenshots/03-evidence_ceo_board.png) — CEO board renders
- [`screenshots/04-evidence_sysadmin_dbstore.png`](screenshots/04-evidence_sysadmin_dbstore.png) — SysAdmin DB console
- [`screenshots/01-responsive_390_staff_mobile_home.png`](screenshots/01-responsive_390_staff_mobile_home.png) — mobile, no overflow

---

## How to re-run

```bash
cd tools/e2e && npm install && npx playwright install chromium

# full crawl + flows + robustness (defaults to the deployed site)
npm run test:e2e
node e2e.mjs <baseUrl>

# remediation group tests (serve local source; override root with ADEPTIO_ROOT=<repo>)
npm run test:exports   # Group A
npm run test:groupb    # Group B
npm run test:groupc    # Group C
npm run test:groupd    # Group D
npm run test:groupe    # Group E

# structural / sync smoke (node, no browser)
npm run test:smoke
npm run test:sync
```

See [`README.md`](README.md) for how this layers on top of `tools/smoke.js` and `tools/sync-smoke.js`.

## Coverage boundaries (full disclosure)

- Remediation was verified against the **local source served locally**; the deployed site reflects these fixes only **after a redeploy**.
- The full `e2e.mjs` crawl was run against the deployed (pre-remediation) build; re-run it against the live URL after deploy to fold the wired buttons into the 172-route crawl.
- "Mobile" = the app's own `device=mobile` route (phone-frame render) plus one real 390px viewport pass — not a full device matrix.
- Demo data is reset (localStorage cleared) between test runs for deterministic assertions; the live site is unaffected.
