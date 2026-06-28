/* ============================================================
   ADEPTIO · SYSTEM ADMIN persona — teal · platform only
   Web: Health · Templates(→editor) · Channels · Roles ·
        Integrations · Audit
   Mobile (alerts-first): Health · Templates · Audit
   Never shows employee records or pay — by design.
   ============================================================ */
(function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, table, steps, empty, sparkline, donut, bars, legend, lockTag, lockBtn, esc } = UI;

  /* ============================================================
     v2.4.2 — Devices (BioMetrics · Gates · Device monitor)
     Pro+Enterprise split is communicated by tier chips; the nav
     items stay reachable so the whole flow demos on Professional
     (preview locked features — the tier toggle can't reach Ent).
     ============================================================ */
  const tierChip = (gate) => DEVICES.has(gate) ? "" : UI.lockTag(DATA.unlockLabel(gate));
  const statusBadge = (s) => `<span class="badge ${DEVICES.statusTone(s)}">${DEVICES.statusLabel(s)}</span>`;
  const laneLabel = { A: "Lane A · device-push", B: "Lane B · server-pull", C: "Lane C · file / on-device", custom: "Custom · webhook" };

  function vendorCard(v) {
    const n = DEVICES.deviceCount(v.name);
    const tier = v.tier === "biometrics" ? "Professional" : "Enterprise";
    const locked = !DEVICES.has(v.tier);
    return `<div class="card" style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:center;gap:9px">
        <span class="ric">${icon(v.icon)}</span>
        <div style="min-width:0"><div class="rt" style="font-weight:650">${v.name}${v.premium ? ` <span class="small muted">· premium</span>` : ""}${v.open ? ` <span class="small muted">· open</span>` : ""}</div>
          <div class="rs small muted">${esc(v.proto)}</div></div>
        <span style="margin-left:auto">${locked ? UI.lockTag(tier + " · ≤" + (tier === "Enterprise" ? "600" : "250")) : `<span class="badge plain">${tier}</span>`}</span>
      </div>
      <p class="small muted" style="margin:0">${esc(v.blurb)}</p>
      <div class="small muted" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <span class="badge plain">${laneLabel[v.lane]}</span>
        <span class="badge plain">conf ${v.conf}</span>
        ${v.ad ? `<span class="badge plain">AD / RADIUS bind ✓</span>` : `<span class="badge plain">app auth</span>`}
        ${n ? `<span class="badge ok">${n} connected</span>` : ""}
      </div>
      <div class="small muted">Models: ${esc(v.models)}</div>
      <div style="display:flex;gap:8px;margin-top:2px">
        <button class="btn sm" data-go="sysadmin/web/device-new/${v.id}">${icon("plus")} Add ${v.name}</button>
      </div>
    </div>`;
  }

  // one config field from a vendor spec → form control (secrets are vault refs, shown masked)
  function paramField(f) {
    if (f.type === "cloud") {
      const locked = !DEVICES.has(f.tier || "deviceCloud");
      return `<div class="field"><label>${esc(f.label)} ${locked ? UI.lockTag("Enterprise · ≤600") : `<span class="badge plain">Enterprise</span>`}</label>
        <div class="small muted">${esc(f.note || "")}</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input class="input" placeholder="AppKey" ${locked ? "disabled" : ""}>
          <input class="input" placeholder="AppSecret (vault ref)" ${locked ? "disabled" : ""}>
        </div></div>`;
    }
    const lab = `<label>${esc(f.label)}${f.req ? ' <span style="color:var(--bad)">*</span>' : ""}${f.vault ? ` <span class="badge plain">vault ref</span>` : ""}</label>`;
    let ctrl;
    if (f.type === "readonly") ctrl = `<input class="input mono" value="${esc(f.val || "")}" readonly style="background:var(--surface-2)">`;
    else if (f.type === "toggle") ctrl = `<label class="switch-row" style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-f="${f.k}" ${f.val ? "checked" : ""}> <span class="small muted">${f.val ? "on" : "off"}</span></label>`;
    else if (f.type === "select") ctrl = `<select class="input" data-f="${f.k}">${(f.opts || []).map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
    else if (f.type === "area") ctrl = `<textarea class="input mono" data-f="${f.k}" style="min-height:64px" placeholder="${esc(f.ph || "")}"></textarea>`;
    else if (f.type === "secret") ctrl = `<input class="input" data-f="${f.k}" type="password" placeholder="${esc(f.ph || "••••••")}" autocomplete="off">`;
    else ctrl = `<input class="input" data-f="${f.k}" value="${f.val != null ? esc(String(f.val)) : ""}" placeholder="${esc(f.ph || "")}">`;
    return `<div class="field">${lab}${ctrl}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</div>`;
  }

  function templateRows(device) {
    return table(
      [{ h: "Template" }, { h: "Kind" }, { h: "Lang" }, { h: "v" }, { h: "Status" }, { h: "", r: 1 }],
      DATA.templates.map(tp => ({
        go: `sysadmin/${device}/template/${tp.id}`,
        cells: [`<span class="strong">${tp.name}</span> <span class="small muted">${tp.id}</span>`, tp.kind, tp.lang, `<span class="num">${tp.v}</span>`, badge(tp.status), icon("chevR")]
      })));
  }

  /* ---------- WEB ---------- */
  const web = {
    health() {
      return {
        title: "Platform health", sub: "The control plane at a glance — channels, integrations, sessions and the audit pulse.",
        actions: `<button class="btn soft" data-act="comms-test-all">${icon("plug")} Test gateways</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Delivery rate", "99.1%", "email · SMS · push blended", { hero: 1 })}
          ${kpi("Uptime", "99.98%", "30-day rolling")}
          ${kpi("Live sessions", String(AUTH.stats().sessions), AUTH.stats().loginsToday + " sign-in(s) on the ledger")}
          ${kpi("Lockouts", String(AUTH.stats().lockoutsToday), AUTH.stats().locked + " locked now · " + AUTH.stats().failsToday + " failed attempts")}
        </div>
        <div class="grid cols-3" style="margin-top:16px">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Needs attention", rowlist([
          rowitem({ icon: "x", title: "LINE OA webhook — down", sub: "since 09:31 · failover active · HR notified", side: `<button class="btn xs soft" data-act="comms-reconnect:line-oa-bridge">Reconnect</button>` }),
          rowitem({ icon: "alert", title: "SMS sender ID cert — expiring", sub: "LaoTel · renew by Jul 01", side: badge("expiring") }),
          rowitem({ icon: "file", title: "2 templates awaiting review", sub: "TPL-023 · TPL-026", side: `<button class="btn xs ghost" data-go="sysadmin/web/templates">Review</button>` }),
          rowitem({ icon: "key", title: "1 role request", sub: "manager → team reports scope", side: `<button class="btn xs ghost" data-go="sysadmin/web/roles">Decide</button>` })
        ]), { icon: "bell" })}
            ${card("Audit pulse — events today", sparkline([84, 96, 122, 141, 138, 156, 149, 171, 162, 178], { h: 84 }) + `<div class="small muted" style="margin-top:8px"><b class="num" style="color:var(--ink)">1,204</b> events · append-only ledger (db_audit) · 0 anomalies</div>`, { icon: "pulse", link: "sysadmin/web/audit" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Channels", rowlist(DATA.channels.map(c => rowitem({ icon: c.status === "live" ? "check" : "x", neutral: c.status !== "live", title: c.name, sub: c.id, side: badge(c.status) }))), { icon: "plug", link: "sysadmin/web/channels" })}
            ${card("Boundary", `<p class="small muted">This persona administers the platform <b>beneath</b> the ledger — templates, channels, roles, audit. It never reads employee records or pay. Modules 11–12 <i>are</i> the shared kernel, with this console on top.</p>`, { icon: "lock" })}
          </div>
        </div>`
      };
    },

    templates() {
      return {
        title: "Content & templates — CMS", sub: "Author once, reuse everywhere: letters, emails, SMS, custom frames — versioned draft → review → publish.",
        actions: `<button class="btn" data-act="comms-new-template">${icon("plus")} New template</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Published", "14", "in the library", { hero: 1 })}
          ${kpi("In review", "1", "TPL-023")}
          ${kpi("Drafts", "1", "TPL-026")}
          ${kpi("Bilingual", "12 / 16", "EN · ລາວ pairs")}
        </div>
        ${card("Library", templateRows("web"), { icon: "files" })}
        ${card("Who consumes these", `<p class="small muted">HR composes <i>from</i> published templates (communication + documents) but can't rewrite the master. Automated notifications — payslip ready, leave approved, doc expiry — draw from the same versioned source, so manual and automatic sends stay on-brand together.</p>`, { icon: "send" })}`
      };
    },

    template(id) {
      const tp = DATA.templates.find(x => x.id === id) || DATA.templates[0];
      const isPub = tp.status === "published";
      return {
        title: tp.name, sub: `${tp.kind} · ${tp.lang} · version ${tp.v} — merge fields resolve from the people-ledger at send time.`,
        crumbs: [{ label: "Templates", go: "sysadmin/web/templates" }, { label: tp.id }],
        actions: `${idtag(tp.id)} ${badge(tp.status)}`,
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div class="card-head"><span class="t">${icon("edit")} Editor</span><span class="badge plain">EN draft</span></div>
            <div class="field"><label>Subject / heading</label><input class="input" value="${tp.name === "Town hall announcement" ? "You're invited — Q3 town hall" : tp.name}"></div>
            <div class="field"><label>Body</label>
              <textarea class="input" style="min-height:150px">Dear {{first_name}},

${tp.kind.includes("SMS") ? "Shift reminder: {{shift_date}} {{shift_time}} at {{site}}. Reply 1 to confirm." : "You're invited to the Q3 town hall on {{date}} at {{site}}.\nAgenda and joining details follow in this message…"}

— {{company_name}} HR</textarea>
              <span class="hint">Merge fields: {{first_name}} · {{date}} · {{site}} · {{position}} · {{employee_id}} — validated against the people-ledger schema.</span>
            </div>
            <div style="display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap">
              <button class="btn ghost" data-act="comms-preview-template:${tp.id}">${icon("eye")} Preview</button>
              <button class="btn ghost soon" title="Build-phase feature — not wired in this UI preview" data-act="toast:ລາວ variant opens side-by-side in the build phase">${icon("globe")} ລາວ variant</button>
              ${isPub ? `<button class="btn soft" data-act="comms-clone-template:${tp.id}">${icon("files")} Clone as custom</button>` : `<button class="btn" data-act="comms-publish-template:${tp.id}">${icon("check")} Publish v${tp.v}</button>`}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Lifecycle", steps([{ t: "Draft", s: "author" }, { t: "Review", s: "wording · fields" }, { t: "Publish", s: "locked & dated" }], isPub ? 3 : tp.status === "review" ? 1 : 0), { icon: "layers" })}
            ${card("Versions", rowlist([
          rowitem({ icon: "check", title: "v" + tp.v + " — current", sub: "updated " + tp.updated, side: badge(tp.status) }),
          rowitem({ icon: "history", title: "v" + (parseFloat(tp.v) - 0.1).toFixed(1), sub: "superseded", side: `<span class="badge plain">archived</span>`, neutral: 1 })
        ]), { icon: "history" })}
            ${card("Open as custom", `<p class="small muted">Locked at the master — any tenant can clone &amp; tailor. Publishing is versioned and audit-logged, so legal wording holds across every send.</p>`, { icon: "lock" })}
          </div>
        </div>`
      };
    },

    channels() {
      return {
        title: "Channels & gateways", sub: "Email, SMS, push and webhooks — sender identities, keys and fallbacks live here.",
        actions: `<button class="btn" data-act="comms-add-channel">${icon("plus")} Add channel</button>`,
        body: `
        ${card("Gateways", table(
          [{ h: "Channel" }, { h: "Endpoint / ID" }, { h: "Today", r: 1 }, { h: "Delivery", r: 1 }, { h: "Status" }, { h: "", r: 1 }],
          DATA.channels.map(c => ({
            cells: [`<span class="strong">${c.name}</span>`, `<span class="mono small">${c.id}</span>`, `<span class="num">${c.today}</span>`, `<span class="num">${c.rate}</span>`, badge(c.status),
            `<button class="btn xs ghost" data-act="comms-test:${c.id}">Test</button>`]
          }))), { icon: "plug" })}
        <div class="grid cols-2">
          ${card("Tier gating", rowlist([
          rowitem({ icon: "check", title: "Email + in-app / push", sub: "Core — every tier", side: badge("active") }),
          rowitem({ icon: "check", title: "SMS + segmentation", sub: "Professional ≤ 250", side: badge("active") }),
          rowitem({ icon: "lock", title: "Webhooks — LINE / WhatsApp / Teams", sub: "Enterprise ≤ 600", side: `<span class="badge plain">upgrade</span>`, neutral: 1 })
        ]), { icon: "layers" })}
          ${card("Fallback policy", `<p class="small muted" style="margin-bottom:10px">Push first → SMS if unread after 4h — defined once, used by HR sends and automated notifications alike.</p><button class="btn sm ghost soon" title="Build-phase feature — not wired in this UI preview" data-act="toast:Fallback editor is a build-phase feature">${icon("settings")} Edit policy</button>`, { icon: "refresh" })}
        </div>`
      };
    },

    roles() {
      const cap = (txt, tone) => `<span class="badge ${tone || ""} plain">${txt}</span>`;
      return {
        title: "Roles & permissions", sub: "The five-persona separation itself — every cell registers its capability row (socket: rbac); the kernel enforces scope.",
        actions: `<button class="btn soft" data-act="wf-role-approve">${icon("check")} 1 request</button>`,
        body: `
        ${card("Capability matrix — module × persona", `<div class="tablewrap"><table class="tbl">
          <thead><tr><th>Module</th><th>Staff</th><th>Manager</th><th>HR</th><th>CEO</th><th>Sys Admin</th></tr></thead>
          <tbody>
            ${[
          ["People & Org", "✎ own profile", "◴ view team", "⚙ manage all", "∑ headcount", "⚒ roles & fields"],
          ["Time & Attendance", "✎ punch / correct", "✓ L1 + team", "⚙ adjust ledger", "∑ utilization", "⚒ device hooks"],
          ["Leave & Absence", "✎ request", "✓ L1 + calendar", "⚙ accrual + L2", "∑ absence cost", "— none"],
          ["Payroll + Payslips", "◴ own payslip", "— none", "⚙ run + approve", "∑ burn", "⚒ bank / SMTP"],
          ["Requests & Approvals", "✎ submit", "✓ L1", "⚙ L2 + chains", "∑ SLA", "⚒ permissions"],
          ["Reports & Insight", "◴ own", "◴ team", "⚙ all", "∑ board KPIs", "— none"],
          ["Communication", "◴ receive", "✎ team multicast", "⚙ compose & send", "∑ reach", "⚒ channels"],
          ["Docs Vault", "✎ own + policies", "◴ team docs", "⚙ all + versions", "∑ ack %", "⚒ retention"],
          ["CMS / Templates", "— none", "— none", "◴ compose from", "— none", "⚒ author & publish"],
          ["Platform & Security", "— none", "— none", "— none", "— none", "⚒ owns"]
        ].map(r => `<tr><td class="strong">${r[0]}</td>${r.slice(1).map((c, i) => `<td><span class="small" style="color:${c.startsWith("—") ? "var(--muted-2)" : ["var(--staff-d)", "var(--mgr-d)", "var(--hr-d)", "var(--ceo-d)", "var(--sys-d)"][i]}">${c}</span></td>`).join("")}</tr>`).join("")}
          </tbody></table></div>
          <div class="legend" style="margin-top:12px"><span>✎ create/edit own</span><span>✓ approve</span><span>⚙ configure (full)</span><span>◴ view (scoped)</span><span>∑ aggregate read-only</span><span>⚒ administer platform</span></div>`,
          { icon: "key" })}
        ${card("Proof of separation", `<p class="small muted">The CEO column is uniformly ∑ aggregate; the System Admin column is uniformly ⚒ platform. Neither can touch the people-ledger — a content edit or permission change can never silently alter a pay or leave record.</p>`, { icon: "shield" })}`
      };
    },

    integrations() {
      return {
        title: "Integrations & SSO", sub: "Identity, exports and capture devices — every external surface, declared and monitored.",
        actions: `<button class="btn soon" title="Build-phase feature — not wired in this UI preview" data-act="toast:Integration catalog is a build-phase feature — certified plug-ins register via module manifest (§06)">${icon("plus")} Add integration</button>`,
        body: `
        ${card("Connected", rowlist([
          rowitem({ icon: "key", title: "Single sign-on — OIDC", sub: "id.phoungern.la · 99.4% success", side: badge("live") }),
          rowitem({ icon: "banknote", title: "Bank file export — BCEL", sub: "payroll disburse · SFTP drop", side: badge("live") }),
          rowitem({ icon: "grid", title: "Attendance devices ×2", sub: "face + finger · Plant 1 gates", side: badge("live") }),
          rowitem({ icon: "globe", title: "Public API — /api/v1", sub: "3 tokens active · rate-limited", side: badge("live") })
        ]), { icon: "plug" })}
        <div class="grid cols-2">
          ${card("Extension slots — declared seats (§06)", rowlist([
          rowitem({ icon: "receipt", title: "E1 · Expenses & Advances", sub: "in: employee.hired → out: expense.posted · db_expense", side: `<span class="badge warn plain">planned</span>` }),
          rowitem({ icon: "box", title: "E2 · Assets & Inventory", sub: "onboard kit · custody · returns", side: `<span class="badge warn plain">planned</span>` }),
          rowitem({ icon: "heart", title: "E3 · Insurance & Benefits", sub: "enrollment · premium → payroll", side: `<span class="badge warn plain">planned</span>` }),
          rowitem({ icon: "sparkle", title: "E4–E7 · ATS · Training · Performance · Loans", sub: "candidates — same six-socket contract", side: `<span class="badge plain">candidate</span>`, neutral: 1 })
        ]), { icon: "layers" })}
          ${card("Module registry", `<p class="small muted" style="margin-bottom:10px">In-house cells and certified plug-ins arrive the same way: declare manifest → contract + security review → register → enable per tenant → monitor. Disable the flag and UI, reports and permissions disappear cleanly (R6).</p>
          <div class="mono small" style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px;line-height:1.7">id: expenses · v1.0.0<br>owns_store: db_expense<br>api: /api/v1/expenses<br>ui: cards ×3 · nav "Expenses"<br>tier: professional+</div>`, { icon: "file" })}
        </div>`
      };
    },

    /* ---------- v2.3.2.db — Database Studio (whole-platform DB management) ---------- */
    database() {
      const totalRows = DB.CATALOG.reduce((n, c) => n + (DB.provisioned(c.id) ? DB.rows(c.id) : 0), 0);
      const totalKB = DB.CATALOG.reduce((n, c) => n + (DB.provisioned(c.id) ? DB.sizeKB(c.id) : 0), 0);
      const live = DB.CATALOG.filter(c => DB.provisioned(c.id)).length;
      return {
        title: "Database studio", sub: "The §05 split, made physical — one small database per tenant × store, one writer each. Click a store to browse and edit its sample rows.",
        actions: `<button class="btn soft" data-go="sysadmin/web/backups">${icon("download")} Backup center</button>
                  <button class="btn ghost" data-act="db-reset:all">${icon("refresh")} Reseed all stores</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Stores live", `${live} / ${DB.CATALOG.length}`, DATA.tier() === "essential" ? "Essential ships 8 + platform" : "Growth+ provisions db_docs", { hero: 1 })}
          ${kpi("Rows", String(totalRows), "across all live stores")}
          ${kpi("Footprint", totalKB + " KB", "megabytes, not gigabytes")}
          ${kpi("Snapshots", String(DB.backups.all().length), "in custodial storage (L-CU)")}
        </div>
        ${card("Stores — one database per tenant × store", DBV.storeGrid("sysadmin/web/dbstore"), { icon: "layers" })}
        <div class="grid cols-2">
          ${card("Demo reset — sectional, per store", DBV.resetPanel(), { icon: "refresh", badge: `<span class="badge warn plain">demo</span>` })}
          ${card("Provisioning grid — tenant × store (§02)", DBV.provisionGrid(), { icon: "grid" })}
          ${card("Placement registry — db_platform resolves every store", table(
            [{ h: "Store" }, { h: "Physical DB" }, { h: "Region" }, { h: "Encryption" }, { h: "PITR", r: 1 }],
            DB.list("db_platform", "registry").slice(0, 10).map(r => ({
              cells: [`<span class="mono small strong">${r.store}</span>`, `<span class="mono small">${r.physical}</span>`, `<span class="small muted">${r.region}</span>`, `<span class="small">${r.encryption}</span>`, `<span class="num">${r.pitr}</span>`]
            }))) + `<p class="small muted" style="margin-top:10px">Cells never hard-code locations — the kernel resolves (tenant, store) → URL + credential here. Moving a store = a registry edit, not an application change (P6).</p>`, { icon: "pin" })}
        </div>`
      };
    },

    dbstore(id) {
      const sid = DB.CATALOG.find(c => c.id === id) ? id : "db_people";
      const d = DBV.storeDetail(sid);
      return {
        title: d.m.name + " — " + d.m.physical, sub: `${d.m.layer} · ${d.m.profile} · one writer: ${d.m.writer}. ${d.m.protection}`,
        crumbs: [{ label: "Database studio", go: "sysadmin/web/database" }, { label: sid }],
        actions: `${idtag(d.m.physical)} ${d.m.provisioned ? badge(d.m.derived ? "readonly" : "active") : UI.lockTag(DATA.unlockLabel(d.m.gate))}`,
        body: `
        <div class="grid cols-4">
          ${kpi("Rows", String(d.m.rows), d.m.tables.length + " table" + (d.m.tables.length > 1 ? "s" : ""), { hero: 1 })}
          ${kpi("Size", d.m.sizeKB + " KB", "persisted unit")}
          ${kpi("Backup", d.p && d.p.enabled ? d.p.freq : "off", d.p ? d.p.custody.split(" ·")[0] : "—")}
          ${kpi("Restore priority", "P" + d.m.priority, d.m.priority === 1 ? "restored first in a drill" : "standard ladder")}
        </div>
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">${d.tables}</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Module actions — blast radius: this store only", `<div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn soft" data-act="backup-store:${sid}">${icon("download")} Snapshot this store now</button>
              <button class="btn ghost" data-act="store-restore:${sid}">${icon("refresh")} Restore latest snapshot${d.lastBk ? " · " + d.lastBk.id : ""}</button>
              <button class="btn ghost" data-act="db-reset:${sid}">${icon("history")} Reseed sample data</button>
            </div><p class="small muted" style="margin-top:10px">Per-module backup &amp; restore — payroll can be snapshotted before a pay run without touching time punches. Restoring this store never rewinds another.</p>`, { icon: "shield" })}
            ${card("Registry row (db_platform)", d.regCard, { icon: "pin" })}
          </div>
        </div>`
      };
    },

    /* ---------- v2.3.2.db — platform reports (runs + file storage) ---------- */
    reports() {
      return {
        title: "Platform reports", sub: "Ledger extracts and resilience posture — each section keeps its last 3 runs; click a run to view (read-only) or download. Older runs move to file storage.",
        actions: `<button class="btn ghost" data-go="sysadmin/web/report-files">${icon("folder")} File storage</button>`,
        body: REP.library("sysadmin", "sysadmin/web")
      };
    },
    "report-run"(param) {
      const p = REP.runPage(param, "sysadmin", "sysadmin/web");
      return {
        title: p.title, sub: p.sub,
        crumbs: [{ label: "Platform reports", go: "sysadmin/web/reports" }, { label: p.run ? p.run.id : "run" }],
        actions: p.run ? `${idtag(p.run.id)} ${p.run.archived ? `<span class="badge plain">archived</span>` : `<span class="badge ok plain">recent</span>`}` : "",
        body: p.body
      };
    },
    "report-files"() {
      const f = REP.filesPage("sysadmin", "sysadmin/web");
      return {
        title: "Report file storage", sub: "Runs older than the last 3 are hidden here — one folder per report, view-only with download links.",
        crumbs: [{ label: "Platform reports", go: "sysadmin/web/reports" }, { label: "File storage" }],
        body: f.kpis + f.folders
      };
    },

    /* ---------- v2.3.2.db — Backup center ---------- */
    backups() {
      const bc = DBV.backupCenter();
      const folders = BACKUP.folders();
      const fullBk = card("Full-split backup & restore — daily folders · force · upload", `
        <p class="small muted" style="margin-bottom:10px">A full backup snapshots <b>every provisioned store</b> at once into a <b>dated folder</b>. Daily runs make a new folder each day; a force backup adds a set to today's folder. Restore by picking a set, or upload a backup file. <span class="muted">Local now · the same JSON syncs to Cloudflare R2 when integrated · db_identity (credentials) is excluded from upload restores.</span></p>
        <div class="choice-row" style="margin-bottom:12px">
          <button class="btn" data-act="bk:force">${icon("download")} Back up now (full)</button>
          <button class="btn ghost" data-act="bk:daily">${icon("calendar")} Run daily backup</button>
          <label class="checkpill"><input type="checkbox" checked disabled> Daily auto · 02:00</label>
        </div>
        <div class="field"><label>Restore from a file (admin upload)</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input class="input" type="file" id="bk-upload" accept="application/json,.json" style="max-width:300px"><span class="hint">choose an exported backup .json</span></div></div>
        <div style="height:10px"></div>
        ${folders.length ? folders.map(f => `<div class="strong small" style="margin:12px 0 6px">${icon("box")} ${f.folder} <span class="muted">· ${f.items.length} set${f.items.length > 1 ? "s" : ""}</span></div>` + table([{ h: "Set" }, { h: "When" }, { h: "Kind" }, { h: "Stores" }, { h: "Size", r: 1 }, { h: "", r: 1 }], f.items.map(b => ({ cells: [idtag(b.id), `<span class="small">${esc(b.ts)}</span>`, `<span class="badge ${b.kind === "manual-force" ? "acc" : b.kind === "daily" ? "ok" : "plain"} plain">${esc(b.kind)}</span>`, `<span class="num">${(b.stores || []).length}</span>`, `<span class="small muted">${b.sizeKB || "?"}KB</span>`, `<span style="display:inline-flex;gap:5px"><button class="btn xs" data-act="bk:restore:${b.id}">${icon("refresh")} Restore</button><button class="btn xs ghost" data-act="bk:export:${b.id}">${icon("download")} Export</button></span>`] })))).join("") : `<p class="small muted">No full-split backups yet — click “Back up now (full)”.</p>`}`, { icon: "box" });
      return {
        title: "Backups & restore", sub: "Full-split daily folders + manual force backup; restore by choosing a set or uploading a file. Three layers deep, granular to one store (Blueprint v2.3.2 §06).",
        actions: `<button class="btn" data-act="bk:force">${icon("download")} Full backup now</button><button class="btn ghost" data-act="drill">${icon("shield")} Restore drill</button>`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${fullBk}
            ${card("Back up now — selectable per store", bc.select, { icon: "download" })}
            ${card("Schedules — per module, cross-customizable", bc.schedule, { icon: "calendar" })}
            ${card("Snapshot history — custodial layer (L-CU)", bc.history, { icon: "history" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("The backup ladder", DBV.ladder(), { icon: "layers" })}
            ${card("Restore drills — monthly, automated, boring", bc.drillCard, { icon: "shield" })}
          </div>
        </div>`
      };
    },

    /* ---------- v2.4.0.db.auth — identity console (§3 step 7) ---------- */
    identity(param) {
      return {
        title: "Identity console", sub: "Accounts, sessions and the sign-in roadmap — status-filtered directory with inline resend / unlock / force-reset. HR doubles for this console on Essential.",
        actions: `<button class="btn soft" data-go="sysadmin/web/outbox">${icon("mail")} Demo outbox</button>
                  <button class="btn ghost" data-go="sysadmin/web/dbstore/db_identity">${icon("grid")} db_identity</button>`,
        body: AUTHV.identityBody(param)
      };
    },
    outbox(param) {
      return {
        title: "Demo outbox", sub: "Every auth mail the platform sends — bilingual templates over the db_comms sent log; open a mail to follow its link.",
        crumbs: param ? [{ label: "Outbox", go: "sysadmin/web/outbox" }, { label: param }] : undefined,
        body: AUTHV.outboxBody("sysadmin/web", param)
      };
    },
    security() {
      return {
        title: "My security", sub: "The administrator's own account — same surface every persona gets.",
        body: AUTHV.mySecurity("sysadmin")
      };
    },
    /* ---------- v2.4.1.edge.auth — B3/B4 providers + B5 delta sync ---------- */
    providers() {
      return {
        title: "Directory providers", sub: "LDAP/AD + RADIUS connection panel and the directory simulator. Flip auth_mode to bind the real server through the edge Worker (LDAPS 636 / RadSec 2083); demo mode answers binds in the browser.",
        actions: `<button class="btn soft" data-go="sysadmin/web/sync">${icon("refresh")} Directory sync</button>
                  <button class="btn ghost" data-go="sysadmin/web/identity">${icon("key")} Identity console</button>`,
        body: AUTHV.providerPanel()
      };
    },
    sync(param) {
      return {
        title: "Directory sync", sub: "Read-only delta sync — create · link · suspend proposals land in a review queue; approve or skip each, conflicts are held. Attributes flow, credentials never do.",
        actions: `<button class="btn ghost" data-go="sysadmin/web/providers">${icon("plug")} Providers</button>`,
        body: AUTHV.syncDashboard(param)
      };
    },

    audit() {
      return {
        title: "Audit log", sub: "Append-only — every change, who and when. The event bus persists here (db_audit) — auth facts included (logins, lockouts, revokes).",
        actions: `<button class="btn ghost" data-act="audit-dl">${icon("download")} ${t("common.export")}</button>`,
        body: `
        <div class="grid cols-3">
          ${kpi("Events today", "1,204", "live tail below", { hero: 1 })}
          ${kpi("Anomalies", "0", "rule engine")}
          ${kpi("Retention", "7 years", "tenant policy · in-country")}
        </div>
        ${card("Live tail", table(
          [{ h: "Time" }, { h: "Actor" }, { h: "Action" }, { h: "Object" }, { h: "Origin" }],
          DATA.audit.map(a => ({
            cells: [`<span class="mono small">${a.ts}</span>`, a.who, `<span class="mono small">${a.act}</span>`, idtag(a.obj), `<span class="small muted">${a.ip}</span>`]
          }))), { icon: "history" })}
        ${card("Why it reads like a ledger", `<p class="small muted">Writes land in exactly one store, become facts on the event bus, and persist here immutably — approve something in the Manager persona and watch it appear at the top of this tail.</p>`, { icon: "lock" })}`
      };
    },

    /* ========================================================
       v2.4.2 — Devices: BioMetrics · Gates · Device monitor
       ======================================================== */
    biometrics() {
      const d = DEVICES.devices(), c = DEVICES.statusCounts();
      const fleet = table(
        [{ h: "Device" }, { h: "Vendor · model" }, { h: "Lane" }, { h: "Methods" }, { h: "Zone" }, { h: "Today", r: 1 }, { h: "Identity" }, { h: "Status" }, { h: "", r: 1 }],
        d.map(x => ({
          go: `sysadmin/web/device/${x.id}`,
          cells: [
            `<span class="mono small strong">${x.id}</span>`,
            `<span class="strong">${x.vendor}</span> <span class="small muted">${esc(x.model)}</span>`,
            `<span class="pill">${x.lane}</span>`,
            x.methods.map(m => `<span class="pill">${m}</span>`).join(" "),
            `<span class="small">${esc(x.zone)}</span>`,
            `<span class="num">${x.today}</span>`,
            `<span class="small ${x.auth === "AD-bound" ? "" : "muted"}">${x.auth}</span>`,
            statusBadge(x.status),
            icon("chevR")
          ]
        })));
      const pro = DEVICES.vendors().filter(v => v.tier === "biometrics");
      const ent = DEVICES.vendors().filter(v => v.tier !== "biometrics");
      return {
        title: "BioMetrics — capture devices",
        sub: "Fingerprint, face and card terminals across three lanes — device-push (ZKTeco), server-pull (Hikvision · Dahua) and file / on-device (HIP · Sunmi). Punches land in db_time, tagged by device and method.",
        actions: `<button class="btn" data-go="sysadmin/web/device-new">${icon("plus")} Add device</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Devices online", `${c.online}/${c.total}`, c.offline || c.degraded ? `${c.offline} offline · ${c.degraded} degraded` : "all reporting", { hero: 1 })}
          ${kpi("Enrolled identities", String(d.reduce((n, x) => n + (x.enrolled || 0), 0)), "face / finger / card templates")}
          ${kpi("Device punches today", String(DEVICES.punchesToday()), "across the fleet → db_time")}
          ${kpi("Vendors connected", String(new Set(d.map(x => x.vendor)).size), "of 8 catalogue brands")}
        </div>
        ${card("Connected fleet", fleet, { icon: "grid", link: "sysadmin/web/devmonitor", linkLabel: "Monitor" })}
        ${card("AD / RADIUS identity binding", `<p class="small muted">Each device can optionally bind its reported user to the company directory (edge identity — <a class="link-inline" data-go="sysadmin/web/providers">Directory providers</a>). A <b>bound</b> device resolves the punch to the same account that signs in to Adeptio; an <b>unbound</b> device keeps a local device-user map. Toggle per device on its config page.</p>`, { icon: "key" })}
        <div class="sec-h" style="margin:18px 0 2px">Vendor catalogue — integrate by lane</div>
        <p class="small muted" style="margin:0 0 10px">Shortlist & protocols from the Vientiane hardware brief (24 Jun 2026). Professional unlocks biometric capture; premium cloud & custom devices are Enterprise.</p>
        <div class="grid cols-2">${pro.map(vendorCard).join("")}</div>
        <div class="sec-h" style="margin:18px 0 8px">Premium &amp; open — Enterprise ${tierChip("gates")}</div>
        <div class="grid cols-2">${ent.map(vendorCard).join("")}</div>`
      };
    },

    "device-new"(param) {
      if (!param) {
        return {
          title: "Add a device", sub: "Pick a vendor to see its required connection parameters. Each lands on one of three integration lanes.",
          crumbs: [{ label: "BioMetrics", go: "sysadmin/web/biometrics" }, { label: "Add device" }],
          body: `<div class="grid cols-2">${DEVICES.vendors().map(vendorCard).join("")}</div>`
        };
      }
      const v = DEVICES.vendorById(param);
      const tier = v.tier === "biometrics" ? "Professional · ≤250" : "Enterprise · ≤600";
      return {
        title: `Add ${v.name}`, sub: `${v.proto} · ${laneLabel[v.lane]}. ${v.blurb}`,
        crumbs: [{ label: "BioMetrics", go: "sysadmin/web/biometrics" }, { label: "Add " + v.name }],
        actions: DEVICES.has(v.tier) ? `<span class="badge plain">${tier.split(" ·")[0]}</span>` : UI.lockTag(tier),
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div class="card-head"><span class="t">${icon(v.icon)} Connection — ${v.name}</span><span class="badge plain">${v.proto}</span></div>
            <div id="devf-${v.id}" class="pv-form">
              ${v.fields.map(paramField).join("")}
              <div class="field"><label>Location / zone</label><input class="input" data-f="zone" placeholder="e.g. Vientiane Plant 1 · Main gate"></div>
              ${v.ad ? `<div class="field"><label>Identity</label><div class="swrow"><input type="checkbox" data-f="ad" checked> <span class="small muted">Bind device users to the company directory (AD / RADIUS) — recommended</span></div></div>` : `<div class="field"><label>Identity</label><span class="small muted">Inherits the Adeptio app sign-in on the terminal — no separate bind.</span></div>`}
            </div>
            <div style="display:flex;gap:9px;justify-content:flex-end;margin-top:8px">
              <button class="btn ghost" data-go="sysadmin/web/biometrics">Cancel</button>
              <button class="btn" data-act="device-add:${v.id}">${icon("plus")} Register device</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Integration lane", steps(
              v.lane === "A" ? [{ t: "Device push", s: "PUSH/ADMS → /punch" }, { t: "Verify", s: "SN + comm key" }, { t: "Write", s: "→ db_time" }]
              : v.lane === "B" ? [{ t: "Connect", s: "host · creds (vault)" }, { t: "Poll", s: "ISAPI / HTTP API" }, { t: "Write", s: "→ db_time" }]
              : v.lane === "C" ? [{ t: "Export / on-device", s: "CSV · PWA" }, { t: "Review", s: "import queue" }, { t: "Write", s: "→ db_time" }]
              : [{ t: "Webhook", s: "signed /punch" }, { t: "Verify", s: "HMAC + map" }, { t: "Write", s: "→ db_time" }], 0), { icon: "layers" })}
            ${card("Where secrets live", `<p class="small muted">Fields marked <span class="badge plain">vault ref</span> are never written to <span class="mono">db_devices</span> — only a reference is stored. The real key is a Worker secret (the custody flip), exactly like the LDAP/RADIUS bind secrets.</p>`, { icon: "lock" })}
          </div>
        </div>`
      };
    },

    device(param) {
      const x = DEVICES.deviceById(param) || DEVICES.devices()[0];
      if (!x) return { title: "Device", body: empty("grid", "No devices", "Add one from BioMetrics.") };
      const v = DEVICES.vendorByName(x.vendor) || DEVICES.vendorById("custom");
      const evs = DEVICES.events().filter(e => e.dev === x.id).slice(0, 6);
      const fact = (k, val) => `<div class="rowitem"><span class="ric n">${icon("grid")}</span><div class="rmain"><div class="rt">${k}</div><div class="rs mono">${val}</div></div></div>`;
      return {
        title: `${x.vendor} ${x.model}`, sub: `${x.proto} · ${laneLabel[x.lane]} · ${esc(x.site)} → ${esc(x.zone)}`,
        crumbs: [{ label: "BioMetrics", go: "sysadmin/web/biometrics" }, { label: x.id }],
        actions: `${idtag(x.id)} ${statusBadge(x.status)}`,
        body: `
        <div class="grid cols-4">
          ${kpi("Status", DEVICES.statusLabel(x.status), x.last, { hero: 1 })}
          ${kpi("Latency", x.lat != null ? x.lat + " ms" : "—", x.lat != null && x.lat > 500 ? "above threshold" : "poll round-trip")}
          ${kpi("Punches today", String(x.today), "→ db_time")}
          ${kpi("Enrolled", String(x.enrolled), "templates on device")}
        </div>
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Connection facts", rowlist([
              fact("Serial (SN)", x.sn), fact("IP / host", x.ip), fact("Firmware", x.fw),
              fact("Protocol", x.proto), fact("Methods", x.methods.join(" · "))
            ]) + `<p class="small muted" style="margin-top:8px">Required parameters for ${v.name}: ${v.fields.filter(f => f.type !== "cloud").map(f => esc(f.label) + (f.vault ? " (vault)" : "")).join(" · ")}.</p>`, { icon: v.icon })}
            ${card("Recent events", evs.length ? table(
              [{ h: "Time" }, { h: "Kind" }, { h: "Event" }],
              evs.map(e => ({ cells: [`<span class="mono small">${e.ts}</span>`, `<span class="badge ${e.tone || "plain"}">${e.kind}</span>`, `<span class="small">${esc(e.msg)}</span>`] }))
            ) : empty("pulse", "No recent events", "Telemetry appears as the device reports."), { icon: "history" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Identity binding", v.ad
              ? `<p class="small muted" style="margin-bottom:10px">This device is <b>${x.auth === "AD-bound" ? "bound to the directory" : "using a local device-user map"}</b>. ${x.auth === "AD-bound" ? "Punches resolve to the same account that signs in to Adeptio." : "Bind it to resolve punches to directory accounts."}</p>
                 <button class="btn sm ${x.auth === "AD-bound" ? "ghost" : "soft"}" data-act="device-bind:${x.id}">${icon("key")} ${x.auth === "AD-bound" ? "Unbind from directory" : "Bind to AD / RADIUS"}</button>`
              : `<p class="small muted">Sunmi runs the Adeptio PWA on-device, so it inherits the app sign-in — no separate directory bind.</p>`, { icon: "key" })}
            ${card("Device actions", `<div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn soft" data-act="device-test:${x.id}">${icon("plug")} Test connection</button>
              ${x.status !== "online" ? `<button class="btn ghost" data-act="device-reconnect:${x.id}">${icon("refresh")} Reconnect</button>` : ""}
              <button class="btn ghost" data-act="device-remove:${x.id}">${icon("x")} Remove device</button>
            </div><p class="small muted" style="margin-top:10px">Blast radius: this device row only. Removing it never touches the punches it already wrote to db_time.</p>`, { icon: "settings" })}
          </div>
        </div>`
      };
    },

    gates() {
      const g = DEVICES.gates();
      const secured = g.filter(x => x.state === "secured").length;
      const door = DEVICES.events().filter(e => /gate|door|entry|secured|held|forced/i.test(e.msg) || e.kind === "config").slice(0, 6);
      return {
        title: "Gates & access",
        sub: "Turnstiles, doors and barriers — each one an access point downstream of a reader and controller. A punch here can also open the door; events stream to the same ledger.",
        actions: tierChip("gates") || `<span class="badge plain">Enterprise</span>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Access points", String(g.length), `${secured} secured now`, { hero: 1 })}
          ${kpi("Entries today", String(g.reduce((n, x) => n + (x.today || 0), 0)), "across all gates")}
          ${kpi("Controllers", String(new Set(g.map(x => x.controller)).size), "door / turnstile / barrier")}
          ${kpi("Readers", String(new Set(g.map(x => x.reader)).size), "biometric / card → gate")}
        </div>
        ${card("Access points", table(
          [{ h: "Gate" }, { h: "Type" }, { h: "Reader → controller" }, { h: "Lock" }, { h: "Mode" }, { h: "Today", r: 1 }, { h: "State" }, { h: "", r: 1 }],
          g.map(x => ({
            go: `sysadmin/web/gate/${x.id}`,
            cells: [
              `<span class="strong">${esc(x.name)}</span> <span class="mono small muted">${x.id}</span>`,
              `<span class="pill">${x.kind}</span>`,
              `<span class="mono small">${x.reader}</span> <span class="small muted">→ ${esc(x.controller)}</span>`,
              `<span class="small">${esc(x.lock)}</span>`,
              `<span class="small">${esc(x.mode)}</span>`,
              `<span class="num">${x.today}</span>`,
              statusBadge(x.state),
              icon("chevR")
            ]
          }))), { icon: "lock" })}
        <div class="grid cols-2">
          ${card("How a gate maps", `<p class="small muted">A turnstile is just an access point <b>downstream of a reader</b> (Hardware Brief §3). Adeptio integrates the <b>reader / controller</b> — the gate mechanics (tripod, flap, boom barrier, maglock, strike) are unbranded OEM and bought to match the controller. The reader reports the event; the controller drives the lock.</p>`, { icon: "layers" })}
          ${card("Door & gate events", door.length ? rowlist(door.map(e => rowitem({ icon: e.tone === "bad" ? "x" : e.tone === "warn" ? "alert" : "check", neutral: !e.tone, title: esc(e.msg), sub: e.dev + " · " + e.ts, side: `<span class="badge ${e.tone || "plain"}">${e.kind}</span>` }))) : empty("lock", "No recent door events", "Entries appear as readers report."), { icon: "history" })}
        </div>`
      };
    },

    gate(param) {
      const x = DEVICES.gateById(param) || DEVICES.gates()[0];
      if (!x) return { title: "Gate", body: empty("lock", "No gates", "Add a reader in BioMetrics first.") };
      const reader = DEVICES.deviceById(x.reader);
      return {
        title: x.name, sub: `${x.kind} · ${esc(x.controller)} · lock: ${esc(x.lock)}`,
        crumbs: [{ label: "Gates & access", go: "sysadmin/web/gates" }, { label: x.id }],
        actions: `${idtag(x.id)} ${statusBadge(x.state)}`,
        body: `
        <div class="grid cols-4">
          ${kpi("State", x.state === "secured" ? "Secured" : x.state === "held" ? "Held open" : x.state === "offline" ? "Offline" : "Forced", "current", { hero: 1 })}
          ${kpi("Entries today", String(x.today), "card / face")}
          ${kpi("Mode", x.mode, "credential")}
          ${kpi("Reader", x.reader, reader ? reader.vendor : "—")}
        </div>
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Reader → controller → lock", rowlist([
              rowitem({ icon: "grid", title: reader ? `${reader.vendor} ${reader.model}` : x.reader, sub: "Reader · " + (reader ? reader.proto : "—"), side: reader ? `<button class="btn xs ghost" data-go="sysadmin/web/device/${reader.id}">Open</button>` : "" }),
              rowitem({ icon: "settings", title: esc(x.controller), sub: "Controller", neutral: 1 }),
              rowitem({ icon: "lock", title: esc(x.lock), sub: "Lock mechanism · OEM", neutral: 1 })
            ]), { icon: "layers" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Gate control", `<p class="small muted" style="margin-bottom:10px">Demo control — drives the controller, not the lock directly.</p><div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn soft" data-act="gate-control:${x.id}:secured">${icon("lock")} Secure</button>
              <button class="btn ghost" data-act="gate-control:${x.id}:held">${icon("key")} Hold open</button>
              <button class="btn ghost" data-act="gate-control:${x.id}:forced">${icon("alert")} Flag forced</button>
            </div>`, { icon: "settings" })}
          </div>
        </div>`
      };
    },

    devmonitor() {
      const d = DEVICES.devices(), c = DEVICES.statusCounts(), cs = DEVICES.clockSeries5m();
      const mix = DEVICES.captureMix();
      const conn = table(
        [{ h: "Device" }, { h: "Zone" }, { h: "Protocol" }, { h: "Latency", r: 1 }, { h: "Last seen" }, { h: "Status" }, { h: "", r: 1 }],
        d.map(x => ({
          cells: [
            `<span class="mono small strong">${x.id}</span> <span class="small muted">${x.vendor}</span>`,
            `<span class="small">${esc(x.zone)}</span>`,
            `<span class="small muted">${esc(x.proto)}</span>`,
            `<span class="num">${x.lat != null ? x.lat + " ms" : "—"}</span>`,
            `<span class="small muted">${x.last}</span>`,
            `<span style="display:inline-flex;align-items:center;gap:7px"><span class="cdot" style="color:${DEVICES.statusColor(x.status)};background:${DEVICES.statusColor(x.status)}"></span>${DEVICES.statusLabel(x.status)}</span>`,
            x.status === "online" ? `<button class="btn xs ghost" data-act="device-test:${x.id}">Test</button>` : `<button class="btn xs soft" data-act="device-reconnect:${x.id}">Reconnect</button>`
          ]
        })));
      const ins = cs.data.map(p => p.v), outs = cs.data.map(p => p.outv), labs = cs.data.map(p => p.raw);
      return {
        title: "Device monitor", sub: "API connectivity and the live clock-in/out feed — every connector's status and a 5-minute-frame time series of punches across the fleet.",
        actions: `<button class="btn soft" data-act="device-test-all">${icon("plug")} Test all</button>
                  <button class="btn ghost" data-go="sysadmin/web/biometrics">${icon("grid")} BioMetrics</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Fleet uptime", DEVICES.uptime() + "%", "reachable devices", { hero: 1 })}
          ${kpi("Online", `${c.online}/${c.total}`, "reporting now")}
          ${kpi("Degraded", String(c.degraded), c.degraded ? "high latency" : "none")}
          ${kpi("Offline", String(c.offline), c.offline ? "needs attention" : "none")}
        </div>
        ${card("Clock-in / out — 5-minute frames (today)", `
          ${UI.lines2(ins, outs, labs, { w: 680, h: 200 })}
          ${legend([{ c: "var(--acc)", l: "Clock-in" }, { c: "var(--muted-2)", l: "Clock-out" }])}
          <p class="small muted" style="margin-top:6px"><b class="num">${cs.total}</b> clock-ins today · morning peak <b>${cs.peak.raw}</b> (${cs.peak.v} in that 5-min frame). Each frame aggregates every connector → db_time.</p>`,
          { icon: "pulse" })}
        <div class="grid cols-3">
          ${card("Connectivity — live status", conn, { icon: "wifi", cls: "span-2" })}
          ${card("Capture mix — today", `${bars(mix.map(m => ({ l: m.label, v: m.v })), { values: true, w: 300, h: 150 })}
            <div class="small muted" style="margin-top:4px">${mix.map(m => `${m.label} ${m.pct}%`).join(" · ")}</div>`, { icon: "chart" })}
        </div>
        ${card("Event log", table(
          [{ h: "Time" }, { h: "Device" }, { h: "Kind" }, { h: "Event" }],
          DEVICES.events().slice(0, 12).map(e => ({
            cells: [`<span class="mono small">${e.ts}</span>`, `<span class="mono small">${e.dev}</span>`, `<span class="badge ${e.tone || "plain"}">${e.kind}</span>`, `<span class="small">${esc(e.msg)}</span>`]
          }))), { icon: "history" })}`
      };
    }
  };

  /* ---------- MOBILE (alerts-first) ---------- */
  const mobile = {
    health() {
      return {
        title: "Platform", body: `
        ${card("", `<div style="display:flex;align-items:center;gap:10px">${icon("check", "")}<b>Platform healthy</b><span style="margin-left:auto" class="badge ok">99.98%</span></div>`)}
        <div class="grid cols-2">${kpi("Delivery", "99.1%", "blended")}${kpi("Sessions", "212", "active")}</div>
        ${card("Alerts", rowlist([
          rowitem({ icon: "x", title: "LINE webhook down", sub: "failover active", side: badge("failed") }),
          rowitem({ icon: "alert", title: "SMS cert expiring", sub: "renew by Jul 01", side: badge("expiring") })
        ]), { icon: "bell" })}`
      };
    },
    templates() {
      return {
        title: "Templates", body: card("Review queue", rowlist(DATA.templates.filter(x => x.status !== "published").map(tp => rowitem({
          icon: "file", title: tp.name, sub: tp.id + " · v" + tp.v, side: badge(tp.status), go: "sysadmin/mobile/template/" + tp.id
        }))) + `<p class="small muted" style="margin-top:10px">Authoring stays on web — mobile is for review &amp; publish on the go.</p>`, { icon: "files" })
      };
    },
    audit() {
      return {
        title: "Audit", body: card("Today · 1,204", rowlist(DATA.audit.slice(0, 6).map(a => rowitem({
          icon: "history", neutral: 1, title: a.act, sub: a.who + " · " + a.ts, side: ""
        }))), { icon: "lock" })
      };
    },
    template(id) {
      const tp = DATA.templates.find(x => x.id === id) || DATA.templates[0];
      return {
        title: tp.id, back: "sysadmin/mobile/templates", body: `
        ${card("", `<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">${idtag(tp.id)}${badge(tp.status)}</div>
        <h3 style="font-size:16px;margin:10px 0 2px">${tp.name}</h3><div class="small muted">${tp.kind} · ${tp.lang} · v${tp.v}</div>`)}
        ${tp.status !== "published" ? `<button class="btn" style="width:100%" data-act="comms-publish-template:${tp.id}">${icon("check")} Approve & publish</button>` : ""}`
      };
    },
    devmonitor() {
      const c = DEVICES.statusCounts();
      return {
        title: "Devices", body: `
        ${card("", `<div style="display:flex;align-items:center;gap:10px">${icon(c.offline ? "alert" : "check")}<b>Fleet ${DEVICES.uptime()}% up</b><span style="margin-left:auto" class="badge ${c.offline ? "warn" : "ok"}">${c.online}/${c.total} online</span></div>`)}
        <div class="grid cols-2">${kpi("Punches today", String(DEVICES.punchesToday()), "→ db_time")}${kpi("Offline", String(c.offline), c.offline ? "tap to fix" : "none")}</div>
        ${card("Status", rowlist(DEVICES.devices().map(x => rowitem({ icon: x.status === "online" ? "check" : x.status === "offline" ? "x" : "alert", neutral: x.status === "import", title: x.vendor + " " + x.model, sub: x.zone + " · " + x.last, side: badge(x.status === "import" ? "draft" : x.status) }))), { icon: "wifi" })}`
      };
    }
  };

  /* ---------- v2.4.4 — Schedule connector (db_schedule integration seam) ----------
     db_schedule already auto-appears in the Database studio / Backups / Sync via
     the store CATALOG — this just adds the connector admin surface. */
  web["sched-connector"] = () => SCHEDVIEWS.connector({ persona: "sysadmin", device: "web" });
  mobile["sched-connector"] = () => SCHEDVIEWS.connector({ persona: "sysadmin", device: "mobile", back: "sysadmin/mobile/health" });

  /* ==SEAM:SCREENS:sysadmin== insert sysadmin web[...] / mobile[...] builders here == */
  /* ---------- v2.4.5 T0 — Functions (feature flags) ---------- */
  web["functions"] = () => {
    const order = FLAGS.ORDER;
    const optItems = order.map(k => { const r = FLAGS.REGISTRY[k], on = FLAGS.on(k);
      return rowitem({ icon: on ? "check" : "x", title: esc(r.label), sub: `${k} · scope ${r.scope} · ${on ? "on" : "paused — menu hidden, data kept"}`, side: `<button class="btn xs ${on ? "soft" : ""}" data-act="flag:${k}">${on ? "Turn off" : "Turn on"}</button>` });
    });
    const coreItems = FLAGS.CORE.map(([k, l]) => rowitem({ icon: "shield", title: esc(l), sub: `core · ${k}`, side: `<span class="badge ok plain">always on</span>` }));
    return {
      title: "Functions — feature flags", sub: "Turn optional features on or off. Off hides the menu and pauses the engine — the data stays. Core features are always on.",
      body: `
        <div class="grid cols-3">
          ${kpi("Optional features", String(order.length), "toggleable", { hero: 1 })}
          ${kpi("On now", String(order.filter(k => FLAGS.on(k)).length), "enabled")}
          ${kpi("Core", String(FLAGS.CORE.length), "always on")}
        </div>
        ${card("Optional features", rowlist(optItems), { icon: "settings" })}
        ${card("Core — always on", rowlist(coreItems), { icon: "shield" })}`
    };
  };
  /* ---------- v2.4.5 T0 — Licensing (tier · default OFF) ---------- */
  web["licensing"] = () => {
    const on = LICENSE.enabled, locked = LICENSE.locked, tier = LICENSE.tier(), lim = LICENSE.openLimits.maxUsers;
    const tierBtn = (id, lbl) => `<button class="btn xs ${tier === id ? "soft" : ""}" ${on ? "" : "disabled"} data-act="lic:tier:${id}">${lbl}</button>`;
    const limBtn = (v, lbl) => `<button class="btn xs ${String(lim) === String(v) ? "soft" : ""}" data-act="lic:limit:maxUsers:${v}">${lbl}</button>`;
    return {
      title: "Licensing", sub: "Tier licensing is a separate, switchable subsystem. It ships OFF — every feature is available until an owner turns it on.",
      body: `
        <div class="grid cols-3">
          ${kpi("Tier licensing", on ? "ON" : "OFF", on ? "tier · " + tier : "all features available", { hero: 1 })}
          ${kpi("Config lock", locked ? "Locked" : "Open", "owner latch (T9)")}
          ${kpi("Open-tier users", lim == null ? "∞" : String(lim), "seat cap")}
        </div>
        ${card("Tier licensing", `${rowitem({ icon: on ? "shield" : "x", title: `Tier licensing — ${on ? "ON" : "OFF"}`, sub: on ? "Essential/Pro/Enterprise caps apply." : "Disabled · all features available (the default).", side: `<button class="btn ${on ? "soft" : ""}" data-act="lic:toggle">${on ? "Disable" : "Enable"}</button>` })}
          <div class="choice-row" style="margin-top:10px">${tierBtn("essential", "Essential ≤50")}${tierBtn("professional", "Pro ≤250")}${tierBtn("enterprise", "Enterprise")}</div>
          <p class="small muted" style="margin-top:8px">${on ? "Tier sets the feature cap." : "Tier picker activates when licensing is on."}</p>`, { icon: "shield" })}
        ${card("Open-tier limits", `<p class="small muted" style="margin-bottom:8px">Applied while licensing is OFF — cap seats &amp; storage without a commercial tier.</p>
          <div class="field"><label>Max users</label><div class="choice-row">${limBtn(5, "5")}${limBtn(20, "20")}${limBtn("", "Unlimited")}</div></div>`, { icon: "users" })}
        ${card("Owner-gated config", `<p class="small muted">Config lock by Gmail allowlist + SMTP/SMS/WhatsApp/LINE setup live in the owner-gated <b>Platform Settings</b> console (build thread T9).</p>`, { icon: "lock" })}`
    };
  };

  /* ---------- v2.4.5 T7 (C3) — Database ops ---------- */
  web["dbops"] = () => {
    const stores = DBOPS.stores(), snaps = DBOPS.snapshots();
    const rows = stores.map(s => ({ cells: [
      idtag(s.id), esc(s.name), `<span class="small muted">${(s.tables || []).length} tables</span>`,
      `<span style="display:inline-flex;gap:5px"><button class="btn xs ghost" data-act="dbops:reset:${s.id}">${icon("refresh")} Reset</button><button class="btn xs danger" data-act="dbops:purge:${s.id}">${icon("x")} Purge</button><button class="btn xs ghost" data-act="dbops:migrate:${s.id}">${icon("layers")} Migrate</button></span>`
    ] }));
    return {
      title: "Database ops", sub: "Per-store reset · purge · migrate, on top of the backup ladder. Every destructive op auto-snapshots first and lands on the audit tail; live migration runs at the Cloudflare D1 cutover.",
      body: `
        <div class="grid cols-3">
          ${kpi("Stores", String(stores.length), "in the catalog", { hero: 1 })}
          ${kpi("Snapshots", String(snaps.length), "restore points")}
          ${kpi("Live migrate", "stub", "→ D1 cutover")}
        </div>
        ${card("Stores · ops", table([{ h: "ID" }, { h: "Store" }, { h: "Tables" }, { h: "Ops", r: 1 }], rows), { icon: "grid" })}`
    };
  };
  /* ---------- v2.4.5 T9 — Platform Settings (owner-gated) ---------- */
  web["platsettings"] = () => {
    const acting = PLATOWNER.actingEmail(), isOwner = PLATOWNER.isOwner(acting), canCfg = PLATOWNER.canConfigure(acting);
    const locked = PLATOWNER.locked(), lim = LICENSE.openLimits.maxUsers, ch = MAIL.channels();
    const chRow = (c) => rowitem({
      icon: c.icon,
      title: `${esc(c.label)} ${c.enabled ? '<span class="badge ok plain">on</span>' : '<span class="badge plain">off</span>'} ${c.configured ? '<span class="badge acc plain">configured</span>' : '<span class="badge warn plain">setup needed</span>'}`,
      sub: `${esc(c.note)} · budget ${c.budget.used}/${c.budget.limit}`,
      side: canCfg ? `<button class="btn xs ${c.configured ? "soft" : ""}" data-act="platset:ch:${c.id}">${c.configured ? "Edit" : "Set up"}</button>` : badge("read-only")
    });
    return {
      title: "Platform Settings", sub: "Owner-gated configuration — config lock by Gmail, tier licensing, open-tier limits and the SMTP/SMS/WhatsApp/LINE channel setup. Only platform-owner accounts can change it.",
      body: `
        <div class="grid cols-3">
          ${kpi("Config", locked ? "Locked" : "Open", isOwner ? "you are an owner" : "owner-only", { hero: 1 })}
          ${kpi("Tier licensing", LICENSE.enabled ? "ON" : "OFF", LICENSE.enabled ? LICENSE.tier() : "all features")}
          ${kpi("Open-tier users", lim == null ? "∞" : String(lim), "seat cap")}
        </div>
        ${card("Access & lock", rowitem({ icon: locked ? "lock" : "key", title: `Configuration — ${locked ? "locked (read-only)" : "unlocked"}`, sub: "Platform-owner Gmail: " + PLATOWNER.gmails().join(" · "), side: isOwner ? `<button class="btn ${locked ? "soft" : ""}" data-act="platset:lock">${locked ? "Unlock" : "Lock"}</button>` : badge("owner-only") }), { icon: "key" })}
        ${card("Tier & licensing", `<div class="choice-row"><button class="btn xs ${LICENSE.enabled ? "" : "soft"}" data-act="lic:toggle">${LICENSE.enabled ? "Disable licensing" : "Keep OFF / Enable"}</button></div><p class="small muted" style="margin-top:6px">Ships OFF — every feature available. Full tier matrix in the Licensing screen.</p>`, { icon: "shield" })}
        ${card("Open-tier limits", `<div class="field"><label>Max users (while licensing OFF)</label><div class="choice-row">${[["5", "5"], ["20", "20"], ["", "Unlimited"]].map(([v, l]) => `<button class="btn xs ${String(lim) === v ? "soft" : ""}" data-act="lic:limit:maxUsers:${v}">${l}</button>`).join("")}</div></div>`, { icon: "users" })}
        ${card("Channels — SMTP · SMS · WhatsApp · LINE", rowlist(ch.map(chRow)), { icon: "plug" })}`
    };
  };

  PERSONAS.sysadmin = {
    key: "sysadmin", label: t("personas.sysadmin"), icon: "settings",
    appName: "Adeptio Console", roleLine: "Platform · content · security",
    domain: "admin.adeptio.hr/platform",
    nav: [
      { group: "Platform", items: [
        { id: "health", icon: "pulse", label: t("sys.health") },
        { id: "templates", icon: "files", label: t("sys.templates"), count: () => DATA.templates.filter(x => x.status !== "published").length },
        { id: "channels", icon: "plug", label: t("sys.channels") },
        { id: "functions", icon: "settings", label: "Functions" },
        { id: "licensing", icon: "shield", label: "Licensing" },
        { id: "platsettings", icon: "key", label: "Platform Settings" }
        /* ==SEAM:NAV:sysadmin== platform-owner / settings nav items == */
      ]},
      { group: "Data layer", items: [
        { id: "database", icon: "grid", label: "Database studio" },
        { id: "backups", icon: "download", label: "Backups & restore", count: () => DB.backups.all().length },
        { id: "dbops", icon: "layers", label: "DB ops" },
        { id: "sched-connector", icon: "plug", label: "Schedule connector" },
        { id: "reports", icon: "chart", label: "Platform reports" }
      ]},
      { group: "Devices", items: [
        { id: "devmonitor", icon: "pulse", label: "Device monitor", count: () => { const c = DEVICES.statusCounts(); return (c.offline + c.degraded) || ""; } },
        { id: "biometrics", icon: "grid", label: "BioMetrics", count: () => DEVICES.devices().length },
        { id: "gates", icon: "lock", label: "Gates & access" }
      ]},
      { group: "Security", items: [
        { id: "identity", icon: "key", label: "Identity console", count: () => AUTH.stats().invited + AUTH.stats().locked || "" },
        { id: "providers", icon: "plug", label: "Directory providers" },
        { id: "sync", icon: "refresh", label: "Directory sync", count: () => { const r = PROV.syncs().find(x => x.state === "review"); return r ? r.queue.length : ""; } },
        { id: "outbox", icon: "mail", label: "Demo outbox", count: () => AUTH.mails().length },
        { id: "roles", icon: "shield", label: t("sys.roles") },
        { id: "integrations", icon: "layers", label: t("sys.integrations") },
        { id: "audit", icon: "lock", label: t("sys.audit") }
      ]},
      { group: "Account", items: [{ id: "security", icon: "user", label: "My security" }] }
    ],
    parent: { template: "templates", dbstore: "database", "report-run": "reports", "report-files": "reports", device: "biometrics", "device-new": "biometrics", gate: "gates" },
    tabs: [
      { id: "health", icon: "pulse", label: "Health" },
      { id: "templates", icon: "files", label: "Templates" },
      { id: "devmonitor", icon: "grid", label: "Devices" },
      { id: "audit", icon: "lock", label: "Audit" }
    ],
    tabParent: { template: "templates", "sched-connector": "health" },
    web, mobile
  };
})();
