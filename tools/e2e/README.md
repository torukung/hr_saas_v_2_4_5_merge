# tools/e2e — live-browser end-to-end suite

Real-Chromium (Playwright) E2E test for **Adeptio Adaptive HR — Platform UI v2.3.2.db**.
It complements the existing **structural** smoke tests in `../`:

| Test | Engine | Covers |
|------|--------|--------|
| `../smoke.js` | Node, no browser (`eval`s the screen modules) | renders every screen string, validates routing graph, DB CRUD/backup/report invariants |
| `../sync-smoke.js` | Node + mock libsql | hybrid Turso sync contract |
| **`e2e.mjs` (this)** | **Real Chromium** | console errors, broken `data-go` links in the live DOM, **persistence across a real page reload**, click-driven user flows, bad-route/cold-deep-link robustness, responsive overflow |

`e2e.mjs` deliberately **extends, not duplicates** `smoke.js`: it reuses the same
`PARAMS` detail-screen map and enumerates personas/screens from the live
`window.PERSONAS`, then exercises what a headless string render cannot — the browser,
localStorage round-trips, and real clicks.

## Run

```bash
cd tools/e2e
npm install            # playwright (~few MB) + browser binary (~120 MB, cached in ~/Library/Caches/ms-playwright)
npx playwright install chromium
npm run test:e2e                 # against the deployed GitHub Pages site (default)
# or target a local server:
#   (from repo root)  npx http-server -p 8080
#   npm run test:e2e:local
```

Default target: `https://torukung.github.io/hr_saas_v_2_3_2_db/`
Override: `node e2e.mjs <baseUrl>`

## Outputs

- `results.json` — full structured result (every route, flow step, robustness probe).
- `screenshots/` — a PNG is written **automatically for every failure**; on a green run it
  holds only the responsive + evidence shots.
- `report.md` — human-readable pass/fail report, severity-ordered (regenerate by hand from `results.json`).

## What it checks

1. **Route crawl** — all 5 personas × {web, mobile} × every screen × {essential, professional} tiers (172 routes). Per route: console/page errors, render integrity, `undefined`/`NaN`/`[object Object]` leaks, and every `data-go` target resolves to a real persona/device/screen.
2. **User flows** — staff submit-request + clock, manager approve, HR hire + payroll advance + comms, sysadmin db-add + backup/restore, reports generate. Each write is verified in the DB store **and re-checked after a full page reload** to prove persistence.
3. **Robustness** — bogus detail params, unknown personas/devices/screens, and cold deep-link loads (bookmark/refresh scenario).
4. **Responsive** — horizontal-overflow check at 390×844.
