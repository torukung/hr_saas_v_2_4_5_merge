/* ============================================================
   ADEPTIO · v2.4.1.edge.auth — the resilient data layer + identity
   Blueprint v2.3.2 §02: one small database per tenant × store;
   Blueprint v2.5 §3 step 1: db_identity becomes store 11 — on
   the ladder with sensitive custody (sessions/tokens never restored).
   v2.4.1.edge.auth (B0–B7) grows db_identity four tables —
   providers · import_jobs · sync_runs · directory(simulator) —
   so one account can prove itself by local password, LDAP/AD bind
   or RADIUS, switchable both ways, with file-import + delta-sync
   provisioning. Credential custody flips server-authoritative
   (the edge Worker owns Argon2id hashes in Cloudflare D1 (adeptio-hr-v245));
   the directory simulator never leaves the device.
   - 11 logical stores, one writer each (R1)
   - every write → fact on the audit ledger (§05 sync path)
   - backup ladder B1/B2/B3: snapshot now · scheduled · replay
   - per-store restore: blast radius = 1 module × 1 tenant
   Deletable / addable sample data seeds below — reset anytime.
   ============================================================ */
window.DB = (function () {
  const TENANT = "phoungern";
  const NS = "adeptio.v245.";
  const SEED_VERSION = 12; // v11: v2.4.4 — db_schedule store 14 (shift periods · groups · shift_groups · roster · views) + SW (shift-swap) request type (Bio & Gate & OT & Shift)

  /* localStorage — with in-memory shim so tools/smoke.js (node) runs */
  let LS;
  try { window.localStorage.setItem(NS + "probe", "1"); window.localStorage.removeItem(NS + "probe"); LS = window.localStorage; }
  catch (e) {
    const m = {};
    LS = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } };
  }

  /* ---------- store catalog — Blueprint v2.3.2 §02 + §04 cards ---------- */
  const CATALOG = [
    { id: "db_people",   name: "People & Org",         layer: "L-OP",          profile: "PII · reference",     writer: "People cell",   icon: "users",     priority: 1, tables: ["employees", "divisions"],            protection: "Restore-priority 1 — every other cell joins to it by ID; quarterly drill restores this store first." },
    { id: "db_time",     name: "Time & Attendance",    layer: "L-OP",          profile: "high-volume",         writer: "Time cell",     icon: "clock",     priority: 2, tables: ["punches"],                            protection: "Month partitions archived to L-CU as read-only exports; live DB stays small and fast." },
    { id: "db_leave",    name: "Leave & Absence",      layer: "L-OP",          profile: "transactional",       writer: "Leave cell",    icon: "sun",       priority: 2, tables: ["leave_types", "balances"],            protection: "Standard profile — PITR + nightly export." },
    { id: "db_workflow", name: "Requests & Approvals", layer: "L-OP",          profile: "ID authority",        writer: "Workflow cell", icon: "inbox",     priority: 1, tables: ["requests"],                           protection: "Shared-ID registry — restore-priority 1 with db_people; IDs must never fork." },
    { id: "db_payroll",  name: "Payroll",              layer: "L-OP",          profile: "PII · sensitive",     writer: "Payroll cell",  icon: "banknote",  priority: 2, tables: ["payslips", "payroll_runs", "components", "tax_config"], protection: "Own encryption key per tenant · pre-run branch snapshot before every pay run · restricted credential. v2.4.3 adds components (allowance/OT/misc per person) and tax_config (NSSF + PIT)." },
    { id: "db_comms",    name: "Communication",        layer: "L-OP",          profile: "high-volume",         writer: "Comms cell",    icon: "megaphone", priority: 4, tables: ["templates", "channels", "messages"], protection: "Delivery logs age out to L-CU — tolerant store, lowest restore priority." },
    { id: "db_docs",     name: "Documents Vault",      layer: "L-OP + L-CU",   profile: "PII · blob+meta",     writer: "Docs cell",     icon: "folder",    priority: 3, tables: ["documents"], gate: "vault",           protection: "Metadata here; files live in L-CU with bucket versioning — a DB restore never loses a file." },
    { id: "db_audit",    name: "Audit Ledger",         layer: "L-OP → L-CU",   profile: "immutable",           writer: "Event bus",     icon: "lock",      priority: 1, tables: ["events"], append: true,               protection: "Append-only · daily export to WORM (object-lock) bucket — even we cannot rewrite history." },
    { id: "dw_reports",  name: "Reporting Warehouse",  layer: "L-DR",          profile: "derived",             writer: "Projector",     icon: "chart",     priority: 5, tables: ["org_snapshots", "series", "generated"], derived: true, protection: "Rebuilt from the event ledger on demand — backup is a convenience, replay is the guarantee." },
    { id: "db_platform", name: "Platform Registry",    layer: "L-OP · global", profile: "control plane",       writer: "Kernel",        icon: "settings",  priority: 1, tables: ["registry", "backup_policies", "drills", "flags"], global: true, protection: "The one global DB — longest PITR window + export every 6 h; it is the map to everything else." },
    { id: "db_identity", name: "Identity & Access",    layer: "L-OP",          profile: "credentials · sensitive", writer: "Identity cell", icon: "key",   priority: 1, tables: ["accounts", "sessions", "tokens", "policies", "providers", "import_jobs", "sync_runs", "directory"], sensitive: true, protection: "Store 11 (v2.5 §3 · v2.4.1 edge) — encrypted snapshots; sessions, tokens & the directory simulator are EXCLUDED from every restore and from cloud sync (sensitive custody). Credential hashes are server-authoritative on the edge Worker (Cloudflare D1 (adeptio-hr-v245)); the browser never pushes db_identity to the cloud — the custody flip." },
    { id: "db_devices",  name: "Devices & Capture",    layer: "L-OP",          profile: "edge · telemetry",    writer: "Devices cell", icon: "grid",      priority: 3, tables: ["devices", "gates", "groups", "events"], protection: "Store 12 (v2.4.2) — biometric & gate connectors, capture groups and rolling telemetry. Connection facts only; device passwords/API keys are vault refs (never stored). Punches land in db_time — this store holds the registry, not the truth of attendance." },
    { id: "db_overtime", name: "Overtime & Quota",     layer: "L-OP",          profile: "transactional",       writer: "OT cell",       icon: "clock",     priority: 2, tables: ["quotas", "policy"],                 protection: "Store 13 (v2.4.3) — per-division OT quota limits (monthly/yearly), used & remaining hours, and the OT-rate policy. Approving an OT request decrements the live quota; the payroll OT line reads from here." },
    { id: "db_schedule", name: "Job Schedule & Shifts", layer: "L-OP",         profile: "transactional",       writer: "Schedule cell", icon: "calendar",  priority: 2, tables: ["shift_periods", "groups", "shift_groups", "roster", "views"], protection: "Store 14 (v2.4.4) — shift period definitions (Mon–Sun × 24h / 30-min), people groups (position·division·individual·manual), shift-group bindings, the published roster, and saved per-account calendar views. The calendar core reads db_time / db_leave / db_overtime / db_people as a lens — only the roster lives here. Approving a Swap (SW) request updates the roster; nothing else is duplicated." },
    /* ==SEAM:STORES== append new DB.CATALOG entries here, one per thread == */
    { id: "db_ledger",   name: "Cashbook & Ledger",     layer: "L-OP",          profile: "transactional",       writer: "Ledger cell",   icon: "book",      priority: 2, tables: ["cashbook", "recurring"], protection: "Store 15 (v2.4.5 · T2) — the cashbook: every cash movement (revenue · expense · staff cost) plus recurring/scheduled expenses. Staff cost posts here automatically when a payroll run closes (T3). DW reporting reads it as a lens; HR/CEO see the rollup." }
  ];
  const byId = {}; CATALOG.forEach(c => byId[c.id] = c);

  /* ---------- seeds — sample data, deletable & addable ---------- */
  function seeds() {
    return {
      db_people: {
        // 32 active staff — the pilot-site roster. Add / delete / reassign via
        // HR → People (New hire · Offboard · Reassign) or Manager → Team data.
        employees: [
          // Production · Line A (8 + supervisor)
          { id: "EMP-0214", name: "Souksavanh Phommachanh", pos: "Machine Operator", div: "Production", team: "Line A", state: "present", in: "08:30", attend: 98, ot: 6,  leaveBal: 12, since: "Mar 2023" },
          { id: "EMP-0231", name: "Manysone Vongphachanh",  pos: "Machine Operator", div: "Production", team: "Line A", state: "present", in: "08:24", attend: 96, ot: 11, leaveBal: 8,  since: "Aug 2024" },
          { id: "EMP-0188", name: "Noy Keomany",            pos: "QC Inspector",     div: "Production", team: "Line A", state: "late",    in: "09:12", attend: 91, ot: 3,  leaveBal: 10, since: "Nov 2022" },
          { id: "EMP-0205", name: "Bounmy Latsavong",       pos: "Line Technician",  div: "Production", team: "Line A", state: "present", in: "08:18", attend: 99, ot: 14, leaveBal: 14, since: "May 2021" },
          { id: "EMP-0172", name: "Somphone Inthavong",     pos: "Machine Operator", div: "Production", team: "Line A", state: "onleave", in: "—",     attend: 94, ot: 2,  leaveBal: 4,  since: "Jan 2022" },
          { id: "EMP-0226", name: "Phetsamone Douangta",    pos: "Packer",           div: "Production", team: "Line A", state: "present", in: "08:29", attend: 97, ot: 8,  leaveBal: 11, since: "Jul 2023" },
          { id: "EMP-0240", name: "Chanthala Phimmasone",   pos: "Packer",           div: "Production", team: "Line A", state: "present", in: "08:31", attend: 95, ot: 5,  leaveBal: 9,  since: "Oct 2025" },
          { id: "EMP-0193", name: "Keo Sayavong",           pos: "Forklift Driver",  div: "Production", team: "Line A", state: "absent",  in: "—",     attend: 88, ot: 9,  leaveBal: 6,  since: "Jun 2022", status: "flagged" },
          { id: "EMP-0098", name: "Khamla Sisouphanh",      pos: "Supervisor · Line A", div: "Production", team: "—",  state: "present", in: "08:02", attend: 99, ot: 0,  leaveBal: 16, since: "Jan 2020" },
          // Production · Line B (7)
          { id: "EMP-0102", name: "Bouasone Keopaseuth",    pos: "Supervisor · Line B", div: "Production", team: "—",  state: "present", in: "08:05", attend: 98, ot: 0,  leaveBal: 14, since: "Mar 2020" },
          { id: "EMP-0218", name: "Khampheng Vilaysack",    pos: "Machine Operator", div: "Production", team: "Line B", state: "present", in: "08:26", attend: 97, ot: 9,  leaveBal: 10, since: "Apr 2023" },
          { id: "EMP-0222", name: "Outhai Sengsouvanh",     pos: "Machine Operator", div: "Production", team: "Line B", state: "present", in: "08:28", attend: 95, ot: 7,  leaveBal: 8,  since: "Sep 2023" },
          { id: "EMP-0237", name: "Viengsavanh Phrachanh",  pos: "QC Inspector",     div: "Production", team: "Line B", state: "present", in: "08:22", attend: 98, ot: 4,  leaveBal: 12, since: "Jan 2025" },
          { id: "EMP-0210", name: "Sengphet Chanthavixay",  pos: "Line Technician",  div: "Production", team: "Line B", state: "present", in: "08:15", attend: 99, ot: 12, leaveBal: 13, since: "Aug 2022" },
          { id: "EMP-0185", name: "Daosavanh Inthirath",    pos: "Packer",           div: "Production", team: "Line B", state: "present", in: "08:33", attend: 94, ot: 6,  leaveBal: 7,  since: "Oct 2022" },
          { id: "EMP-0249", name: "Phoutthasone Vongsa",    pos: "Packer",           div: "Production", team: "Line B", state: "present", in: "08:30", attend: 96, ot: 3,  leaveBal: 15, since: "Apr 2026", status: "probation" },
          // Production · plant-wide
          { id: "EMP-0150", name: "Amphone Thammavong",     pos: "Safety Officer",   div: "Production", team: "—",  state: "present", in: "08:10", attend: 99, ot: 1,  leaveBal: 11, since: "Jun 2021" },
          // Sales (4)
          { id: "EMP-0134", name: "Anousone Rattanavong",   pos: "Sales Manager",      div: "Sales",     team: "—",  state: "present", in: "08:40", attend: 97, ot: 0,  leaveBal: 12, since: "Feb 2021" },
          { id: "EMP-0244", name: "Davone Phanthavong",     pos: "Account Executive",  div: "Sales",     team: "—",  state: "present", in: "08:45", attend: 93, ot: 1,  leaveBal: 5,  since: "Feb 2026", status: "probation" },
          { id: "EMP-0228", name: "Malisa Phengdy",         pos: "Account Executive",  div: "Sales",     team: "—",  state: "present", in: "08:38", attend: 96, ot: 2,  leaveBal: 9,  since: "Nov 2023" },
          { id: "EMP-0246", name: "Thipphavanh Soulinthone",pos: "Sales Coordinator",  div: "Sales",     team: "—",  state: "present", in: "08:35", attend: 98, ot: 0,  leaveBal: 13, since: "Mar 2026", status: "probation" },
          // Logistics (4)
          { id: "EMP-0117", name: "Sourioudong Keola",      pos: "Logistics Supervisor", div: "Logistics", team: "—", state: "present", in: "08:08", attend: 98, ot: 2,  leaveBal: 14, since: "Jul 2020" },
          { id: "EMP-0203", name: "Khamsing Phialath",      pos: "Warehouse Officer",    div: "Logistics", team: "—", state: "present", in: "08:20", attend: 96, ot: 8,  leaveBal: 10, since: "May 2022" },
          { id: "EMP-0219", name: "Phonepadith Luanglath",  pos: "Driver",               div: "Logistics", team: "—", state: "present", in: "07:50", attend: 97, ot: 10, leaveBal: 9,  since: "Jan 2023" },
          { id: "EMP-0235", name: "Somchai Douangdara",     pos: "Forklift Driver",      div: "Logistics", team: "—", state: "present", in: "08:12", attend: 95, ot: 7,  leaveBal: 8,  since: "Dec 2024" },
          // Finance (3)
          { id: "EMP-0156", name: "Latsamy Vorachit",       pos: "Payroll Officer",    div: "Finance",   team: "—",  state: "present", in: "08:21", attend: 98, ot: 0,  leaveBal: 13, since: "Sep 2021" },
          { id: "EMP-0142", name: "Chindavone Sisavath",    pos: "Accountant",         div: "Finance",   team: "—",  state: "present", in: "08:25", attend: 99, ot: 0,  leaveBal: 12, since: "Oct 2021" },
          { id: "EMP-0167", name: "Ketsana Phommavong",     pos: "AP Officer",         div: "Finance",   team: "—",  state: "present", in: "08:27", attend: 97, ot: 0,  leaveBal: 11, since: "Feb 2022" },
          // Admin (4)
          { id: "EMP-0021", name: "Vilayvanh Chanthavong",  pos: "HR Operations Lead", div: "Admin",     team: "—",  state: "present", in: "07:58", attend: 99, ot: 0,  leaveBal: 15, since: "Apr 2019" },
          { id: "EMP-0089", name: "Bountheung Sayasone",    pos: "Office Manager",     div: "Admin",     team: "—",  state: "present", in: "08:00", attend: 99, ot: 0,  leaveBal: 16, since: "Aug 2019" },
          { id: "EMP-0177", name: "Noulak Chanthachone",    pos: "IT Support",         div: "Admin",     team: "—",  state: "present", in: "08:14", attend: 97, ot: 1,  leaveBal: 10, since: "Jun 2023" },
          { id: "EMP-0233", name: "Vansana Keomixay",       pos: "Receptionist",       div: "Admin",     team: "—",  state: "present", in: "07:55", attend: 98, ot: 0,  leaveBal: 12, since: "Jan 2024" }
        ],
        divisions: [
          { name: "Production", staff: 142, cost: 38.2, attr: 6.1, ot: 412 },
          { name: "Sales",      staff: 38,  cost: 17.4, attr: 9.8, ot: 86 },
          { name: "Logistics",  staff: 31,  cost: 11.9, attr: 8.4, ot: 132 },
          { name: "Finance",    staff: 22,  cost: 9.6,  attr: 4.2, ot: 22 },
          { name: "Admin",      staff: 15,  cost: 6.1,  attr: 5.0, ot: 14 }
        ]
      },
      db_time: {
        punches: [
          { id: "PN-0610", emp: "EMP-0214", date: "Wed, Jun 10", in: "08:30", out: "—",     hours: "—",  status: "ok" },
          { id: "PN-0609", emp: "EMP-0214", date: "Tue, Jun 09", in: "08:28", out: "17:32", hours: 8.1,  status: "ok" },
          { id: "PN-0608", emp: "EMP-0214", date: "Mon, Jun 08", in: "08:31", out: "17:30", hours: 8.0,  status: "ok" },
          { id: "PN-0605", emp: "EMP-0214", date: "Fri, Jun 05", in: "—",     out: "17:31", hours: "—",  status: "flagged" },
          { id: "PN-0604", emp: "EMP-0214", date: "Thu, Jun 04", in: "08:29", out: "19:40", hours: 10.2, status: "ot" },
          { id: "PN-0603", emp: "EMP-0214", date: "Wed, Jun 03", in: "08:30", out: "17:29", hours: 8.0,  status: "ok" }
        ]
      },
      db_leave: {
        leave_types: [
          { code: "AL", name: "Annual leave",   days: 15, accrual: "1.25 d / month", carry: "5 d max" },
          { code: "SL", name: "Sick leave",     days: 30, accrual: "statutory",      carry: "—" },
          { code: "PL", name: "Personal leave", days: 3,  accrual: "fixed",          carry: "—" },
          { code: "ML", name: "Maternity",      days: 105, accrual: "statutory",     carry: "—" }
        ],
        balances: [
          { emp: "EMP-0214", name: "Souksavanh P.", annual: 12, sick: 28, taken: 6 },
          { emp: "EMP-0231", name: "Manysone V.",   annual: 8,  sick: 30, taken: 9 },
          { emp: "EMP-0226", name: "Phetsamone D.", annual: 11, sick: 27, taken: 7 },
          { emp: "EMP-0172", name: "Somphone I.",   annual: 4,  sick: 30, taken: 13 }
        ]
      },
      db_workflow: {
        requests: [
          { id: "LV-0481", type: "Leave",      who: "Souksavanh Phommachanh", detail: "Annual leave · 2 days",        dates: "Jun 18 – 19",            status: "pending",  stage: "L1 · Manager",        sla: "14h left", note: "Family visit in Pakse.",            submitted: "Jun 09 · 16:40" },
          { id: "OT-0322", type: "Overtime",   who: "Manysone Vongphachanh",  detail: "Overtime · 3 hours",           dates: "Jun 11 · 17:00–20:00",   status: "pending",  stage: "L1 · Manager",        sla: "9h left",  note: "Line B maintenance window.",        submitted: "Jun 10 · 07:55" },
          { id: "EX-0210", type: "Claim",      who: "Souksavanh Phommachanh", detail: "Expense claim · ₭ 420,000",    dates: "Receipt · Jun 06",       status: "pending",  stage: "L2 · HR / Finance",   sla: "1d left",  note: "Safety boots replacement.",         submitted: "Jun 08 · 11:02" },
          { id: "TC-0107", type: "Correction", who: "Keo Sayavong",           detail: "Missing punch · Jun 05",       dates: "Jun 05 · in 08:27",      status: "returned", stage: "Returned to staff",   sla: "—",        note: "Please attach gate log photo.",     submitted: "Jun 06 · 09:15" },
          { id: "LV-0476", type: "Leave",      who: "Phetsamone Douangta",    detail: "Sick leave · 1 day",           dates: "Jun 04",                 status: "approved", stage: "Recorded",            sla: "—",        note: "Medical certificate attached.",     submitted: "Jun 04 · 08:05" },
          { id: "OT-0318", type: "Overtime",   who: "Bounmy Latsavong",       detail: "Overtime · 2 hours",           dates: "Jun 07 · 17:00–19:00",   status: "approved", stage: "Recorded",            sla: "—",        note: "Order rush — approved by plan.",    submitted: "Jun 07 · 12:20" },
          { id: "SW-0325", type: "Swap",       who: "Manysone Vongphachanh",  detail: "Shift swap · Jun 12 Afternoon → Souksavanh P.", dates: "Jun 12", status: "pending", stage: "L1 · Manager", sla: "12h left", note: "Family appointment — please swap my afternoon shift.", submitted: "Jun 10 · 09:20", emp: "EMP-0231", div: "Production", swap: { from: "EMP-0231", to: "EMP-0214", date: "2026-06-12", sg: "SG-PA-A" } }
        ]
      },
      db_payroll: {
        payslips: [
          { id: "PS-2026-05", emp: "EMP-0214", period: "May 2026",   net: 4862000, gross: 5640000, paid: "May 31", status: "ready",
            lines: [["Basic salary", 4200000], ["OT (12.5 h)", 540000], ["Position allowance", 450000], ["Meal & transport", 450000]],
            deds:  [["Income tax (PIT)", -468000], ["Social security (5.5%)", -310200]] },
          { id: "PS-2026-04", emp: "EMP-0214", period: "April 2026", net: 4715000, gross: 5430000, paid: "Apr 30", status: "ready",
            lines: [["Basic salary", 4200000], ["OT (7 h)", 330000], ["Position allowance", 450000], ["Meal & transport", 450000]],
            deds:  [["Income tax (PIT)", -428000], ["Social security (5.5%)", -287000]] }
        ],
        payroll_runs: [
          { id: "PR-2026-06", period: "June 2026",  state: "draft",     step: 1, staff: 248, gross: "₭ 1.42B", cutoff: "Jun 25", notes: "3 OT batches pending L1." },
          { id: "PR-2026-05", period: "May 2026",   state: "disbursed", step: 4, staff: 246, gross: "₭ 1.39B", cutoff: "May 25", notes: "Bank file exported · May 30." },
          { id: "PR-2026-04", period: "April 2026", state: "disbursed", step: 4, staff: 243, gross: "₭ 1.36B", cutoff: "Apr 25", notes: "Bank file exported · Apr 29." }
        ],
        // v2.4.3 — per-employee pay components (basis for the by-division Staff-pay list + sums).
        // Lazily ensured from db_people by the Payroll cell (js/payroll.js) on first read.
        components: [],
        // v2.4.3 — NSSF + PIT config. The Lao statutory values double as the compliance baseline;
        // HR can adjust any field and a badge flags deviation from this baseline.
        tax_config: [
          { id: "TAX-LA", name: "Lao PDR — NSSF + PIT",
            nssfEmp: 5.5, nssfEr: 6.0, nssfCap: 4500000,
            pitExempt: 1300000,
            brackets: [[1300000, 0], [5000000, 5], [15000000, 10], [25000000, 15], [65000000, 20], [null, 25]],
            otWeekday: 150, otRestday: 200, otHoliday: 300, otNight: 150,
            updated: "Jun 2026",
            note: "Statutory baseline — NSSF 5.5% employee / 6% employer, cap ₭4,500,000/mo; PIT 0–25%, monthly exemption ₭1,300,000; remit by the 15th of the following month." }
        ]
      },
      db_comms: {
        templates: [
          { id: "TPL-014", name: "Employment letter",          kind: "Letter",      lang: "EN · ລາວ", status: "published", v: "3.1", updated: "Jun 02" },
          { id: "TPL-019", name: "Town hall announcement",     kind: "Email",       lang: "EN · ລາວ", status: "published", v: "1.4", updated: "Jun 08" },
          { id: "TPL-021", name: "Payslip ready notification", kind: "Email · Push", lang: "EN · ລາວ", status: "published", v: "2.0", updated: "May 28" },
          { id: "TPL-023", name: "Shift reminder",             kind: "SMS",         lang: "EN",       status: "review",    v: "0.9", updated: "Jun 09" },
          { id: "TPL-025", name: "Salary certificate",         kind: "Letter",      lang: "EN · ລາວ", status: "published", v: "1.2", updated: "May 30" },
          { id: "TPL-026", name: "Document expiry notice",     kind: "Email · SMS", lang: "EN · ລາວ", status: "draft",     v: "0.3", updated: "Jun 10" }
        ],
        channels: [
          { name: "Email · SMTP relay",   id: "smtp.adeptio.la",  status: "live",   rate: "99.2%", today: 412 },
          { name: "SMS · LaoTel gateway", id: "laotel-bulk-01",   status: "live",   rate: "97.8%", today: 86 },
          { name: "Push · in-app",        id: "fcm-adeptio-prod", status: "live",   rate: "99.9%", today: 1240 },
          { name: "Webhook · LINE OA",    id: "line-oa-bridge",   status: "failed", rate: "—",     today: 0 }
        ],
        messages: [
          // demo outbox — auth mails land here (kind: mail). One seeded invite so the
          // outbox reader and the pending-access list have a live link on first run.
          { id: "MAIL-0200", mail: true, kind: "invite", to: "davone@phoungern.la", audience: "davone@phoungern.la",
            subject: "You're invited to Adeptio — activate your account",
            subjectLo: "ທ່ານໄດ້ຮັບເຊີນເຂົ້າໃຊ້ Adeptio — ເປີດໃຊ້ບັນຊີຂອງທ່ານ",
            body: "Sabaidee Davone,\n\nHR switched on portal access for you at Phou Ngern Group.\nYour username is this e-mail address: davone@phoungern.la\n\nActivate your account and set a password (link valid 72 h):\n→ #/activate/TOK-SEED-DAVONE\n\nIf you didn't expect this, contact HR.",
            bodyLo: "ສະບາຍດີ Davone,\n\nຝ່າຍ HR ໄດ້ເປີດສິດເຂົ້າໃຊ້ພອດທັລໃຫ້ທ່ານແລ້ວ.\nຊື່ຜູ້ໃຊ້ຂອງທ່ານແມ່ນອີເມວນີ້: davone@phoungern.la\n\nເປີດໃຊ້ບັນຊີ ແລະ ຕັ້ງລະຫັດຜ່ານ (ລິ້ງມີອາຍຸ 72 ຊມ):\n→ #/activate/TOK-SEED-DAVONE",
            link: "#/activate/TOK-SEED-DAVONE", ch: "Email · demo outbox", est: 1, ts: "Jun 12 · 08:05" }
        ]
      },
      db_docs: {
        documents: [
          { id: "DOC-0101", emp: "EMP-0214", name: "Employment contract", kind: "Contract", expiry: "Dec 2027",              status: "active" },
          { id: "DOC-0102", emp: "EMP-0214", name: "National ID",         kind: "Identity", expiry: "Mar 2029",              status: "active" },
          { id: "DOC-0103", emp: "EMP-0214", name: "Forklift license",    kind: "License",  expiry: "Jul 2026",              status: "expiring" },
          { id: "DOC-0104", emp: "EMP-0214", name: "Code of conduct v4",  kind: "Policy",   expiry: "Acknowledge by Jun 20", status: "pending" }
        ]
      },
      db_audit: {
        events: [
          { ts: "10:42", who: "Vilayvanh C.",  act: "payroll.run.draft_created", obj: "PR-2026-06",               ip: "10.0.4.12" },
          { ts: "10:18", who: "Khamla S.",     act: "leave.approved",            obj: "LV-0476",                  ip: "10.0.7.31" },
          { ts: "09:56", who: "Thip N.",       act: "template.published",        obj: "TPL-019 v1.4",             ip: "10.0.1.9" },
          { ts: "09:31", who: "system",        act: "channel.failover",          obj: "line-oa-bridge",           ip: "—" },
          { ts: "09:02", who: "Thip N.",       act: "role.permission_changed",   obj: "manager → reports.team",   ip: "10.0.1.9" },
          { ts: "08:47", who: "Souksavanh P.", act: "attendance.punch_in",       obj: "EMP-0214 · GPS",           ip: "mobile" }
        ]
      },
      dw_reports: {
        org_snapshots: [
          // headcount / present / late / absent / onleave / division staff counts are
          // DERIVED LIVE from db_people.employees by DATA.org() on this tier —
          // add or offboard a staff member and the KPIs move. Static fields below
          // (cost %, gross, …) stay snapshot values pending the payroll cell.
          { tier: "essential", headcount: 32, present: 29, presentPct: "90.6%", late: 1, absent: 1, onleave: 1,
            newMoM: "+2", runStaff: 32, gross: "₭ 186M", net: "₭ 158M", broadcast: 32, segment: 18,
            divisions: [
              { name: "Production", staff: 17, cost: 41.0, attr: 5.8, ot: 84 },
              { name: "Sales",      staff: 4,  cost: 16.2, attr: 8.1, ot: 18 },
              { name: "Logistics",  staff: 4,  cost: 12.4, attr: 7.2, ot: 26 },
              { name: "Finance",    staff: 3,  cost: 9.8,  attr: 4.0, ot: 5 },
              { name: "Admin",      staff: 4,  cost: 6.4,  attr: 4.4, ot: 3 }
            ] },
          { tier: "professional", headcount: 248, present: 236, presentPct: "95.1%", late: 4, absent: 3, onleave: 5,
            newMoM: "+3", runStaff: 248, gross: "₭ 1.42B", net: "₭ 1.21B", broadcast: 248, segment: 142,
            divisions: [
              { name: "Production", staff: 142, cost: 38.2, attr: 6.1, ot: 412 },
              { name: "Sales",      staff: 38,  cost: 17.4, attr: 9.8, ot: 86 },
              { name: "Logistics",  staff: 31,  cost: 11.9, attr: 8.4, ot: 132 },
              { name: "Finance",    staff: 22,  cost: 9.6,  attr: 4.2, ot: 22 },
              { name: "Admin",      staff: 15,  cost: 6.1,  attr: 5.0, ot: 14 }
            ] }
        ],
        series: [
          { id: "burn", labels: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            actual: [1.21, 1.23, 1.22, 1.26, 1.31, 1.42, 1.28, 1.27, 1.33, 1.36, 1.39, 1.42],
            budget: [1.25, 1.25, 1.28, 1.28, 1.32, 1.40, 1.33, 1.33, 1.36, 1.38, 1.42, 1.45] },
          { id: "attendance_trend", values: [93.8, 94.6, 95.2, 94.1, 95.8, 96.0, 94.9, 95.5, 94.7, 95.1] },
          { id: "audit_pulse", values: [84, 96, 122, 141, 138, 156, 149, 171, 162, 178] }
        ],
        // generated report runs — newest first. Last 3 per report stay visible in its
        // section; older runs are archived into file storage (one folder per report).
        generated: (function () {
          const RUN = (id, report, persona, title, ts, query, kpis, rows, archived) =>
            ({ id, report, persona, title, ts, tier: "essential", fmt: "CSV", query, kpis, rows, archived: !!archived });
          const rosterRows = (p, l, a) => [["id", "name", "status", "attend_pct", "ot_h"],
            ["EMP-0214", "Souksavanh Phommachanh", "present", 98, 6], ["EMP-0231", "Manysone Vongphachanh", "present", 96, 11],
            ["EMP-0188", "Noy Keomany", l ? "late" : "present", 91, 3], ["EMP-0205", "Bounmy Latsavong", "present", 99, 14],
            ["EMP-0172", "Somphone Inthavong", "onleave", 94, 2], ["EMP-0226", "Phetsamone Douangta", "present", 97, 8],
            ["EMP-0240", "Chanthala Phimmasone", "present", 95, 5], ["EMP-0193", "Keo Sayavong", a ? "absent" : "present", 88, 9]];
          return [
            RUN("RPT-1010", "team-attendance", "manager", "Team attendance — June", "Jun 10 · 17:30",
              "SELECT * FROM people_employees WHERE team='Line A'; punches WHERE status='flagged' — db_people · db_time",
              [["Present", "6 / 8", "75.0% of roster"], ["Late", "1", "auto-flagged"], ["Absent", "1", "PV ladder"], ["On leave", "1", "approved"]],
              rosterRows(6, 1, 1)),
            RUN("RPT-1009", "attendance", "hr", "Attendance — org", "Jun 10 · 17:00",
              "GROUP BY division ON people_employees; flagged punches; open TC — db_people · db_time · db_workflow",
              [["Present", "29", "90.6% of 32"], ["Late", "1", "auto-flagged"], ["Absent", "1", "no-show"], ["On leave", "1", "approved"]],
              [["division", "staff"], ["Production", 17], ["Sales", 4], ["Logistics", 4], ["Finance", 3], ["Admin", 4]]),
            RUN("RPT-1008", "payroll", "hr", "Payroll — register & burn", "Jun 10 · 09:00",
              "SELECT * FROM payroll_payroll_runs ORDER BY period DESC — db_payroll · dw_reports.series(burn)",
              [["Current run", "PR-2026-06", "draft · step 1/4"], ["Staff in run", "32", "active headcount"], ["Gross (period)", "₭ 186M", "before PIT + SSO"], ["Payslips on file", "2", "serialized"]],
              [["run", "period", "staff", "gross", "step", "state"], ["PR-2026-06", "June 2026", 248, "₭ 1.42B", 1, "draft"], ["PR-2026-05", "May 2026", 246, "₭ 1.39B", 4, "disbursed"], ["PR-2026-04", "April 2026", 243, "₭ 1.36B", 4, "disbursed"]]),
            RUN("RPT-1007", "team-attendance", "manager", "Team attendance — June", "Jun 09 · 17:30",
              "SELECT * FROM people_employees WHERE team='Line A'; punches WHERE status='flagged' — db_people · db_time",
              [["Present", "7 / 8", "87.5% of roster"], ["Late", "0", "—"], ["Absent", "0", "—"], ["On leave", "1", "approved"]],
              rosterRows(7, 0, 0)),
            RUN("RPT-1006", "headcount", "hr", "People & headcount", "Jun 09 · 08:30",
              "COUNT(*) GROUP BY division, status FROM people_employees — db_people",
              [["Active staff", "32", "+2 MoM"], ["On probation", "3", "90-day reviews"], ["Joined 2026", "3", "new this year"], ["Teams", "2 lines", "+ plant-wide"]],
              [["division", "staff"], ["Production", 17], ["Sales", 4], ["Logistics", 4], ["Finance", 3], ["Admin", 4]]),
            RUN("RPT-1005", "team-attendance", "manager", "Team attendance — June", "Jun 08 · 17:30",
              "SELECT * FROM people_employees WHERE team='Line A'; punches WHERE status='flagged' — db_people · db_time",
              [["Present", "8 / 8", "100% of roster"], ["Late", "0", "—"], ["Absent", "0", "—"], ["On leave", "0", "—"]],
              rosterRows(8, 0, 0)),
            RUN("RPT-1004", "my-attendance", "staff", "My attendance", "Jun 08 · 08:00",
              "SELECT * FROM time_punches WHERE emp='EMP-0214' — db_time",
              [["Score", "98%", "trailing 90 days"], ["Punches", "6", "this period"], ["Flagged", "1", "Jun 05 missing in"], ["OT", "6 h", "MTD"]],
              [["date", "in", "out", "hours", "status"], ["Tue, Jun 09", "08:28", "17:32", 8.1, "ok"], ["Mon, Jun 08", "08:31", "17:30", 8.0, "ok"], ["Fri, Jun 05", "—", "17:31", "—", "flagged"], ["Thu, Jun 04", "08:29", "19:40", 10.2, "ot"]]),
            RUN("RPT-1003", "board-pack", "ceo", "Executive board pack", "Jun 08 · 07:00",
              "Aggregates only: headcount, burn vs budget, open requests, data-layer posture — dw_reports · db_workflow · db_platform",
              [["Headcount", "248", "+3 vs plan"], ["Payroll burn", "₭ 1.42B", "vs ₭ 1.45B budget"], ["Open requests", "3", "across chains"], ["Data layer", "11/11 stores", "snapshots held"]],
              [["metric", "value"], ["headcount", 248], ["present_pct", "95.1%"], ["burn_actual_B", 1.42], ["burn_budget_B", 1.45], ["attrition_pct", 7.2]]),
            RUN("RPT-1002", "team-attendance", "manager", "Team attendance — June", "Jun 07 · 17:30",
              "SELECT * FROM people_employees WHERE team='Line A'; punches WHERE status='flagged' — db_people · db_time",
              [["Present", "7 / 8", "87.5% of roster"], ["Late", "1", "auto-flagged"], ["Absent", "0", "—"], ["On leave", "0", "—"]],
              rosterRows(7, 1, 0), true), // 4th run — already archived to file storage
            RUN("RPT-1001", "audit-extract", "sysadmin", "Audit ledger extract", "Jun 07 · 02:00",
              "SELECT * FROM audit_events ORDER BY ts DESC — db_audit (append-only, WORM copy)",
              [["Facts", "6", "in extract window"], ["Anomalies", "0", "rule engine"], ["Actors", "5", "distinct"], ["WORM", "verified", "object-lock bucket"]],
              [["time", "actor", "action", "object"], ["10:42", "Vilayvanh C.", "payroll.run.draft_created", "PR-2026-06"], ["10:18", "Khamla S.", "leave.approved", "LV-0476"], ["09:56", "Thip N.", "template.published", "TPL-019 v1.4"]])
          ];
        })()
      },
      db_platform: {
        registry: CATALOG.map(c => ({
          store: c.id, physical: TENANT + "-" + c.id.replace(/^d[bw]_/, ""), layer: c.layer,
          group: c.global ? "global-core" : "apac-core", region: "aws-ap-southeast-1",
          schema: c.id.replace(/^d[bw]_/, "") + "-schema@v1", status: c.gate ? "flag-gated" : "active",
          credential: "vault://" + TENANT + "/" + c.id.replace(/^d[bw]_/, "") + "-rw",
          encryption: (c.id === "db_payroll" || c.id === "db_docs" || c.id === "db_identity") ? "per-tenant-key" : "at-rest",
          pitr: c.global ? "90 d" : "30 d", residency: "none"
        })),
        backup_policies: CATALOG.map(c => ({
          store: c.id, enabled: c.id !== "dw_reports",
          freq: c.global ? "6-hourly" : c.id === "db_audit" ? "daily-worm" : "nightly",
          time: "02:00", retention: c.id === "db_audit" ? "statutory" : "35 d",
          custody: c.id === "db_audit" ? "R2 · WORM bucket (object-lock)" : "R2 · adeptio-backups (versioned)",
          prerun: c.id === "db_payroll", note: c.derived ? "rebuild > restore — replay from facts" : c.sensitive ? "encrypted snapshot — sessions & tokens excluded from restore" : "", last: null
        })),
        drills: [
          { id: "DR-0017", ts: "Jun 01 · 02:10", target: TENANT + "-leave + db_platform", result: "pass", checks: "integrity ✓ · row counts ✓ · checksums ✓" },
          { id: "DR-0016", ts: "May 01 · 02:08", target: TENANT + "-people + db_platform", result: "pass", checks: "integrity ✓ · row counts ✓ · checksums ✓" }
        ],
        // kernel flags — auth_portal + auth_mode + the Security menu's registry-driven rows.
        // v2.4.1: LDAP/AD + RADIUS un-grey to BUILT (Pro); SSO/SCIM stay roadmap (Ent).
        flags: [
          { key: "auth_portal", label: "Login portal (auth_portal)", on: true, note: "off = persona menu · on = the portal" },
          { key: "auth_mode",   label: "Identity authority (auth_mode)", on: false, mode: "local", note: "local = in-browser directory simulator (demo, offline-safe) · remote = edge Worker owns LDAP/AD bind, RADIUS & Argon2id, D1-authoritative (B1)" },
          { key: "auth.local",  label: "Local passwords",                          state: "live",    tier: null,           note: "e-mail is the username · salted hashes in db_identity (Argon2id on the edge Worker)" },
          { key: "auth.ldap",   label: "LDAP / AD — company directory bind",       state: "built",   tier: "professional", configure: "sysadmin/web/providers", note: "verify pass-through, never stored · LDAPS 636 via Worker connect() · outage: fail-closed + break-glass (D2), cached-grace off" },
          { key: "auth.radius", label: "RADIUS — network credentials",             state: "built",   tier: "professional", configure: "sysadmin/web/providers", note: "Access-Request pass-through · RadSec 2083 (RFC 6614) via Worker connect() · plain-UDP RADIUS uses the site agent" },
          { key: "auth.import", label: "File import + directory delta-sync",        state: "built",   tier: "professional", configure: "sysadmin/web/sync",      note: "CSV/Excel import (dry-run, dupe-by-email) + read-only LDAP/AD delta sync (create·link·suspend review queue) — attributes never credentials" },
          { key: "auth.mfa",    label: "MFA — one-time codes",                     state: "roadmap", tier: null,           note: "TOTP / mail codes — after the portal ships" },
          { key: "auth.sso",    label: "SSO — OIDC / SAML",                        state: "roadmap", tier: "enterprise",   note: "id.phoungern.la — single sign-on across suites (D8, demand-gated)" },
          { key: "auth.scim",   label: "SCIM 2.0 — push provisioning endpoint",    state: "roadmap", tier: "enterprise",   note: "v2.4.1 ships pull import + delta sync; the standard SCIM /v2 endpoint stays Enterprise" },
          { key: "auth.bio",    label: "Biometric punch & capture",                state: "built",   tier: "professional", configure: "sysadmin/web/biometrics", note: "v2.4.2 — face / finger / card terminals (ZKTeco PUSH · Hikvision ISAPI · Dahua · Sunmi · HIP import); punches land in db_time, tagged by device & method" },
          { key: "auth.door",   label: "Door / gate & badge access",               state: "built",   tier: "enterprise",   configure: "sysadmin/web/gates",      note: "v2.4.2 — turnstiles · doors · barriers downstream of a reader/controller; same identity, physical access" }
        ],
        // v2.4.5 G9 — durable runtime settings: { flags:{key:bool}, license:{enabled,locked,tier,openLimits} }. Empty = use code defaults.
        settings: { flags: {}, license: {} }
      },
      /* ---------- store 11 — db_identity (v2.5 §3 step 1) ----------
         Accounts = the door keys; people stay in db_people (no access ≠ no
         employee). D4: two demo accounts per persona, passwords printed on
         the portal strip; hashes only in here (never-log list). */
      db_identity: {
        accounts: [
          { email: "staff@phoungern.la",     name: "Souksavanh Phommachanh", emp: "EMP-0214", scopes: ["staff"],            status: "active",  provider: "local", hash: "16dac5534531de3b382c63622327b8a2973782712ab0e7915e685b1541ea9ae8", fails: 0, lockedUntil: 0, lastLogin: "Jun 11 · 17:02", created: "Jun 10 · 09:00" },
          { email: "staff2@phoungern.la",    name: "Manysone Vongphachanh",  emp: "EMP-0231", scopes: ["staff"],            status: "active",  provider: "local", hash: "5f022bffc894f0ab8f87df8a193de3d1eb0fa8ffcd32d1b0a80c4362fb486088", fails: 0, lockedUntil: 0, lastLogin: null,             created: "Jun 10 · 09:00" },
          { email: "manager@phoungern.la",   name: "Khamla Sisouphanh",      emp: "EMP-0098", scopes: ["manager", "staff"], status: "active",  provider: "local", hash: "799265303b2412f9e861a27e5500efbd0d9500244d86f8e981e31c870fe71f54", fails: 0, lockedUntil: 0, lastLogin: "Jun 11 · 08:14", created: "Jun 10 · 09:00" },
          { email: "manager2@phoungern.la",  name: "Bouasone Keopaseuth",    emp: "EMP-0102", scopes: ["manager", "staff"], status: "active",  provider: "local", hash: "60c1b94fa252890b64bbff6024ed3f4863730952446803b9e19980c78efcbf46", fails: 0, lockedUntil: 0, lastLogin: null,             created: "Jun 10 · 09:00" },
          { email: "hr@phoungern.la",        name: "Vilayvanh Chanthavong",  emp: "EMP-0021", scopes: ["hr", "staff"],      status: "active",  provider: "local", hash: "d8198897470c6570f63535412ad296538f164ce37405a3c9474b8f67453ce8be", fails: 0, lockedUntil: 0, lastLogin: "Jun 12 · 07:58", created: "Jun 10 · 09:00" },
          { email: "hr2@phoungern.la",       name: "Bountheung Sayasone",    emp: "EMP-0089", scopes: ["hr", "staff"],      status: "active",  provider: "local", hash: "71953bf551509596c5f6b1e2ad44328c58913677bf0578973dffe735a39ed168", fails: 0, lockedUntil: 0, lastLogin: null,             created: "Jun 10 · 09:00" },
          { email: "ceo@phoungern.la",       name: "Phonesavanh Luangrath",  emp: "EMP-0001", scopes: ["ceo"],              status: "active",  provider: "local", hash: "f52e677b1fe4df6dc90962e01d8a6ec1dce4a177d19d71f28caa6505857ba24a", fails: 0, lockedUntil: 0, lastLogin: null,             created: "Jun 10 · 09:00" },
          { email: "ceo2@phoungern.la",      name: "Khamphoui Vongphakdy",   emp: "EMP-0002", scopes: ["ceo"],              status: "active",  provider: "local", hash: "ee900b69e63c6413e7788242221a465fb84135f8acf4eed36854ec989f0f9118", fails: 0, lockedUntil: 0, lastLogin: null,             created: "Jun 10 · 09:00" },
          { email: "sysadmin@phoungern.la",  name: "Thip Norasing",          emp: "ADM-0002", scopes: ["sysadmin"],         status: "active",  provider: "local", breakGlass: true, hash: "661a9e6bf49a7cf29beb4e17d6c86831a5bd74e10f826ccc79635a6a81965666", fails: 0, lockedUntil: 0, lastLogin: "Jun 11 · 21:40", created: "Jun 10 · 09:00" },
          { email: "sysadmin2@phoungern.la", name: "Noulak Chanthachone",    emp: "EMP-0177", scopes: ["sysadmin"],         status: "active",  provider: "local", hash: "4df72dc0be3a7a61acf6725d7deb688980e095e1618b954644ba946da684b733", fails: 0, lockedUntil: 0, lastLogin: null,             created: "Jun 10 · 09:00" },
          // one invite in flight — feeds the pending-access list, the funnel tile and the outbox
          { email: "davone@phoungern.la",    name: "Davone Phanthavong",     emp: "EMP-0244", scopes: ["staff"],            status: "invited", provider: "local", hash: null, fails: 0, lockedUntil: 0, lastLogin: null, created: "Jun 12 · 08:05" }
        ],
        sessions: [],
        tokens: [
          { id: "TOK-SEED-DAVONE", kind: "invite", email: "davone@phoungern.la", created: "Jun 12 · 08:05", expires: Date.now() + 72 * 36e5, used: false }
        ],
        // D3 decided: min length 8 is the only change to the NIST-shaped defaults
        policies: [
          { id: "default", minLen: 8, expiryDays: 0, lockoutFails: 5, lockoutMins: 15, idleMins: 30, inviteHours: 72, resetMins: 30, setpwHours: 72,
            provider: "local", directoryOutage: "fail-closed + break-glass (D2 · yes)", cachedGrace: false, breakGlass: "sysadmin@phoungern.la",
            note: "no forced expiry · lockout 5 fails / 15 min · idle 30 min · invite 72 h · reset 30 min — tenants tune later (Pro)" }
        ],
        /* ---------- v2.4.1.edge.auth · B3/B4 — directory providers (NO secrets here) ----------
           Connection facts only; the bind secret lives in the vault / Worker secret, referenced by
           secretRef. mode "sim" = the in-browser simulator answers binds (demo, offline-safe);
           mode "live" = the edge Worker binds the real server via connect() (LDAPS 636 / RadSec 2083). */
        providers: [
          { id: "PROV-AD",  type: "ldap",   name: "Phou Ngern Active Directory", host: "ldaps://ad.phoungern.la:636", baseDN: "DC=phoungern,DC=la", bindDN: "CN=svc-adeptio,OU=Service Accounts,DC=phoungern,DC=la", userAttr: "userPrincipalName", secretRef: "vault://phoungern/ad-bind", transport: "ldaps", status: "configured", mode: "sim", reachable: true, lastSync: "Jun 12 · 02:00", note: "AD over LDAPS · group→role map on the sync screen" },
          { id: "PROV-RAD", type: "radius", name: "Phou Ngern RADIUS (NPS)",     host: "radsec://nps.phoungern.la:2083", baseDN: "—", bindDN: "—", userAttr: "User-Name", secretRef: "vault://phoungern/radius-secret", transport: "radsec", status: "configured", mode: "sim", reachable: true, lastSync: null, note: "RadSec (RFC 6614) · PAP Access-Request · plain-UDP falls back to the site agent" }
        ],
        // file-import batches (B5) — newest first; created by the import wizard (HR)
        import_jobs: [
          { id: "IMP-1001", ts: "Jun 11 · 14:20", who: "Vilayvanh C.", source: "starters-june.csv", rows: 4, created: 3, linked: 1, dupes: 0, errors: 0, mode: "local", state: "done", note: "June starters — 3 new local invites, 1 linked to an existing person" }
        ],
        // directory delta-sync runs (B5) — newest first; each carries its review queue
        sync_runs: [
          { id: "SYNC-1001", ts: "Jun 12 · 02:00", who: "system (scheduled)", provider: "PROV-AD", scanned: 7, created: 0, linked: 0, suspended: 0, conflicts: 0, state: "done", queue: [], note: "Nightly AD delta — no changes since the previous run" }
        ],
        /* ---------- the directory SIMULATOR — device-local, NEVER synced or restored ----------
           Stands in for the company AD/RADIUS so the whole edge flow demos in the browser with no
           server. simPw is a FAKE directory secret (demo only); it never reaches db_audit, never
           syncs to Cloudflare D1, never restores from a backup. Real binds (auth_mode=remote) bypass this
           table entirely and hit the Worker. Members below are employees WITHOUT a portal account,
           so a sync proposes "create"; the conflict row shows the email-belongs-to-another guard. */
        directory: [
          { dn: "CN=Outhai Sengsouvanh,OU=Production,DC=phoungern,DC=la",  sam: "outhai.s",     email: "outhai@phoungern.la",     name: "Outhai Sengsouvanh",   emp: "EMP-0222", type: "ldap",   group: "Line B Operators",   role: "staff",   simPw: "directory123", enabled: true },
          { dn: "CN=Viengsavanh Phrachanh,OU=Production,DC=phoungern,DC=la", sam: "viengsavanh.p", email: "viengsavanh@phoungern.la", name: "Viengsavanh Phrachanh", emp: "EMP-0237", type: "ldap",   group: "QC",                 role: "staff",   simPw: "directory123", enabled: true },
          { dn: "CN=Sengphet Chanthavixay,OU=Production,DC=phoungern,DC=la", sam: "sengphet.c",  email: "sengphet@phoungern.la",   name: "Sengphet Chanthavixay", emp: "EMP-0210", type: "ldap",  group: "Technicians",        role: "staff",   simPw: "directory123", enabled: true },
          { dn: "CN=Sourioudong Keola,OU=Logistics,DC=phoungern,DC=la",     sam: "sourioudong.k", email: "sourioudong@phoungern.la", name: "Sourioudong Keola",   emp: "EMP-0117", type: "ldap",   group: "Logistics Leads",    role: "manager", simPw: "directory123", enabled: true },
          { dn: "CN=Khampheng Vilaysack,OU=Production,DC=phoungern,DC=la",  sam: "khampheng.v",  email: "khampheng@phoungern.la",  name: "Khampheng Vilaysack",  emp: "EMP-0218", type: "radius", group: "Shop Floor",         role: "staff",   simPw: "radius1234",   enabled: true },
          { dn: "CN=Latsamy Vorachit,OU=Finance,DC=phoungern,DC=la",       sam: "latsamy.v",    email: "latsamy@phoungern.la",    name: "Latsamy Vorachit",     emp: "EMP-0156", type: "radius", group: "Finance",            role: "staff",   simPw: "radius1234",   enabled: true },
          // conflict probe — this directory record claims an address already held by another account
          { dn: "CN=Imposter Account,OU=External,DC=phoungern,DC=la",       sam: "imposter",     email: "hr@phoungern.la",         name: "Imposter Account",     emp: "EMP-9999", type: "ldap",   group: "External",           role: "staff",   simPw: "directory123", enabled: true }
        ]
      },
      /* ---------- store 12 — db_devices (v2.4.2 · biometric & gate capture) ----------
         Connection facts + rolling telemetry only; device passwords / API keys are
         vault refs (never stored here). Punches still land in db_time — this store is
         the registry & the edge telemetry, not the truth of attendance. Lanes per the
         Hardware Brief: A = device-push (ZKTeco PUSH/ADMS) · B = server-pull (Hikvision
         ISAPI / Dahua HTTP / Suprema·Anviz) · C = file/on-device (HIP CSV · Sunmi PWA). */
      db_devices: {
        devices: [
          { id: "DEV-ZK01", vendor: "ZKTeco",    model: "SpeedFace-V5L",   kind: "biometric",   lane: "A",      proto: "PUSH / ADMS",  methods: ["face", "finger", "card"], site: "Vientiane Plant 1", zone: "Main gate",     status: "online",   lat: 40,   today: 142, enrolled: 96, fw: "v8.0.4", ip: "10.0.12.21", sn: "ZK6817A2390041", auth: "AD-bound", last: "12s ago", since: "Mar 2024" },
          { id: "DEV-ZK02", vendor: "ZKTeco",    model: "K40 Pro",         kind: "biometric",   lane: "A",      proto: "PUSH / ADMS",  methods: ["finger", "card", "pin"],  site: "Vientiane Plant 1", zone: "Line A door",   status: "online",   lat: 55,   today: 88,  enrolled: 41, fw: "v8.0.4", ip: "10.0.12.22", sn: "ZK6817A2390118", auth: "AD-bound", last: "9s ago",  since: "Mar 2024" },
          { id: "DEV-HK01", vendor: "Hikvision", model: "MinMoe DS-K1T341", kind: "biometric",  lane: "B",      proto: "ISAPI (REST)", methods: ["face", "card"],           site: "Vientiane Plant 1", zone: "Office lobby",  status: "online",   lat: 120,  today: 36,  enrolled: 58, fw: "v3.2.40", ip: "10.0.12.31", sn: "HK-DSK1T341-0077", auth: "local", last: "31s ago", since: "Jan 2025" },
          { id: "DEV-HK02", vendor: "Hikvision", model: "DS-K1T671TM",     kind: "biometric",   lane: "B",      proto: "ISAPI (REST)", methods: ["face", "card"],           site: "Vientiane Plant 1", zone: "Warehouse entry", status: "degraded", lat: 940,  today: 19,  enrolled: 22, fw: "v3.2.36", ip: "10.0.12.32", sn: "HK-DSK1T671-0143", auth: "local", last: "4m ago",  since: "Jan 2025" },
          { id: "DEV-DH01", vendor: "Dahua",     model: "ASI7213X-T1",     kind: "biometric",   lane: "B",      proto: "HTTP API",     methods: ["face", "card"],           site: "Vientiane Plant 2", zone: "Plant 2 gate",  status: "offline",  lat: null, today: 0,   enrolled: 34, fw: "v1.0.7", ip: "10.0.22.10", sn: "DH-ASI7213-2210", auth: "local", last: "1h 12m ago", since: "Feb 2025" },
          { id: "DEV-SU01", vendor: "Sunmi",     model: "P2 (Adeptio PWA)", kind: "kiosk",      lane: "C",      proto: "On-device PWA", methods: ["selfie", "geo", "pin"],   site: "Vientiane Plant 1", zone: "Canteen kiosk", status: "online",   lat: 60,   today: 27,  enrolled: 33, fw: "PWA 2.4.2", ip: "10.0.12.40", sn: "SUNMI-P2-LA-0006", auth: "app", last: "20s ago", since: "May 2026" },
          { id: "DEV-HIP1", vendor: "HIP",       model: "CMI688",          kind: "import",      lane: "C",      proto: "CSV / Excel",  methods: ["finger", "card"],         site: "Annex office",      zone: "Annex door",    status: "import",   lat: null, today: 14,  enrolled: 12, fw: "HIP Time 5", ip: "—", sn: "HIP-CMI688-3391", auth: "local", last: "file · 06:40", since: "Nov 2024" },
          { id: "DEV-CUS1", vendor: "Custom",    model: "Turnstile reader (Wiegand→webhook)", kind: "gate-reader", lane: "custom", proto: "Webhook /punch", methods: ["card"], site: "Vientiane Plant 1", zone: "Turnstile A", status: "online", lat: 75, today: 54, enrolled: 0, fw: "bridge 1.1", ip: "10.0.12.50", sn: "CUS-WBG-0001", auth: "AD-bound", last: "5s ago", since: "Jun 2026" }
        ],
        gates: [
          { id: "GATE-01", name: "Main gate turnstile", kind: "turnstile", reader: "DEV-ZK01", controller: "ZKTeco inBio460", lock: "Tripod turnstile", state: "secured", mode: "face + card", today: 142, zone: "Main gate" },
          { id: "GATE-02", name: "Office lobby door",   kind: "door",      reader: "DEV-HK01", controller: "Hikvision DS-K2604", lock: "Maglock 280 kg", state: "secured", mode: "face", today: 36, zone: "Office lobby" },
          { id: "GATE-03", name: "Warehouse roller door", kind: "door",    reader: "DEV-HK02", controller: "Hikvision DS-K2604", lock: "Electric strike", state: "held", mode: "card", today: 19, zone: "Warehouse entry" },
          { id: "GATE-04", name: "Turnstile A (pedestrian)", kind: "turnstile", reader: "DEV-CUS1", controller: "Custom (Wiegand bridge)", lock: "Flap barrier", state: "secured", mode: "card", today: 54, zone: "Turnstile A" },
          { id: "GATE-05", name: "Plant 2 vehicle barrier", kind: "barrier", reader: "DEV-DH01", controller: "Dahua ASC1204C", lock: "Boom barrier", state: "offline", mode: "card", today: 0, zone: "Plant 2 gate" }
        ],
        groups: [
          { id: "GRP-PROD",  name: "Production floor", members: ["EMP-0214", "EMP-0231", "EMP-0188", "EMP-0205", "EMP-0226", "EMP-0240", "EMP-0193", "EMP-0098"], primary: "biometric", allow: ["biometric", "card", "mobile"], geofence: 30, devices: ["DEV-ZK01", "DEV-ZK02"], note: "Face/finger at the line terminals; mobile GPS only as a never-block fallback." },
          { id: "GRP-OFFICE", name: "Office & admin",  members: ["EMP-0021", "EMP-0089", "EMP-0001", "EMP-0002"], primary: "face", allow: ["face", "web"], geofence: 0, devices: ["DEV-HK01"], note: "MinMoe face at the lobby; web clock allowed for desk staff." },
          { id: "GRP-FIELD",  name: "Field & logistics", members: ["EMP-0117", "EMP-0156"], primary: "mobile", allow: ["mobile", "web"], geofence: 120, devices: [], note: "No fixed terminal — mobile selfie + GPS, 120 m geofence around each site." },
          { id: "GRP-WHSE",   name: "Warehouse",        members: ["EMP-0218", "EMP-0222", "EMP-0237"], primary: "card", allow: ["card", "biometric"], geofence: 30, devices: ["DEV-HK02", "DEV-CUS1"], note: "RFID card at the gate; face as fallback when a card is forgotten." }
        ],
        events: [
          { id: "EVT-7741", ts: "08:31:02", dev: "DEV-ZK01", kind: "punch",     msg: "Punch IN · EMP-0240 · face match 0.98", tone: "ok" },
          { id: "EVT-7740", ts: "08:30:55", dev: "DEV-CUS1", kind: "punch",     msg: "Entry · card 0x4F21 → /punch (HMAC ok)", tone: "ok" },
          { id: "EVT-7739", ts: "08:29:40", dev: "DEV-HK02", kind: "error",     msg: "ISAPI poll latency 940 ms — degraded", tone: "warn" },
          { id: "EVT-7738", ts: "08:18:12", dev: "DEV-DH01", kind: "error",     msg: "Connection refused — device offline since 07:19", tone: "bad" },
          { id: "EVT-7737", ts: "08:05:01", dev: "DEV-ZK02", kind: "heartbeat", msg: "Heartbeat ok · clock drift 0.3 s", tone: "ok" },
          { id: "EVT-7736", ts: "06:40:00", dev: "DEV-HIP1", kind: "sync",      msg: "CSV import · 14 rows · 0 errors (review queue)", tone: "ok" },
          { id: "EVT-7735", ts: "06:02:18", dev: "DEV-HK01", kind: "config",    msg: "Time sync from NTP · firmware v3.2.40", tone: "" },
          { id: "EVT-7734", ts: "05:30:00", dev: "DEV-ZK01", kind: "heartbeat", msg: "Nightly keepalive · 96 templates in sync", tone: "ok" }
        ]
      },
      /* ---------- store 13 — db_overtime (v2.4.3 · OT quota & rate policy) ----------
         Per-division overtime budgets (monthly + yearly) with used / remaining hours,
         plus the OT-rate policy. The OT cell (js/overtime.js) is the one writer:
         approving an OT request decrements the live quota and the payroll OT line
         reads from here. Monthly "used" reconciles with db_people.divisions[].ot. */
      db_overtime: {
        quotas: [
          { id: "OQ-PRD-M", div: "Production", scope: "monthly", period: "Jun 2026", limit: 480, used: 412, pending: 18 },
          { id: "OQ-SAL-M", div: "Sales",      scope: "monthly", period: "Jun 2026", limit: 120, used: 86,  pending: 4 },
          { id: "OQ-LOG-M", div: "Logistics",  scope: "monthly", period: "Jun 2026", limit: 120, used: 132, pending: 0 },
          { id: "OQ-FIN-M", div: "Finance",    scope: "monthly", period: "Jun 2026", limit: 40,  used: 22,  pending: 0 },
          { id: "OQ-ADM-M", div: "Admin",      scope: "monthly", period: "Jun 2026", limit: 30,  used: 14,  pending: 0 },
          { id: "OQ-PRD-Y", div: "Production", scope: "yearly",  period: "2026", limit: 5400, used: 2480, pending: 18 },
          { id: "OQ-SAL-Y", div: "Sales",      scope: "yearly",  period: "2026", limit: 1400, used: 690,  pending: 4 },
          { id: "OQ-LOG-Y", div: "Logistics",  scope: "yearly",  period: "2026", limit: 1440, used: 980,  pending: 0 },
          { id: "OQ-FIN-Y", div: "Finance",    scope: "yearly",  period: "2026", limit: 480,  used: 150,  pending: 0 },
          { id: "OQ-ADM-Y", div: "Admin",      scope: "yearly",  period: "2026", limit: 360,  used: 96,   pending: 0 }
        ],
        policy: [
          { id: "OTP-LA", weekday: 150, restday: 200, holiday: 300, night: 150,
            dailyCapH: 3, monthlyCapH: 45, rounding: "15 min",
            note: "Lao Labour Law — overtime ≤ 3 h/day and ≤ 45 h/month; weekday 150%, weekly rest-day 200%, public-holiday rest 300%." }
        ]
      },
      /* ---------- store 14 — db_schedule (v2.4.4 · Job Schedule & shifts) ----------
         The roster's only home. Shift periods (Mon–Sun × 24h, 30-min granularity),
         people groups (position · division · individual · manual), shift-group
         bindings, the published roster, and saved per-account calendar views.
         The calendar core (js/calendar-core.js) is a READ-ONLY lens — it reads
         db_time / db_leave / db_overtime / db_people and never copies them. The
         Schedule cell (js/schedule.js) is the one writer; approving a Swap (SW)
         request in db_workflow updates the roster here. */
      db_schedule: {
        shift_periods: [
          { id: "SP-FULL",  name: "Office full-day", kind: "full-day", start: "08:00", end: "17:00", days: ["Mon","Tue","Wed","Thu","Fri"],        color: "hr",    note: "Desk & admin — a single full day." },
          { id: "SP-MORN",  name: "Morning",         kind: "shift",    start: "06:00", end: "14:00", days: ["Mon","Tue","Wed","Thu","Fri","Sat"], color: "mgr",   note: "Production early shift." },
          { id: "SP-AFT",   name: "Afternoon",       kind: "shift",    start: "14:00", end: "22:00", days: ["Mon","Tue","Wed","Thu","Fri","Sat"], color: "staff", note: "Production late shift — overlaps Morning at the 14:00 handover." },
          { id: "SP-NIGHT", name: "Night",           kind: "shift",    start: "22:00", end: "06:00", days: ["Mon","Tue","Wed","Thu","Fri"],        color: "ceo",   note: "Overnight — 200% rest-day / 300% public-holiday per the OT policy." }
        ],
        groups: [
          { id: "G-PRDA",   name: "Production · Line A", kind: "division", div: "Production", members: ["EMP-0214","EMP-0231","EMP-0188","EMP-0205","EMP-0226","EMP-0240"] },
          { id: "G-PRDB",   name: "Production · Line B", kind: "division", div: "Production", members: ["EMP-0218","EMP-0222","EMP-0237","EMP-0210","EMP-0185"] },
          { id: "G-OFFICE", name: "Office & Admin",      kind: "division", div: "Admin",      members: ["EMP-0021","EMP-0089","EMP-0177","EMP-0233"] },
          { id: "G-WHSE",   name: "Warehouse crew",      kind: "manual",   div: "Logistics",  members: ["EMP-0203","EMP-0219","EMP-0235"] }
        ],
        shift_groups: [
          { id: "SG-PA-M", period: "SP-MORN",  group: "G-PRDA",   label: "Line A · Morning",    cap: 6 },
          { id: "SG-PA-A", period: "SP-AFT",   group: "G-PRDA",   label: "Line A · Afternoon",  cap: 6 },
          { id: "SG-PB-M", period: "SP-MORN",  group: "G-PRDB",   label: "Line B · Morning",    cap: 5 },
          { id: "SG-PB-N", period: "SP-NIGHT", group: "G-PRDB",   label: "Line B · Night",      cap: 4 },
          { id: "SG-OFF",  period: "SP-FULL",  group: "G-OFFICE", label: "Office · Full-day",   cap: 4 },
          { id: "SG-WH-M", period: "SP-MORN",  group: "G-WHSE",   label: "Warehouse · Morning", cap: 3 }
        ],
        roster: [
          { id: "R-0001", date: "2026-06-08", sg: "SG-PA-M", emp: "EMP-0214", status: "published" },
          { id: "R-0002", date: "2026-06-08", sg: "SG-PA-M", emp: "EMP-0231", status: "published" },
          { id: "R-0003", date: "2026-06-08", sg: "SG-PA-A", emp: "EMP-0205", status: "published" },
          { id: "R-0004", date: "2026-06-08", sg: "SG-PB-N", emp: "EMP-0210", status: "published" },
          { id: "R-0005", date: "2026-06-09", sg: "SG-PA-M", emp: "EMP-0214", status: "published" },
          { id: "R-0006", date: "2026-06-09", sg: "SG-PA-A", emp: "EMP-0226", status: "published" },
          { id: "R-0007", date: "2026-06-10", sg: "SG-PA-M", emp: "EMP-0214", status: "published" },
          { id: "R-0008", date: "2026-06-10", sg: "SG-OFF",  emp: "EMP-0021", status: "published" },
          { id: "R-0009", date: "2026-06-11", sg: "SG-PA-A", emp: "EMP-0231", status: "planned" },
          { id: "R-0010", date: "2026-06-12", sg: "SG-PA-A", emp: "EMP-0231", status: "published" },
          { id: "R-0011", date: "2026-06-12", sg: "SG-WH-M", emp: "EMP-0203", status: "published" },
          { id: "R-0012", date: "2026-06-13", sg: "SG-PB-M", emp: "EMP-0218", status: "published" }
        ],
        views: [
          { id: "VW-HR-MONTH", owner: "hr@phoungern.la",      name: "Org month",   perspective: "month",  scope: "all",      def: true },
          { id: "VW-MGR-WEEK", owner: "manager@phoungern.la", name: "Line A week", perspective: "week",   scope: "G-PRDA",   def: true },
          { id: "VW-STAFF",    owner: "staff@phoungern.la",   name: "My shifts",   perspective: "people", scope: "EMP-0214", def: true }
        ]
      },
      db_ledger: {
        cashbook: [
          { id: "CB-0001", date: "2026-06-01", kind: "revenue", cat: "Sales",     note: "Production output — weeks 1–2", amount: 124500000 },
          { id: "CB-0002", date: "2026-06-08", kind: "revenue", cat: "Sales",     note: "Production output — weeks 3–4", amount: 118200000 },
          { id: "CB-0003", date: "2026-06-05", kind: "expense", cat: "Rent",      note: "Site rent — June",          amount: 8500000 },
          { id: "CB-0004", date: "2026-06-06", kind: "expense", cat: "Materials", note: "Raw materials",             amount: 12600000 },
          { id: "CB-0005", date: "2026-06-07", kind: "expense", cat: "Utilities", note: "Power & water",             amount: 3450000 }
        ],
        recurring: [
          { id: "RC-01", cat: "Rent",     note: "Site rent",   amount: 8500000, freq: "M", next: "2026-07-05" },
          { id: "RC-02", cat: "Internet", note: "Fibre + VoIP", amount: 1350000, freq: "M", next: "2026-07-01" }
        ]
      }
    };
  }

  /* ---------- load / persist ---------- */
  const data = {};
  function key(id) { return NS + "db." + TENANT + "-" + id; }
  function persist(id) {
    try { LS.setItem(key(id), JSON.stringify({ v: SEED_VERSION, t: Date.now(), tables: data[id] })); } catch (e) { /* quota — demo keeps running in-memory */ }
    try { if (window.SYNC && window.SYNC.enqueue) window.SYNC.enqueue(id); } catch (e) { /* cloud sync is optional */ }
  }
  /* cloud-sync hooks (js/d1-sync.js) — no-ops unless API_CONFIG.base (the D1 Worker) is set */
  function localMeta(id) { try { const p = JSON.parse(LS.getItem(key(id)) || "null"); return p ? { v: p.v, t: p.t } : null; } catch (e) { return null; } }
  function raw(id) { return data[id]; }
  // v2.4.5 G9 — durable platform settings (FLAGS/LICENSE persistence) under db_platform.settings
  function platformGet(k) { try { return (data.db_platform && data.db_platform.settings && data.db_platform.settings[k]) || null; } catch (e) { return null; } }
  function platformSet(k, obj) { try { if (!data.db_platform.settings) data.db_platform.settings = {}; data.db_platform.settings[k] = obj; persist("db_platform"); } catch (e) {} return obj; }
  function hydrate(id, tables, t) {
    if (!byId[id] || !tables) return false;
    data[id] = tables;
    try { LS.setItem(key(id), JSON.stringify({ v: SEED_VERSION, t: t || Date.now(), tables })); } catch (e) { /* quota */ }
    return true; // note: hydrate persists WITHOUT enqueueing — a pull must never echo back as a push
  }
  function loadAll() {
    const sd = seeds();
    CATALOG.forEach(c => {
      let ok = false;
      try {
        const raw = LS.getItem(key(c.id));
        if (raw) { const p = JSON.parse(raw); if (p && p.v === SEED_VERSION && p.tables) { data[c.id] = p.tables; ok = true; } }
      } catch (e) { /* fall through to seed */ }
      if (!ok) { data[c.id] = sd[c.id]; persist(c.id); }
    });
  }
  loadAll();

  /* ---------- clock helpers ---------- */
  const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const stamp = () => { const d = new Date(); return d.toLocaleString("en-US", { month: "short", day: "2-digit" }) + " · " + now(); };

  /* ---------- audit — every write becomes a fact (§05 sync path) ---------- */
  function audit(who, act, obj, ip) {
    data.db_audit.events.unshift({ ts: now(), who, act, obj, ip: ip || "console" });
    if (data.db_audit.events.length > 250) data.db_audit.events.length = 250;
    persist("db_audit");
  }

  /* ---------- CRUD — one writer per store, enforced at the call site ---------- */
  function list(store, table) { return (data[store] && data[store][table]) || []; }
  function add(store, table, row, who) {
    if (byId[store] && byId[store].derived) return null;
    data[store][table].unshift(row);
    persist(store);
    if (store !== "db_audit") audit(who || "console", store.replace(/^d[bw]_/, "") + "." + table + ".row_added", row.id || row.name || row.code || table, "studio");
    return row;
  }
  function del(store, table, field, value, who) {
    if (byId[store] && byId[store].append) return false; // audit ledger is append-only — immutable by design
    const arr = data[store][table];
    const i = arr.findIndex(r => String(r[field]) === String(value));
    if (i < 0) return false;
    arr.splice(i, 1);
    persist(store);
    audit(who || "console", store.replace(/^d[bw]_/, "") + "." + table + ".row_deleted", String(value), "studio");
    return true;
  }
  function reset(store, who) {
    const sd = seeds();
    if (store) { data[store] = sd[store]; persist(store); audit(who || "console", "store.reseeded", TENANT + "-" + store.replace(/^d[bw]_/, ""), "studio"); }
    else { CATALOG.forEach(c => { data[c.id] = sd[c.id]; persist(c.id); }); audit(who || "console", "tenant.reseeded", TENANT + " · all stores", "studio"); }
  }

  /* ---------- store meta ---------- */
  function rows(id) { return Object.values(data[id] || {}).reduce((n, t) => n + (Array.isArray(t) ? t.length : 0), 0); }
  function sizeKB(id) { try { return Math.max(1, Math.round(JSON.stringify(data[id]).length / 1024)); } catch (e) { return 0; } }
  function provisioned(id) {
    const c = byId[id];
    if (c && c.gate && window.DATA && !DATA.has(c.gate)) return false;
    return true;
  }
  function meta(id) { const c = byId[id]; return { ...c, rows: rows(id), sizeKB: sizeKB(id), physical: TENANT + "-" + id.replace(/^d[bw]_/, ""), provisioned: provisioned(id) }; }
  function policy(id) { return data.db_platform.backup_policies.find(p => p.store === id); }
  function regRow(id) { return data.db_platform.registry.find(p => p.store === id); }

  /* ---------- backups — the B1/B2/B3 ladder, simulated honestly ----------
     B1 continuous = every persist() is a commit (localStorage write)
     B2 snapshots  = explicit copies in the custodial area below
     B3 replay     = db_audit facts + dw_reports rebuild               */
  const BK = NS + "backups";
  function bkAll() { try { return JSON.parse(LS.getItem(BK) || "[]"); } catch (e) { return []; } }
  function bkSave(arr) { try { LS.setItem(BK, JSON.stringify(arr)); } catch (e) { /* quota guard: drop oldest and retry once */ try { arr.splice(12); LS.setItem(BK, JSON.stringify(arr)); } catch (e2) {} } }
  let bkSeq = bkAll().reduce((m, b) => Math.max(m, Number(String(b.id).replace(/\D/g, "")) - 1000), 0);

  function backupNow(storeIds, kind, label, who) {
    const ids = (storeIds && storeIds.length ? storeIds : CATALOG.map(c => c.id)).filter(provisioned);
    const snap = {};
    ids.forEach(id => { snap[id] = JSON.parse(JSON.stringify(data[id])); });
    const all = bkAll();
    bkSeq += 1;
    const bk = {
      id: "BK-" + String(1000 + bkSeq), ts: stamp(), kind: kind || "manual",
      label: label || (kind === "scheduled" ? "Scheduled export" : kind === "pre-run" ? "Pre-run branch" : "Manual snapshot"),
      stores: ids, rows: ids.reduce((n, id) => n + rows(id), 0),
      sizeKB: Math.max(1, Math.round(JSON.stringify(snap).length / 1024)), data: snap
    };
    all.unshift(bk);
    // retention: keep it sane inside localStorage — 10 scheduled + 14 of everything else
    const sch = all.filter(b => b.kind === "scheduled").slice(0, 10);
    const oth = all.filter(b => b.kind !== "scheduled").slice(0, 14);
    bkSave(all.filter(b => sch.includes(b) || oth.includes(b)));
    audit(who || "system", "backup.exported", bk.id + " · " + ids.length + " store" + (ids.length > 1 ? "s" : "") + " → L-CU", kind === "scheduled" ? "night-job" : "studio");
    return bk;
  }
  function backupRestore(bkId, storeIds, who) {
    const bk = bkAll().find(b => b.id === bkId);
    if (!bk) return null;
    const ids = (storeIds && storeIds.length ? storeIds : bk.stores).filter(id => bk.data[id]);
    ids.forEach(id => {
      if (byId[id] && byId[id].append) { // audit ledger: restores append a fact, never rewrite
        audit(who || "console", "backup.audit_verified", bkId + " · WORM copy matches", "drill");
        return;
      }
      if (byId[id] && byId[id].sensitive) { // sensitive custody (v2.5 §3 · v2.4.1 edge): a restore
        const keep = data[id];               // recreates access state — never live logins, open
        const snap = JSON.parse(JSON.stringify(bk.data[id])); // links, or the device-local simulator
        snap.sessions = keep.sessions; snap.tokens = keep.tokens; snap.directory = keep.directory;
        data[id] = snap;
        persist(id);
        audit(who || "console", "identity.sessions_excluded", bkId + " · sessions, tokens & directory simulator kept live, never restored", "custody");
        return;
      }
      data[id] = JSON.parse(JSON.stringify(bk.data[id]));
      persist(id);
    });
    audit(who || "console", "backup.restored", bkId + " → " + ids.join(", "), "studio");
    return ids;
  }
  function backupClear(who) {
    const n = bkAll().length;
    bkSave([]);
    audit(who || "Thip N.", "backup.history_cleared", n + " snapshot" + (n === 1 ? "" : "s") + " expired (demo reset)", "studio");
    return n;
  }
  function backupDelete(bkId, who) {
    const all = bkAll();
    const i = all.findIndex(b => b.id === bkId);
    if (i < 0) return false;
    all.splice(i, 1); bkSave(all);
    audit(who || "console", "backup.expired", bkId, "retention");
    return true;
  }
  function exportObj(storeIds) {
    const ids = (storeIds && storeIds.length ? storeIds : CATALOG.map(c => c.id)).filter(provisioned);
    const out = { platform: "Adeptio Adaptive HR · v2.4.3.edge.auth", tenant: TENANT, exported: new Date().toISOString(), stores: {} };
    ids.forEach(id => out.stores[id] = data[id]);
    return out;
  }

  /* ---------- scheduler — per-module, customizable, catches up on load ---------- */
  const FREQ_MS = { "hourly": 36e5, "6-hourly": 216e5, "nightly": 864e5, "daily-worm": 864e5, "weekly": 6048e5, "monthly": 2592e6 };
  function setPolicy(store, patch, who) {
    const p = policy(store);
    if (!p) return;
    Object.assign(p, patch);
    persist("db_platform");
    audit(who || "Thip N.", "backup.policy_changed", TENANT + "-" + store.replace(/^d[bw]_/, "") + " · " + (patch.freq || (patch.enabled === false ? "disabled" : "updated")), "studio");
  }
  function tick() {
    const due = [];
    const t = Date.now();
    data.db_platform.backup_policies.forEach(p => {
      if (!p.enabled || p.freq === "off" || !provisioned(p.store)) return;
      const ms = FREQ_MS[p.freq] || 864e5;
      if (!p.last || t - p.last >= ms) { due.push(p.store); p.last = t; }
    });
    if (due.length) {
      persist("db_platform");
      backupNow(due, "scheduled", "Scheduled export · " + due.length + " store" + (due.length > 1 ? "s" : ""), "system");
    }
    return due;
  }

  /* ---------- restore drill — P5: restore is a habit, not a hope ---------- */
  function drill(who) {
    const pool = CATALOG.filter(c => !c.derived && provisioned(c.id));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const branch = JSON.parse(JSON.stringify(data[pick.id])); // instant branch — metadata-only in Turso, deep copy here
    const okRows = Object.keys(branch).every(tb => branch[tb].length === data[pick.id][tb].length);
    const okSum = JSON.stringify(branch).length === JSON.stringify(data[pick.id]).length;
    const result = okRows && okSum ? "pass" : "fail";
    const d = { id: "DR-" + String(18 + data.db_platform.drills.length).padStart(4, "0"), ts: stamp(), target: TENANT + "-" + pick.id.replace(/^d[bw]_/, "") + " + db_platform", result, checks: "integrity " + (okSum ? "✓" : "✗") + " · row counts " + (okRows ? "✓" : "✗") + " · checksums " + (okSum ? "✓" : "✗") };
    data.db_platform.drills.unshift(d);
    persist("db_platform");
    audit(who || "system", "restore.drill_" + result, d.target, "drill");
    return d;
  }

  /* ---------- generated report runs — dw_reports.generated ----------
     The Projector (report engine) is the ONE writer of this table.
     Retention rule: per report, the newest 3 runs stay visible in the
     report section; older runs auto-archive into file storage (one
     folder per report); beyond 12 they expire. ---------- */
  const VISIBLE_RUNS = 3, MAX_RUNS = 12;
  function reportRuns(reportId) {
    const all = data.dw_reports.generated || (data.dw_reports.generated = []);
    return reportId ? all.filter(r => r.report === reportId) : all;
  }
  function reportSave(run, who) {
    const all = reportRuns();
    all.unshift(run);
    // retention per report: first 3 visible, rest archived, >12 expire
    const mine = all.filter(r => r.report === run.report);
    mine.forEach((r, i) => { r.archived = i >= VISIBLE_RUNS; });
    mine.slice(MAX_RUNS).forEach(r => { const i = all.indexOf(r); if (i >= 0) all.splice(i, 1); });
    persist("dw_reports");
    audit(who || "system", "report.generated", run.id + " · " + run.report + " → reports/" + TENANT + "/" + run.report + "/", "projector");
    return run;
  }
  function reportDelete(runId, who) {
    const all = reportRuns();
    const i = all.findIndex(r => r.id === runId);
    if (i < 0) return false;
    const r = all[i];
    all.splice(i, 1);
    persist("dw_reports");
    audit(who || "system", "report.expired", runId + " · " + r.report, "retention");
    return true;
  }
  function nextReportId() {
    const n = reportRuns().reduce((m, r) => Math.max(m, Number(String(r.id).replace(/\D/g, "")) || 0), 1000);
    return "RPT-" + (n + 1);
  }

  /* ---------- dw_reports rebuild — B3 replay, demonstrated ---------- */
  function rebuildReports(who) {
    const pro = data.dw_reports.org_snapshots.find(s => s.tier === "professional");
    const ess = data.dw_reports.org_snapshots.find(s => s.tier === "essential");
    const emp = data.db_people.employees;
    if (pro) {
      pro.present = emp.filter(e => e.state === "present").length + (pro.headcount - emp.length);
      pro.late = emp.filter(e => e.state === "late").length;
      pro.absent = emp.filter(e => e.state === "absent").length;
      pro.onleave = emp.filter(e => e.state === "onleave").length;
    }
    if (ess) { ess.late = emp.filter(e => e.state === "late").length; ess.absent = emp.filter(e => e.state === "absent").length; }
    persist("dw_reports");
    audit(who || "system", "dw.rebuilt", TENANT + "-reports · replayed from " + data.db_audit.events.length + " facts", "projector");
    return data.db_audit.events.length;
  }

  // browser only: scheduler heartbeat (1-min check; frequencies are real)
  // + catch-up tick shortly after load — overdue stores export immediately, so
  //   a tenant can never sit half-protected (§09: backups follow provisioning)
  if (typeof document !== "undefined") {
    setTimeout(() => { const d = tick(); if (d.length && window.DATA) DATA.pulse && DATA.pulse(); }, 1500);
    setInterval(() => { const d = tick(); if (d.length && window.DATA) DATA.pulse && DATA.pulse(); }, 60000);
  }

  return {
    TENANT, CATALOG, list, add, del, reset, meta, rows, sizeKB, provisioned,
    policy, setPolicy, regRow, audit, now, stamp,
    backups: { all: bkAll, now: backupNow, restore: backupRestore, remove: backupDelete, clear: backupClear },
    reports: { runs: reportRuns, save: reportSave, remove: reportDelete, nextId: nextReportId, VISIBLE: VISIBLE_RUNS },
    exportObj, tick, drill, rebuildReports,
    persist, localMeta, raw, hydrate, platformGet, platformSet
  };
})();
