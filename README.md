# Adeptio Adaptive HR — Platform UI · v2.4.5 Merged · Single Platform · Single Tenant

> **v2.4.4.edge.auth — the roster lands: one calendar core + Job Schedule & shifts.** Built on the v2.4.3 payroll/OT base (everything below is carried forward unchanged), this revision adds a new **Job Schedule & shifts** area and a **single calendar engine for the whole system**. A new **`db_schedule`** store (store 14) is the roster's only home — **`shift_periods`** (Mon–Sun × 24h, 30-min granularity), **`groups`** (position · division · individual · manual), **`shift_groups`** (period + group, the reusable assign unit), the published **`roster`**, and saved per-account **`views`**. Two new cells own the layer: **`js/schedule.js`** (Schedule cell — the one writer) and **`js/calendar-core.js`** (the read-only calendar lens). The calendar **reads** `db_time` / `db_leave` / `db_overtime` / `db_people` and copies nothing; **division stays a field on the person**; the **shift-swap is a new `SW` type in `db_workflow`** (no new request store) with its own approval flow.
>
> **What's new on top of v2.4.3:**
> - **Job Schedule & shifts area.** A new HR nav group with sub-tabs: **Calendar** (the core), **Shift Control** (object creation), **Staff & Division** (All-staff + per-division tabs, Create Division, assign — writes `db_people`), **Shift Management** (per-day **Shift-CAP** + HR/Manager multi-status filter Leave/OT/Sick/Name/Division + a data-summary rollup), **Shift swaps** (approval queue), **Backup/Restore** (area-scoped, one store = one blast radius), and **Plug-in Connector** (external-calendar / capture-actuals / 3rd-party rostering manifest — live connectors are build-phase stubs).
> - **One calendar core.** `js/calendar-core.js` renders every persona/view from one engine via a perspective setting (**people · date · week · month · shift · job**) with a **saved per-account view profile**. Month is the standard view with a quick-view strip (total · Active · Leave · Available); click a **week number** to expand to an **hour-split** working-hour view; **drag-and-drop** labelled pastel chips (HR/Manager); read-only for Staff.
> - **Shift Control objects.** Shift Period (Mon–Sun × 24h, 30-min gap), Group of People (position/division/individual/manual), Shift Group (period + group, with a capacity).
> - **Roles.** HR creates & manages every division · Manager runs the calendar, manages groups/assignment and approves swaps but **cannot create shifts** · Staff sees their shifts and files a **swap request** (under Requests) · CEO sees aggregate coverage · Sys Admin gets the connector + `db_schedule` in DB studio/backup/sync.
> - **The swap loop.** Staff files a swap → `SW` row in `db_workflow` → new approval flow → Manager approves → `SCHEDULE.onRequestApproved` rewrites the roster → every lens syncs.
> - **Tier.** Scheduling rides the existing flags (no new gates). Live external-calendar / 3rd-party connectors stay build-phase stubs behind a real manifest, matching how PDF/email are labelled.
>
> Verify: `node tools/smoke.js .` renders **274 screens** on both tiers; the v2.4.x suites (`auth-smoke` · `edge-smoke` · `portal-smoke` · `sync-smoke` · `contract-test` · `punch-test`) still pass — **store count → 14**, **sync stores → 13**, `db_identity` still custody-excluded. Eyeball the calendar in `tools/preview-schedule.html` (real `tokens.css` + `app.css` + `schedule.css`, container-query adaptive, overlap-safe).
>
> ---
>
> **v2.4.3.edge.auth — payroll grows up: overtime quotas, NSSF/PIT & a real HR payroll desk.** Built on the v2.4.2 biometric/gate base (everything below is carried forward unchanged), this revision turns the single Payroll nav item into a full **Payroll area** and adds the money math the blueprint promised. A new **`db_overtime`** store (store 13) holds **per-division OT quotas** (monthly + yearly) with used/remaining hours and the Lao **OT-rate policy**; **`db_payroll`** grows two tables — **`components`** (allowance/OT/misc per person, derived from `db_people`) and **`tax_config`** (NSSF + PIT carrying the Lao statutory baseline). Two new cells own them: **`js/overtime.js`** (OT cell) and **`js/payroll.js`** (Payroll cell). Currency is Lao Kip (₭) throughout.
>
> **What's new on top of v2.4.2:**
> - **HR → Payroll group.** Pulled out of "Modules" into its own nav group with sub-tabs: **Dashboard** (remittance-deadline countdown — the 15th of the following month, Lao rule — plus alerts and over-quota leave/OT), **Pay runs** (the v2.4.2 draft→disburse flow, preserved), **Staff pay** (the by-division list of allowance/OT/misc with per-division sums and **save · load · export · import** by selectable division, real CSV/JSON), **Pay slips** (per-month sum, download one or **ZIP all** via an inlined store-only zip, delivery schedule), **Overtime** (segmented **Approvals** | **Quota management** — split by division with use/remaining meters and per-division limit setting, monthly & yearly), and **Tax & NSSF** (PIT brackets + NSSF rates, editable, with a **compliance badge** vs the statutory baseline).
> - **The OT quota loop.** Approving an Overtime request (Manager L1 → HR) consumes the division's live quota in `db_overtime`, raises the Dashboard over-quota alert when a division runs over, and feeds the payroll OT line — one `db_workflow` row, visible to Staff history, the Manager Overtime tab and the HR OT desk.
> - **Manager → Approvals, split into tabs.** The L1 queue gains **All · Leave · Overtime · Claims · Corrections** tabs (URL-addressable); Overtime rows show the team's division quota remaining inline.
> - **Staff → deeper requests.** *Make new request* gains active deeper menus for **Leave** (sub-type → dates → live balance) and **Overtime** (date → hours → live division-quota check), and the request filter chips are wired. All four request types are kept, so cross-persona data stays in sync.
> - **Tier.** Payroll/OT/Tax ride the existing flags (no new gates). PDF payslip render and email dispatch stay build-phase stubs (CSV download + ZIP work today), matching how v2.4.2 labels them.
>
> Verify: `node tools/smoke.js .` renders **226 screens** on both tiers; the v2.4.x suites (`auth-smoke` · `edge-smoke` · `portal-smoke` · `sync-smoke` · `contract-test` · `punch-test`) still pass — **store count → 13**, **sync stores → 12**, `db_identity` still custody-excluded.

> **v2.4.2.edge.auth — clock-in/out grows hands: biometric terminals & gates.** Built on the v2.4.1 edge-identity base (everything below is carried forward unchanged), this revision adds the physical-capture layer the blueprint promised. A new **`db_devices`** store (store 12) registers attendance hardware from **seven vendor families** across **three integration lanes** — straight from the Vientiane *Hardware Market Brief* — and a new **Devices cell** (`js/devices.js`) owns the registry, the rolling telemetry, and the **capture groups** that bind a person to a clock-in/out **methodology**. Punches still land in `db_time` (one truth); this store holds the registry, not the attendance. Device passwords / API keys are **vault refs** — never stored — exactly like the LDAP/RADIUS bind secrets (the custody flip).
>
> **What's new on top of v2.4.1:**
> - **Vendor catalogue + lanes.** ZKTeco *(Lane A · PUSH/ADMS → `/punch`)* · Hikvision & Dahua *(Lane B · ISAPI / HTTP API pull)* · Sunmi *(Lane C · on-device PWA)* · HIP *(Lane C · CSV import)* · Suprema & Anviz *(Lane B · premium cloud)* · **Custom** *(signed webhook → `/punch`)*. Each connector declares its **required parameters** (SN / comm-key, host / port / creds, API keys, HMAC secret…) and an optional **AD / RADIUS identity bind** that resolves device users to the edge directory.
> - **Sys Admin → Devices.** A new nav group: **Device monitor** (a dashboard — API connectivity / status grid + a **5-minute-frame time-series of clock-in/out volume** + capture mix + event log), **BioMetrics** (the fleet + the vendor catalogue + add-device wizard + per-device config with the AD/RADIUS toggle, test-connection & remove), and **Gates & access** (turnstiles · doors · barriers as access points downstream of a reader → controller → lock, with state controls).
> - **HR → Clock-in/out.** Create **capture groups**, select staff into each, and pick a **methodology per group** — Biometric (face/finger) · Card/RFID · Gate/Access · Mobile (GPS+selfie) · Web · Device PIN — with never-block fallbacks. The Time & Attendance board's capture sources now read live.
> - **Staff / Manager / CEO sync.** Staff see *how they clock in* (their group's method + device); the Manager board gains a **device-down banner**, a per-member **"Clocks via"** column and a capture card; the CEO board gains an **attendance-capture coverage** chart + a **device-fleet uptime** donut.
> - **The edge Worker grows a `/punch` seam** (`worker/src/punch.js`, deploy-ready, unrun) — ZKTeco PUSH/ADMS ingestion (tab-delimited ATTLOG → normalized punch) and an HMAC-verified custom webhook; Lane-B vendors are explicitly *pulled*, not pushed.
> - **Tier split (Pro + Enterprise).** Device capture + biometric terminals unlock at **Professional**; gates, cloud OpenAPI and the custom webhook are **Enterprise**. The greyed `auth.bio` / `auth.door` roadmap rows are now **built** and point at the new screens (just as LDAP/RADIUS were un-greyed in v2.4.1). Nav items stay reachable so the whole flow demos on Professional (preview-locked-features pattern).
>
> Verify: `node tools/smoke.js .` renders **214 screens** on both tiers; `node worker/test/punch-test.mjs` proves the ADMS parse + HMAC verify; the v2.4.1 suites (`auth-smoke` · `edge-smoke` · `portal-smoke` · `sync-smoke` · `contract-test`) still pass (store count → 12, sync stores → 11, `db_identity` still custody-excluded). Eyeball the design in `tools/preview-v242.html` (real `tokens.css` + `app.css`, Atelier Pastel parity).

> **v2.4.1.edge.auth — the front door grows an edge identity.** Built on the v2.4.0.db.auth portal, this revision lands the blueprint's **B0–B7 baseline**: one account can prove itself by **local password, company LDAP/AD bind, or RADIUS — switchable both ways** — with **file-import** and **directory delta-sync** provisioning, all demoable in-browser on a **directory simulator**, and a **deploy-ready Cloudflare Worker** that makes credentials **server-authoritative** (LDAPS/RadSec via `connect()`, **Argon2id**, httpOnly sessions, Turso `adeptio-hr-v241`).
>
> **What's new on top of v2.4.0:**
> - **B0 · `auth_mode`** — one kernel flag picks the identity authority: `local` (in-browser simulator, offline-safe demo) or `remote` (the edge Worker). `login()` is a dispatcher; the **local path is byte-identical to v2.4.0** (B7 gate).
> - **B2 · credential mode per account** — `local | ldap | radius`, switchable both ways: *local→directory* purges the stale hash on first successful bind (never dual-accept); *directory→local* mails a **set-password** link and holds the account *pending* (works even when AD is dead). **Break-glass** admin is pinned to local. Fail-closed on outage (D2).
> - **B3/B4 · providers** — LDAP/AD + RADIUS connection panel (no secrets stored — vault refs), a **test-bind** + **simulate-outage** toggle, and the **directory simulator** that answers binds in demo mode.
> - **B5 · provisioning** — **CSV/Excel import** (dry-run preview, dupe-by-email, mode per batch) and read-only **LDAP/AD delta sync** (create · link · suspend in a **review queue**; conflicts held), writing `import_jobs` / `sync_runs`. Attributes flow, credentials never do.
> - **B1 · the edge Worker** (`worker/`) — 8 auth endpoints + mode/import, Argon2id with **transparent re-hash** from the v2.4.0 SHA-256 seeds, httpOnly sessions, **Turso-authoritative** (the *custody flip*: the browser never pushes `db_identity` to the cloud).
>
> Carried decisions: **D1** LDAP/RADIUS = **Pro** (now *built*, un-greyed), SSO/SCIM = **Ent** (still greyed). **D2** fail-closed + break-glass. **D3** min-8 policy. **D5** Road A. **D6** GitHub-anchored (repo/Pages/Actions; API = Workers, deploy-on-push). **D7** Argon2id. **D8** SSO open.
>
> Everything from v2.4.0.db.auth is carried forward unchanged: the persona-page-first portal, the `auth_portal` front-door flag, the demo outbox, identity console, My security, 11 split stores, backup ladder, Turso hybrid sync, tier toggle (R4 — flags, not forks).

**One flag rules it**: `auth_portal` (kernel, `db_platform.flags`), surfaced as the **Front door** control — a two-option segment, **Sign-in / Open demo**, visible in four places: the sign-in page footer, the landing page's auth section, the identity console, and (when the wall is down) a **Portal off** chip in the topbar plus a re-arm card on the persona page. **Sign-in** (default) → the persona page still lands first, but entering a persona raises the wall; the username decides the landing; persona chips become the scope switcher. **Open demo** → no wall anywhere, while accounts/sessions/policies stay live underneath — flip back any time from the launcher.

## Demo accounts (D4 — printed on the portal strip too)

| Persona | Accounts | Password | Scopes |
|---|---|---|---|
| Staff | `staff@phoungern.la` · `staff2@phoungern.la` | `staff123` | staff |
| Manager | `manager@phoungern.la` · `manager2@phoungern.la` | `manager123` | manager + staff |
| HR | `hr@phoungern.la` · `hr2@phoungern.la` | `hr123456` | hr + staff |
| CEO | `ceo@phoungern.la` · `ceo2@phoungern.la` | `ceo123456` | ceo *(Pro tier)* |
| Sys Admin | `sysadmin@phoungern.la` · `sysadmin2@phoungern.la` | `sysadmin123` | sysadmin *(Pro tier — HR doubles on Essential)* |

Plus one invite in flight: `davone@phoungern.la` (pending activation — its 72 h link is sitting in the demo outbox). Passwords are stored as salted SHA-256 in `db_identity`; plain passwords and tokens never touch a store or the audit ledger (never-log list).

## The portal — persona page first, one frame per persona

Opening `index.html` lands on the **persona page** (persona cards, persona menu + tier toggle on top) with the **sign-in section right below the five cards** — signed out you get the five pre-filled frames inline; signed in it becomes a session bar (open workspace · My security · sign out). Entering a persona without a session still raises the full sign-in wall — the same frames on a soft persona-tinted wash:

- **One frame per persona**, demo account and printed password **pre-filled** — one click signs in
- The account list per frame includes **every account created later** through HR → Access (new users appear automatically; pick one and type its own password)
- **← Persona page** link returns to the landing; the wall rises again on the next persona entry
- After sign-in you see **only your own scopes** (chips lock outside them) but the **tier toggle stays** to preview locked features; sign-out returns to the login page

## The auth walk (Blueprint v2.5 §3 — demo ritual)

1. **Portal** — open the app → persona page → enter a persona → its frame is focused with credentials pre-filled (D4); click Sign in. Wrong password ×5 → **15-min lockout with live countdown** + a lockout mail in the outbox.
2. **HR → People → person → Access card** — switch access **on** (e-mail required at that moment, role from the persona) → invite mail lands in the **demo outbox** with a 72 h activation link.
3. **Outbox → open link → Activate** — set a password against the **live policy meter** (min 8, D3) → account flips to active → sign in.
4. **HR → Access & invites** — pending list (resend / revoke), **invite funnel** and **never-signed-in** adoption tiles. On Essential this page also carries the full console (HR doubles); on Pro it points to Sys Admin.
5. **Sys Admin → Identity console** — status-filtered directory, last sign-in, inline **resend / unlock / force-reset / revoke**, live sessions, the **Security roadmap** (greyed rows: LDAP/RADIUS `Pro` · MFA · SSO `Ent` · door · biometrics · SCIM `Ent`) and the `auth_portal` flag.
6. **Any persona → My security** — change password, see sessions, revoke others, sign out.
7. **HR → person → Offboard** — the account is disabled, sessions revoked, mail sent: the door key goes with the desk.
8. **Sys Admin → Database studio → `db_identity`** — store 11 on the ladder; back it up, restore it: accounts come back, **sessions/tokens never do** (custody fact lands on the ledger).

`?tier=professional` still sets the tier flag at load; `ceo@`/`sysadmin@` sign-ins on Essential demo the tier pitch instead of landing.

## The edge-identity walk (v2.4.1 · B0–B6, all in-browser)

Switch on **Pro** first (CEO/Sys Admin personas). Everything below runs on the **directory simulator** with `auth_mode = Simulator` — no server needed.

1. **HR → person → Access card** — the **Sign-in method** switch: flip Souksavanh from *Local password* to *LDAP / AD*. The old password stops working; the **company directory password** (`directory123`) now signs them in via the simulator, and the stale local hash is purged on that first bind. Flip back to *Local* → a **set-password** link lands in the outbox (it works even if AD is down).
2. **Sys Admin → Directory providers** — the LDAP/AD + RADIUS panel (host, base/bind DN, **vault ref** for the bind secret — never stored). **Test bind**, or **Simulate outage**: directory sign-ins now **fail closed** (D2), while the **break-glass** local admin (`sysadmin@`) still gets in. The **directory simulator** lists company accounts; disable one and the next sync proposes a *suspend*.
3. **HR → Import accounts** — paste a CSV (or **Load sample**) → **Dry-run** shows create / link / dupe / error per row, nothing written → **Commit**. Local rows get an invite; LDAP/RADIUS rows bind the directory. A result notice lands in the outbox.
4. **Sys Admin → Directory sync** — **Sync Active Directory** → a **review queue** of create · link · suspend proposals; the *imposter* row (an address already held by another person) is held as a **conflict**, never auto-applied. Approve/skip each → **Apply**.
5. **auth_mode → Edge Worker** — flip the authority. With the Worker deployed and its URL in `js/api-config.js`, sign-in now verifies at the edge (real LDAPS/RadSec bind + Argon2id, httpOnly cookie); the topbar shows **· edge**. With no URL set it stays on the simulator and tells you so.

## Run / deploy

**Front end** — local: double-click `index.html` (file:// safe — data persists per browser; `auth_mode=local` keeps it offline). GitHub Pages: push the folder, Settings → Pages → deploy from branch → root (`.nojekyll` included).

**Edge Worker** — `cd worker`, set the secrets, `wrangler deploy` (or push to `main` — the Action deploys). Then `POST /__seed` (Argon2id roster) + `/__mailtest`. Point the SPA at it via `js/api-config.js` and flip `auth_mode → Edge Worker`. Full steps in `worker/README.md`.

Verify (all offline, no network):

```bash
node tools/smoke.js .        # renders 196 screens both tiers + data-layer integrity
node tools/auth-smoke.js .   # B7 gate — local invite→activate→login×10→reset→lockout→
                             # unlock→custody→offboard→flag, byte-identical to v2.4.0
node tools/portal-smoke.js . # boots the whole app in a mini-DOM and clicks the flow
node tools/edge-smoke.js .   # B0–B6 — auth_mode · mode-switch both ways · simulator login
                             # · fail-closed+break-glass · set-password · import · delta-sync
                             # (+conflict/suspend) · never-log · screens · remote adapter
node tools/sync-smoke.js .   # Turso layer + the custody flip (db_identity never syncs)
node worker/test/contract-test.mjs   # LDAP BER bind/parse + RADIUS PAP round-trip
node tools/make-preview.js . # writes tools/preview-edge.html — the new screens, real CSS
```

## Cloud sync (Turso) — optional, hybrid offline-first

Same engine as before for the operational stores (`js/turso-config.js` points at the v2.4.1 DB `adeptio-hr-v241`). **The custody flip (B1):** `db_identity` is now **server-authoritative** — the edge Worker owns the credentials, so the browser **never pushes or pulls `db_identity`** over its token (guarded in `enqueue`/`flush`/`pull`). Only the ten operational stores ride the browser sync; sessions, tokens and the directory simulator never leave the device in any mode.

## The database, in 60 seconds

| Store | Layer | Holds | Writer |
|---|---|---|---|
| `db_people` | L-OP | employees · divisions | People cell |
| `db_time` | L-OP | punches | Time cell |
| `db_leave` | L-OP | leave types · balances | Leave cell |
| `db_workflow` | L-OP | the shared-ID request ledger (LV/OT/EX/TC) | Workflow cell |
| `db_payroll` | L-OP | payslips · pay runs · **components · tax_config** (v2.4.3) | Payroll cell |
| `db_comms` | L-OP | templates · channels · sent log (incl. **auth mails**) | Comms cell |
| `db_docs` | L-OP+L-CU | document metadata (Growth+ — lazily provisioned) | Docs cell |
| `db_audit` | L-OP→L-CU | append-only facts (now incl. `auth.*`) | Event bus |
| `dw_reports` | L-DR | org snapshots · series (derived — rebuilds by replay) | Projector |
| `db_platform` | global | placement registry · backup policies · drills · **flags** (`auth_portal` + roadmap rows) | Kernel |
| **`db_identity`** | **L-OP** | **accounts · sessions · tokens · policies · providers · import_jobs · sync_runs · directory(simulator) — store 11, sensitive custody; credentials server-authoritative on the edge** | **Identity cell** |
| **`db_devices`** | **L-OP** | **devices · gates · groups · events — store 12 (v2.4.2): biometric & gate connectors, capture groups + methodology, rolling telemetry. Device secrets are vault refs (never stored); punches land in `db_time`** | **Devices cell** |
| **`db_overtime`** | **L-OP** | **quotas · policy — store 13 (v2.4.3): per-division OT budgets (monthly/yearly), used & remaining hours, Lao OT-rate policy. Approving an OT request consumes the live quota; the payroll OT line reads from here** | **OT cell** |

## Structure

```
index.html              entry — loads everything, no bundler
css/tokens.css          design tokens (Atelier Pastel + persona accents)
css/app.css             shell styles (+ clean-pastel portal styles at the end)
                          responsive via CONTAINER QUERIES + no-media-query layouts:
                          named containers (topbar · shell · stage · content · panel),
                          12 @container rules, auto-fit/minmax(min(100%,…)) grids,
                          clamp() fluid type/space — zero viewport layout breakpoints
                          (only prefers-reduced-motion remains). The same .grid is 4-up
                          on the desktop workspace and 2-up inside the 384px phone frame
                          beside it, because it measures its container, not the viewport.
js/i18n.js              EN live · ລາວ staged (portal + auth mails ship bilingual already)
js/ui.js                icon set, components, hand-rolled SVG charts
js/db.js                ★ the data layer — 13 stores (db_identity +providers/import_jobs/sync_runs/
                          directory; +db_devices store 12; +db_overtime store 13), custody flip,
                          backup ladder, scheduler, drills, replay
js/api-config.js        edge Worker URL for auth_mode=remote (empty → simulator stays)
js/auth.js              ★ the Identity cell — B0 dispatcher (local·simulator·edge), B2 credential
                          modes both ways, directory simulator, 8 mail templates, remote adapter (node-safe)
js/data.js              DATA — thin lens over DB (offboard now revokes access)
js/provision.js         ★ the Provisioning cell (B5) — CSV import + LDAP/AD delta-sync + review queue
js/devices.js           ★ the Devices cell (v2.4.2) — db_devices (store 12): vendor catalogue + required
                          params per brand, capture groups + methodology, telemetry, 5-min clock series
js/overtime.js          ★ the OT cell (v2.4.3) — db_overtime (store 13): per-division quotas (monthly/
                          yearly), used/remaining, rate policy; approving an OT request consumes the quota
js/payroll.js           ★ the Payroll cell (v2.4.3) — db_payroll +components (allowance/OT/misc by
                          division) +tax_config (NSSF + PIT, statutory compliance baseline); export/import
js/screens/authviews.js ★ portal pages + console/access/outbox/My-security + providers/sync/import/set-password
js/screens/dbviews.js   shared DB-management views
js/screens/staff.js     Staff — ochre        (+ My security)
js/screens/manager.js   Manager — sage       (+ My security)
js/screens/hr.js        HR — blue            (+ Access & invites · Demo outbox · My security · Clock-in/out: groups + methodology · Payroll: dashboard · staff pay · pay slips · OT approvals+quota · tax & NSSF)
js/screens/ceo.js       CEO — plum           (+ My security)
js/screens/sysadmin.js  System Admin — teal  (+ Identity console · Demo outbox · My security · Devices: Device monitor · BioMetrics · Gates & access)
js/app.js               router (portal guard · scope rule · landing-from-username), shells, auth actions
js/app.js               router (+ setpw pre-session view, edge-mode/cred-mode/provision actions)
tools/smoke.js          structural smoke — 226 screens, both tiers (+ device store, OT store, payroll cells, CRUD, tier split)
tools/auth-smoke.js     B7 gate — the §3 walk, byte-identical local, custody & never-log checks
tools/edge-smoke.js     B0–B6 — modes, simulator login, fail-closed, import, sync, remote adapter
tools/sync-smoke.js     Turso layer + the custody flip   ·   tools/make-preview.js  static screen preview
worker/                 ★ the edge auth Worker (B1/B3/B4) — deploy-ready
  src/index.js            8 endpoints + mode/import, CORS
  src/turso.js            server-authoritative store (libSQL HTTP)
  src/argon2.js           Argon2id + transparent re-hash (hash-wasm)
  src/ldap.js · ldap-ber.js     LDAPS simple bind over connect() + unit-tested BER
  src/radius.js · radius-packet.js  RadSec Access-Request + unit-tested PAP
  src/mailer.js · mail-relay.js · templates.js   SMTP-over-connect() relay (bilingual)
  src/punch.js            /punch device-capture ingestion (v2.4.2) — ZKTeco PUSH/ADMS parse + HMAC custom webhook
  wrangler.toml · .github/workflows/deploy-worker.yml   config + deploy-on-push (D6)
  test/contract-test.mjs  LDAP/RADIUS byte-level checks   ·   test/punch-test.mjs  ADMS parse + HMAC verify   ·   README.md  endpoints + deploy
```

Routing, menu depth, the mobile contract and persona boundaries are otherwise unchanged from v2.4.0.db.auth — superseded blueprints live in `Backups/`.
