/* ============================================================
   ADEPTIO · HR persona (People Ops) — blue
   Web (full console): Pulse · Approvals L2 · Communication ·
     People(→person) · Time · Leave · Payroll(→run) · Documents · Reports
   Mobile (deliberately light): Queue · Alerts · Me
   ============================================================ */
(function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, table, steps, empty, avatar, sparkline, bars, lines2, donut, kip, legend, esc } = UI;

  /* v2.4.2 — resolve an employee id → display name / role (for capture groups) */
  function empMeta(id) {
    const e = DATA.employees.find(x => x.id === id);
    return e ? { name: e.name, role: (e.pos || "") + (e.team && e.team !== "—" ? " · " + e.team : "") } : { name: id, role: "—" };
  }
  function methodChip(m, active) { const md = DEVICES.methodById(m); return `<span class="pill ${active ? "on" : ""}">${icon(md.icon)} ${md.label}</span>`; }

  // v2.3.2.db — the master record lives in db_people.employees now (one writer: People cell)
  const allStaff = () => DATA.employees;

  /* ---------- WEB ---------- */
  const web = {
    pulse() {
      return {
        title: "HR pulse", sub: "The org today — every count is one click from its queue.",
        actions: `<button class="btn soft" data-go="hr/web/comms">${icon("megaphone")} Announce</button>
                  <button class="btn" data-go="hr/web/payroll/PR-2026-06">${icon("banknote")} Run payroll</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Headcount", String(DATA.org().headcount), `<span class="up">${DATA.org().newMoM}</span> this month`, { hero: 1 })}
          ${kpi("Present today", DATA.org().presentPct, `${DATA.org().present} of ${DATA.org().headcount} · ${DATA.org().late} late`)}
          ${DATA.has("l2") ? kpi("Approvals", String(APPROVALS.pending()), "across modules") : kpi("Approvals · L1", "9", "single-step · at managers")}
          ${kpi("Payroll cut-off", "15 d", "Jun 25 · run in draft")}
        </div>
        <div class="grid cols-3" style="margin-top:16px">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Needs attention", rowlist([
          DATA.has("l2") ? rowitem({ icon: "inbox", title: "Approvals waiting", sub: `${DATA.pendingL2().length} claim to settle · ${APPROVALS.pending()} across modules`, side: `<b class="num">${APPROVALS.pending()}</b>`, go: "hr/web/approvals" }) : `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">Multi-step approvals (L1 → L2)</div><div class="rs">Single-step on Essential — managers complete at L1</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("l2"))}</div></div>`,
          rowitem({ icon: "banknote", title: "Payroll run PR-2026-06 in draft", sub: "3 OT batches pending L1 upstream", side: badge("draft"), go: "hr/web/payroll/PR-2026-06" }),
          DATA.has("vault") ? rowitem({ icon: "alert", title: "Contracts expiring ≤ 30 days", sub: "3 staff · renewal letters from template", side: `<b class="num">3</b>`, go: "hr/web/docs" }) : `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">Contract & document expiry alerts</div><div class="rs">Documents Vault</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("vault"))}</div></div>`,
          DATA.has("sysadmin") ? rowitem({ icon: "x", title: "Failed sends — LINE webhook", sub: "Channel down since 09:31 · SysAdmin notified", side: badge("failed"), go: "hr/web/comms" }) : rowitem({ icon: "check", title: "Channels healthy", sub: "in-app + transactional email · 99.4% today", side: badge("ok"), go: "hr/web/comms" }),
          AUTH.stats().invited ? rowitem({ icon: "key", title: `${AUTH.stats().invited} invite${AUTH.stats().invited === 1 ? "" : "s"} pending activation`, sub: "72 h links · " + AUTH.stats().neverLogged + " activated-but-never-signed-in", side: `<b class="num">${AUTH.stats().invited}</b>`, go: "hr/web/access" }) : rowitem({ icon: "check", title: "Access — no invites pending", sub: AUTH.stats().neverLogged + " never signed in (adoption)", side: badge("ok"), go: "hr/web/access" })
        ]), { icon: "bell" })}
            ${card("Attendance board — today", `
              <div class="grid cols-4" style="gap:10px;margin-bottom:14px">
                ${[`Present|${DATA.org().present}|ok`, `Late|${DATA.org().late}|warn`, `Absent|${DATA.org().absent}|bad`, `On leave|${DATA.org().onleave}|`].map(s => { const [l, v, tn] = s.split("|"); return `<div style="text-align:center;padding:10px 6px;border:1px solid var(--line);border-radius:12px"><div class="num" style="font-size:22px;font-weight:650">${v}</div><span class="badge ${tn}">${l}</span></div>`; }).join("")}
              </div>
              ${sparkline(DATA.attendanceTrend)}<div class="small muted" style="margin-top:6px">Org present % · trailing 10 working days</div>`, { icon: "pulse", link: "hr/web/time" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Payroll run", steps([{ t: "Draft", s: "pull ledgers" }, { t: "Validate", s: "PIT · SSO" }, { t: "Approve", s: "L2" }, { t: "Disburse", s: "bank file" }], DATA.payrollRuns[0].step - 1) + `<button class="btn sm soft" style="margin-top:10px" data-go="hr/web/payroll/PR-2026-06">Open run ${icon("chevR")}</button>`, { icon: "banknote" })}
            ${card("KPIs", rowlist([
          rowitem({ icon: "trend", title: "Attrition (12-mo)", sub: "vs 8.4% last year", side: `<b class="num">7.2%</b>` }),
          rowitem({ icon: "clock", title: "Time-to-approve", sub: "median, all flows", side: `<b class="num">6.1 h</b>` }),
          rowitem({ icon: "check", title: "Payroll accuracy", sub: "May run", side: `<b class="num">99.97%</b>` })
        ]), { icon: "chart" })}
            ${card(t("common.quickActions"), `<div class="choice-row">
              <button class="choice" data-go="hr/web/people">${icon("plus")} New hire</button>
              <button class="choice" data-go="hr/web/comms">${icon("megaphone")} Announce</button>
              ${DATA.has("vault") ? `<button class="choice" data-go="hr/web/docs">${icon("file")} Generate doc</button>` : UI.lockChoice("Generate doc", DATA.unlockLabel("vault"))}
              ${DATA.has("l2") ? `<button class="choice" data-go="hr/web/approvals">${icon("inbox")} Approvals</button>` : UI.lockChoice("L2 approvals", DATA.unlockLabel("l2"))}
            </div>`, { icon: "sparkle" })}
          </div>
        </div>`
      };
    },

    approvals() {
      // v2.4.5 T1 — the unified inbox is HR's primary decision surface (replaces the old l2queue
      // card that emitted a SECOND set of approve:/return: over the same ids). Single-tenant: HR
      // works the full unified queue, so the hero KPI + nav badge both read APPROVALS.pending().
      // The cross-module table below is read-only CONTEXT — its actions (post/approve/generate)
      // are distinct from the inbox decide path, so it is not a duplicate decision surface.
      const inbox = APPROVALSVIEW.inboxScreen({ persona: "hr", device: "web", canEdit: true });
      return {
        title: inbox.title, sub: inbox.sub,
        body: `
        <div class="grid cols-4">
          ${kpi("Waiting on HR", String(APPROVALS.pending()), "all modules", { hero: 1 })}
          ${kpi("Claims to settle", String(DATA.pendingL2().length), "via payroll or finance")}
          ${kpi("Median age", "0.9 d", "SLA 2 d")}
          ${kpi("Escalations", "0", "this week")}
        </div>
        ${inbox.body}
        ${card("Cross-module context", table(
          [{ h: "ID" }, { h: "Type" }, { h: "Who" }, { h: "Stage" }, { h: "Age", r: 1 }, { h: "", r: 1 }],
          [
            { cells: [idtag("TC-0109"), "Correction", "Latsamy V.", "Adjust ledger", `<span class="num">0.4 d</span>`, `<button class="btn xs soft" data-act="wf-ledger-adjust">Post</button>`] },
            { cells: [idtag("PRF-0042"), "Profile change", "Davone P.", "Bank account update", `<span class="num">0.7 d</span>`, `<button class="btn xs soft" data-act="wf-profile-approve">Approve</button>`] },
            { cells: [idtag("DOC-0290"), "Document", "Manysone V.", "Salary certificate", `<span class="num">0.2 d</span>`, `<button class="btn xs soft" data-act="gen-doc:hr-salary-manysone">Generate</button>`] }
          ]), { icon: "layers" })}`
      };
    },

    approval(id) {
      const r = DATA.requests.find(x => x.id === id) || DATA.requests[0];
      return {
        title: `Settle — ${r.detail}`, sub: "L1 approved upstream; HR / Finance closes the chain and the ledger syncs.",
        crumbs: [{ label: "Approvals", go: "hr/web/approvals" }, { label: r.id }],
        actions: `${idtag(r.id)} ${badge(r.status)}`,
        body: `
        <div class="grid cols-3">
          <div class="span-2">${card("Chain", steps([
          { t: "Staff", s: r.who.split(" ")[0] }, { t: "Manager · L1", s: "Approved ✓" },
          { t: "HR / Finance · L2", s: "You are here" }, { t: "Ledger", s: "Payroll sync" }
        ], 2), { icon: "layers" })}
          ${card("Item", table([{ h: "Field" }, { h: "Value" }], [
          { cells: ["Who", r.who] }, { cells: ["What", r.detail] },
          { cells: ["Evidence", "Receipt photo · verified"] }, { cells: ["Cost center", "PRD-A-110"] },
          { cells: ["Reimburse via", "June payroll run (PR-2026-06)"] }
        ]), { icon: "file" })}</div>
          <div>${r.status === "pending" ? card("Decide", `<div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn ok" data-act="approve:${r.id}">${icon("check")} Settle via payroll</button>
            <button class="btn ghost" data-act="wf-route-finance">${icon("send")} Settle via finance</button>
            <button class="btn danger" data-act="return:${r.id}">${icon("x")} Return</button>
          </div>`, { icon: "settings" }) : card("Done", `<p class="small muted">Settled — lands on pay run PR-2026-06 as a reimbursement line.</p>`, { icon: "check" })}</div>
        </div>`
      };
    },

    comms() {
      const sent = DATA.state.sent;
      return {
        title: "Communication", sub: "One composer — pick who, pick how; System-Admin templates keep every send on-brand.",
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div class="card-head"><span class="t">${icon("send")} Compose</span><span class="badge acc">from template</span></div>
            <div class="field"><label>To — audience</label>
              <div class="choice-row" id="aud-row">
                <button class="choice" ${DATA.has("segmentation") ? "" : 'aria-pressed="true"'} data-act="pick:aud">Broadcast — all ${DATA.org().broadcast}</button>
                ${DATA.has("segmentation")
                  ? `<button class="choice" aria-pressed="true" data-act="pick:aud">Division · Production</button><button class="choice" data-act="pick:aud">Level · Supervisors</button><button class="choice" data-act="pick:aud">Site · Plant 1</button>`
                  : UI.lockChoice("Division", DATA.unlockLabel("segmentation")) + UI.lockChoice("Level", DATA.unlockLabel("segmentation")) + UI.lockChoice("Site", DATA.unlockLabel("segmentation"))}
                <button class="choice" data-act="pick:aud">Individual</button>
              </div>
            </div>
            <div class="field"><label>Channels — one or many, with fallback</label>
              <div class="choice-row" id="ch-row">
                <button class="choice" aria-pressed="true" data-act="pick:ch">${icon("mail")} Email</button>
                <button class="choice" aria-pressed="true" data-act="pick:ch">${icon("phone")} Push / in-app</button>
                ${MAIL.channels().filter(c => c.id !== "mail").map(c => { const lbl = c.id === "whatsapp" ? "WhatsApp" : c.id.toUpperCase(); return c.ready ? `<button class="choice" data-act="pick:ch">${icon("send")} ${lbl}</button>` : `<button class="choice" disabled style="opacity:.55" title="${esc(c.note)} — enable & configure in Platform Settings">${icon("lock")} ${lbl}</button>`; }).join("")}
              </div>
            </div>
            <div class="field"><label>Template</label>
              <select class="input"><option>Town hall announcement — EN · ລາວ (TPL-019)</option><option>Document expiry notice (TPL-026)</option><option>Shift reminder — SMS (TPL-023)</option></select>
              <span class="hint">Dear {{first_name}}, you're invited to the Q3 town hall on {{date}} at {{site}}…</span>
            </div>
            <div class="grid cols-2">
              <div class="field"><label>Schedule</label><div class="choice-row">
                <button class="choice" aria-pressed="true" data-act="pick:sch">Send now</button>${DATA.has("scheduledReports") ? `<button class="choice" data-act="pick:sch">Schedule</button><button class="choice" data-act="pick:sch">Recurring</button>` : UI.lockChoice("Schedule", DATA.unlockLabel("scheduledReports")) + UI.lockChoice("Recurring", DATA.unlockLabel("scheduledReports"))}</div></div>
              <div class="field"><label>Fallback</label>${DATA.has("sms") ? `<select class="input"><option>Push first → SMS if unread in 4h</option><option>None</option></select>` : `<div>${UI.lockTag(DATA.unlockLabel("sms"))} <span class="small muted">multi-channel fallback</span></div>`}</div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="small muted">≈ <b class="num" style="color:var(--ink)">${DATA.has("segmentation") ? DATA.org().segment + " recipients" : DATA.org().broadcast + " recipients"}</b> · ${DATA.has("segmentation") ? "Production" : "broadcast"} · ${DATA.has("broadcastEmail") ? "2 channels" : "1 channel"}</span>
              <button class="btn" data-act="send-comms">${icon("send")} Send</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Delivery — last 7 days", rowlist([
          rowitem({ icon: "mail", title: "Email", sub: "412 sent today", side: `<b class="num">99.2%</b>` }),
          rowitem({ icon: "phone", title: "Push / in-app", sub: "1,240 sent today", side: `<b class="num">99.9%</b>` }),
          DATA.has("sms") ? rowitem({ icon: "send", title: "SMS", sub: "86 sent today", side: `<b class="num">97.8%</b>` }) : `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">SMS</div><div class="rs">urgent · OTP · shift reminders</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("sms"))}</div></div>`,
          DATA.has("webhook") ? rowitem({ icon: "x", title: "LINE webhook", sub: "down since 09:31", side: badge("failed") }) : `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">LINE / WhatsApp webhooks</div><div class="rs">advanced channels</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("webhook"))}</div></div>`
        ]), { icon: "pulse" })}
            ${card("Sent log", sent.length ? rowlist(sent.map(s => rowitem({ icon: "check", title: `${s.id} · ${s.audience}`, sub: `${s.ch} · ${s.ts}`, side: `<b class="num">${s.est}</b>` }))) : rowlist([
          rowitem({ icon: "check", title: "MSG-0087 · Safety drill notice", sub: "Email · Push · Jun 08", side: `<b class="num">248</b>` }),
          rowitem({ icon: "check", title: "MSG-0086 · Payslip ready (auto)", sub: "Push · Jun 01", side: `<b class="num">246</b>` })
        ]), { icon: "history" })}
          </div>
        </div>`
      };
    },

    /* ---------- v2.3.2.db — HR data manager (HR-owned stores) ---------- */
    data(param) {
      const mineStores = ["db_people", "db_leave", "db_workflow", "db_payroll", "db_comms"];
      const sid = mineStores.includes(param) ? param : "db_people";
      const m = DB.meta(sid);
      const chips = mineStores.map(s => `<button class="choice" ${s === sid ? 'aria-pressed="true"' : ""} data-go="hr/web/data/${s}">${icon(DB.meta(s).icon)} ${s}</button>`).join("");
      const lastBk = DB.backups.all().find(b => b.stores.includes(sid));
      return {
        title: "Data manager", sub: "The stores the HR persona writes — browse, add and delete sample rows; snapshot any module before you touch it.",
        actions: `<button class="btn soft" data-act="backup-store:${sid}">${icon("download")} Snapshot ${sid} now</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Store", m.physical, m.layer + " · " + m.profile, { hero: 1 })}
          ${kpi("Rows", String(m.rows), m.tables.length + " table" + (m.tables.length > 1 ? "s" : ""))}
          ${kpi("Size", m.sizeKB + " KB", "one small database")}
          ${kpi("Last snapshot", lastBk ? lastBk.id : "—", lastBk ? lastBk.ts : "none yet — take one")}
        </div>
        ${card("Pick a store", `<div class="choice-row">${chips}</div>`, { icon: "layers" })}
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${m.tables.map(tn => card(sid + " · " + tn, DBV.tableEditor(sid, tn), { icon: "list" })).join("")}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Module backup — this store only", `<div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn soft" data-act="backup-store:${sid}">${icon("download")} Snapshot now</button>
              <button class="btn ghost" data-act="store-restore:${sid}">${icon("refresh")} Restore latest${lastBk ? " · " + lastBk.id : ""}</button>
              <button class="btn ghost" data-act="db-reset:${sid}">${icon("history")} Reseed sample data</button>
            </div><p class="small muted" style="margin-top:10px">${sid === "db_payroll" ? "Payroll's extra belt: the kernel also branches this store automatically before every pay run (step 3 of the run)." : "Backup / restore per module — restoring " + sid + " never rewinds another store."}</p>`, { icon: "shield" })}
            ${card("Why HR sees a scoped studio", `<p class="small muted">Full cross-store management (registry, provisioning, drills) lives with the System Admin. HR manages the content of the stores its cells own — the capability matrix (⚙) made literal.${DATA.tier() === "essential" ? " On Essential, HR doubles for the locked Admin persona — this section is the whole DB console you need at ≤50 seats." : ""}</p>`, { icon: "key" })}
          </div>
        </div>`
      };
    },

    /* ---------- v2.3.2.db — new hire (writes db_people through the People cell) ---------- */
    "person-new"() {
      const divs = ["Production", "Sales", "Logistics", "Finance", "Admin"];
      const teams = ["—", "Line A", "Line B"];
      return {
        title: "New hire", sub: "Creates the master record in db_people (EMP-#### · flow F) — every other module starts reading it instantly.",
        crumbs: [{ label: "People & Org", go: "hr/web/people" }, { label: "New hire" }],
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div class="grid cols-2">
              <div class="field"><label>Full name</label><input class="input" id="st-name" placeholder="e.g. Khamphone Soudavanh"></div>
              <div class="field"><label>Position</label><input class="input" id="st-pos" placeholder="e.g. Machine Operator"></div>
            </div>
            <div class="grid cols-2">
              <div class="field"><label>Division</label><select class="input" id="st-div">${divs.map(d => `<option>${d}</option>`).join("")}</select></div>
              <div class="field"><label>Team assignment</label><select class="input" id="st-team">${teams.map(x => `<option>${x}</option>`).join("")}</select><span class="hint">Assign “Line A” and the new hire appears on the Manager's roster, attendance board and schedule immediately.</span></div>
            </div>
            <div style="display:flex;gap:9px;justify-content:flex-end">
              <button class="btn ghost" data-go="hr/web/people">${t("common.cancel")}</button>
              <button class="btn" data-act="staff-add">${icon("plus")} Create employee record</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("What happens on create", rowlist([
              rowitem({ icon: "users", title: "Row lands in db_people", sub: "EMP-#### auto-issued · status: probation", side: "" }),
              rowitem({ icon: "lock", title: "employee.hired fact", sub: "appended to db_audit", side: "" }),
              rowitem({ icon: "chart", title: "Org KPIs move", sub: "headcount & division counts re-derive", side: "" })
            ]), { icon: "layers" })}
            ${card("One writer", `<p class="small muted">Only the People cell writes db_people — managers see the new row through their lens, never a copy. Offboarding later is the mirror image: export + delete, audit-logged.</p>`, { icon: "shield" })}
          </div>
        </div>`
      };
    },

    people() {
      return {
        title: "People & Org", sub: "Master record and the org backbone — every other module reads from here. Live from db_people: hire, reassign and offboard.",
        actions: `<button class="btn soft" data-act="export:orgchart">${icon("download")} Org chart</button><button class="btn" data-go="hr/web/person-new">${icon("plus")} New hire</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Active staff", String(DATA.employees.length), DATA.org().newMoM + " MoM · db_people live", { hero: 1 })}
          ${kpi("Divisions", "5", "Production · Sales · Logistics · Finance · Admin")}
          ${kpi("On probation", String(DATA.employees.filter(p => p.status === "probation").length), "review at 90 days")}
          ${kpi("Open lifecycle", "4", "1 onboard · 2 transfer · 1 exit")}
        </div>
        ${card("Directory", `
          <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
            <input class="input" style="max-width:280px" placeholder="Search name, ID, position…">
            <div class="choice-row"><button class="choice" aria-pressed="true">All</button><button class="choice">Production</button><button class="choice">Sales</button><button class="choice">Finance</button></div>
          </div>` + table(
          [{ h: "Employee" }, { h: "Division" }, { h: "Position" }, { h: "Since" }, { h: "Status" }, { h: "", r: 1 }],
          allStaff().map(p => ({
            go: `hr/web/person/${p.id}`,
            cells: [
              `<div style="display:flex;align-items:center;gap:10px">${avatar(p.name)}<div><div class="strong">${esc(p.name)}</div><div class="small muted">${esc(p.id)}</div></div></div>`,
              esc(p.div), esc(p.pos), esc(p.since),
              (p.status || "active") === "active" ? badge("active") : p.status === "probation" ? `<span class="badge warn">Probation</span>` : badge("flagged"),
              icon("chevR")
            ]
          }))), { icon: "users" })}`
      };
    },

    person(id) {
      const p = allStaff().find(x => x.id === id) || allStaff()[0];
      return {
        title: esc(p.name), sub: `${esc(p.pos)} · ${esc(p.div)} — the master record (full HR lens).`,
        crumbs: [{ label: "People & Org", go: "hr/web/people" }, { label: p.id }],
        actions: `<button class="btn ghost" data-act="gen-doc:hr-person-letter">${icon("file")} Generate letter</button><button class="btn soft soon" title="Build-phase feature — not wired in this UI preview" data-act="toast:Edit mode is a build-phase feature">${icon("edit")} Edit</button>`,
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">${avatar(p.name, 1)}
              <div><div style="font-weight:800;font-size:16px">${esc(p.name)}</div><div class="small muted">${esc(p.id)} · ${esc(p.div)} · since ${esc(p.since)}</div></div>
              <span style="margin-left:auto">${badge((p.status || "active") === "active" ? "active" : p.status)}</span></div>
            ${table([{ h: "Field" }, { h: "Value" }], [
          { cells: ["Position / grade", esc(p.pos) + " · G4"] },
          { cells: ["Employment", "Full-time · permanent"] },
          { cells: ["Reports to", "Khamla Sisouphanh (EMP-0098)"] },
          { cells: ["Cost center", "PRD-A-110"] },
          { cells: ["Documents", `Contract ✓ · ID ✓ · License <span class="badge warn">expiring</span>`] }
        ])}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${AUTHV.personAccessCard(p)}
            ${card("Manage record — db_people", `
              <div class="grid cols-2">
                <div class="field"><label>Division</label><select class="input" id="as-div">${["Production", "Sales", "Logistics", "Finance", "Admin"].map(d => `<option ${p.div === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
                <div class="field"><label>Team</label><select class="input" id="as-team">${["—", "Line A", "Line B"].map(x => `<option ${p.team === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <button class="btn soft" data-act="staff-assign:${p.id}">${icon("users")} Apply reassignment</button>
                <button class="btn danger" data-act="staff-del:${p.id}">${icon("logout")} Offboard &amp; remove</button>
              </div>
              <p class="small muted" style="margin-top:10px">Reassignment moves the row (managers' lenses update instantly); offboarding is export + delete — and it <b>revokes portal access &amp; sessions</b> in the same breath. All of it lands on db_audit.</p>`, { icon: "settings" })}
            ${card("Lifecycle", steps([{ t: "Onboard", s: p.since }, { t: "Active", s: "current" }, { t: "Transfer", s: "—" }, { t: "Offboard", s: "—" }], 1), { icon: "layers" })}
            ${card("Ledger trail", rowlist(DATA.requests.filter(r => r.who === p.name).slice(0, 3).map(r => rowitem({ icon: "inbox", title: `${r.id} · ${r.detail}`, sub: r.stage, side: badge(r.status) })) || []), { icon: "history" })}
          </div>
        </div>`
      };
    },

    /* ---------- v2.4.0.db.auth — access is an option on a person (§3 step 4) ---------- */
    access() {
      return {
        title: "Access & invites", sub: "Portal access is an add-on choice per person — switch it on in the employee form, off at exit. No access ≠ no employee.",
        actions: `<button class="btn soft" data-go="hr/web/import">${icon("files")} Import accounts</button><button class="btn ghost" data-go="hr/web/outbox">${icon("mail")} Demo outbox</button><button class="btn" data-go="hr/web/people">${icon("users")} Directory</button>`,
        body: AUTHV.accessBody()
      };
    },
    /* ---------- v2.4.1.edge.auth — bulk provisioning by file import (B5) ---------- */
    import(param) {
      return {
        title: "Import accounts", sub: "Bring people in from a CSV / Excel export — dry-run first (nothing is written), then commit. Local rows get an invite; LDAP/RADIUS rows bind the company directory. Dupes are caught by e-mail.",
        actions: `<button class="btn ghost" data-go="hr/web/access">${icon("key")} Access & invites</button>`,
        body: AUTHV.importWizard(param)
      };
    },
    outbox(param) {
      return {
        title: "Demo outbox", sub: "Invites, activation, reset and lockout mails — bilingual (EN · ລາວ), written to the db_comms sent log. Click a mail to read it and open its link.",
        crumbs: param ? [{ label: "Outbox", go: "hr/web/outbox" }, { label: param }] : undefined,
        body: AUTHV.outboxBody("hr/web", param)
      };
    },
    security() {
      return {
        title: "My security", sub: "Your account, your sessions — change the password, see where you're signed in, revoke anything.",
        body: AUTHV.mySecurity("hr")
      };
    },

    time() {
      return {
        title: "Time & Attendance", sub: "Org-wide live board from the attendance ledger — multi-source capture, one truth.",
        actions: `${DATA.has("biometrics") ? `<button class="btn" data-go="hr/web/clocking">${icon("grid")} Clock-in/out setup</button>` : ""}<button class="btn ghost" data-act="export:exceptions">${icon("download")} Exceptions</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Present", String(DATA.org().present), `${DATA.org().presentPct} of ${DATA.org().headcount}`, { hero: 1 })}
          ${kpi("Late", String(DATA.org().late), "auto-flagged")}
          ${kpi("Absent / no-show", String(DATA.org().absent), "on PV ladder")}
          ${kpi("Missing punches", DATA.has("deviceCapture") ? "6" : "2", "corrections open")}
        </div>
        <div class="grid cols-3" style="margin-top:16px">
          <div class="span-2">${card("By division — present today", bars(DATA.org().divisions.map(d => ({ l: d.name, v: Math.max(1, Math.round(d.staff * 0.94)), vt: Math.max(1, Math.round(d.staff * 0.94)) + "", tone: undefined })), { values: 1 }), { icon: "chart" })}</div>
          ${DATA.has("biometrics")
          ? card("Capture sources — today", rowlist((() => { const ic = { biometric: "grid", card: "lock", mobile: "phone", web: "globe" }; return DEVICES.captureMix().map(m => rowitem({ icon: ic[m.id] || "plug", title: m.label, sub: m.id === "biometric" ? "face / finger terminals" : m.id === "card" ? "card → gate readers" : m.id === "mobile" ? "geofenced + selfie" : "office staff", side: `<b class="num">${m.pct}%</b>` })); })()), { icon: "plug", link: "hr/web/clocking", linkLabel: "Configure" })
          : card("Capture sources — today", rowlist([
            rowitem({ icon: "phone", title: "Mobile + GPS", sub: "geofenced punches", side: `<b class="num">72%</b>` }),
            `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">Device · face / finger / card</div><div class="rs">scanner & kiosk capture</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("biometrics"))}</div></div>`,
            rowitem({ icon: "globe", title: "Web clock", sub: "office staff", side: `<b class="num">28%</b>` })
          ]), { icon: "plug" })}
        </div>
        ${card("Exceptions — today", table(
          [{ h: "Who" }, { h: "Exception" }, { h: "Source" }, { h: "Status" }, { h: "", r: 1 }],
          [
            { cells: ["Keo Sayavong", "No-show · 2nd this month", "Roster check", badge("flagged"), `<button class="btn xs soft" data-act="wf-pv-escalate">Escalate</button>`] },
            { cells: ["Noy Keomany", "Late 09:12 (+42m)", "Device scan", badge("late"), `<button class="btn xs ghost" data-act="wf-note-monitor">Note</button>`] },
            { cells: ["6 staff", "Missing punch", "Ledger scan", badge("pending"), `<button class="btn xs ghost" data-act="wf-correction-reminders">Remind</button>`] }
          ]), { icon: "alert" })}`
      };
    },

    leave() {
      return {
        title: "Leave & Absence", sub: "Configurable types and accrual — wired to the calendar and payroll.",
        actions: `<button class="btn soft" data-go="hr/web/holidays">${icon("calendar")} Holiday calendar</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("On leave today", "5", "2.0% of org", { hero: 1 })}
          ${kpi("Pending requests", "9", "across all teams")}
          ${kpi("Liability", "1,872 d", "accrued org-wide")}
          ${kpi("Carry-over expiring", "114 d", "by Dec 31")}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${card("Leave types & accrual", table(
          [{ h: "Type" }, { h: "Accrual" }, { h: "Carry-over" }, { h: "Approval" }],
          [
            { cells: ["Annual", "1.25 d / month", "max 5 d", "L1 → record"] },
            { cells: ["Sick", "15 d / year", "—", "L1 + certificate"] },
            { cells: ["Personal", "3 d / year", "—", "L1 → L2"] },
            { cells: ["Statutory (Lao)", "per labor law", "—", "auto"] }
          ]), { icon: "settings" })}
          ${card("July conflict heatmap — Production", UI.heatcal({ until: 0, levels: { 6: "l1", 7: "l2", 8: "l3", 9: "l2", 13: "l1", 20: "l1", 21: "l2" } }) + `<div class="legend" style="margin-top:10px"><span><i style="background:var(--acc-bg)"></i>1 away</span><span><i style="background:var(--acc-ln)"></i>2 away</span><span><i style="background:var(--acc)"></i>3+ away</span></div>`, { icon: "calendar" })}
        </div>`
      };
    },

    payroll() {
      return {
        title: "Payroll", sub: "Draft → validate → approve → disburse. Statutory PIT and social security are pluggable rule packs.",
        body: `
        <div class="grid cols-4">
          ${kpi("Current run", "PR-2026-06", "draft · cut-off Jun 25", { hero: 1 })}
          ${kpi("Gross (draft)", DATA.org().gross, DATA.org().runStaff + " staff")}
          ${kpi("May accuracy", "99.97%", "1 retro adjustment")}
          ${kpi("Bank file", "BCEL format", "export at disburse")}
        </div>
        ${card("Runs", table(
          [{ h: "Run" }, { h: "Period" }, { h: "Staff", r: 1 }, { h: "Gross", r: 1 }, { h: "Status" }, { h: "", r: 1 }],
          DATA.payrollRuns.map((r, i) => {
            const ess = DATA.tier() === "essential";
            const st = ess ? [48, 47, 47][i] || 47 : r.staff;
            const gr = ess ? ["₭ 276M", "₭ 271M", "₭ 268M"][i] || r.gross : r.gross;
            return {
              go: `hr/web/payroll-run/${r.id}`,
              cells: [idtag(r.id), r.period, `<span class="num">${st}</span>`, `<span class="num">${gr}</span>`, badge(r.state), icon("chevR")]
            };
          })), { icon: "banknote" })}
        ${card("Statutory packs — Lao PDR", rowlist([
          rowitem({ icon: "shield", title: "Personal income tax (PIT)", sub: "Progressive bands · 2026 tables", side: badge("active") }),
          rowitem({ icon: "heart", title: "Social security (SSO)", sub: "Employee 5.5% · employer 6.0%", side: badge("active") }),
          rowitem({ icon: "clock", title: "OT rules", sub: "150% weekday · 200% holiday · caps", side: badge("active") })
        ]) + `<p class="small muted" style="margin-top:10px">Swap per country — the payroll cell is sealed behind its contract (§04), so a bureau could replace it without the platform noticing.</p>`, { icon: "plug" })}`
      };
    },

    "payroll-run"(id) {
      const r = DATA.payrollRuns.find(x => x.id === id) || DATA.payrollRuns[0];
      const canAdvance = r.step < 4;
      const stepLabels = ["Draft", "Validate", "Approve", "Disburse"];
      return {
        title: "Pay run — " + r.period, sub: "Pulls time, OT, leave and claims from their cells; writes pay lines once.",
        crumbs: [{ label: "Payroll", go: "hr/web/payroll" }, { label: r.id }],
        actions: `${idtag(r.id)} ${badge(r.state)}`,
        body: `
        ${card("Progress", steps([
          { t: "Draft", s: "ledgers pulled" }, { t: "Validate", s: "codes · PIT · SSO" },
          { t: "Approve", s: "HR sign-off" }, { t: "Disburse", s: "bank file + payslips" }
        ], r.step - 1) + (canAdvance ? `<div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap">
          <button class="btn" data-act="advance-run:${r.id}">${icon("chevR")} ${["", "Validate run", "Approve run", "Disburse & export", ""][r.step]}</button>
          <button class="btn ghost" data-act="export:variance">${icon("eye")} Variance check</button>
        </div>` : `<p class="small muted" style="margin-top:12px">Disbursed — payslips published to staff mobile, burn posted to the CEO board.</p>`), { icon: "banknote" })}
        <div class="grid cols-3">
          ${kpi("Staff in run", String(DATA.org().runStaff), "joiners prorated")}
          ${kpi("Gross", DATA.org().gross, "earnings + OT + allowances")}
          ${kpi("Net payout", DATA.org().net, "after PIT + SSO")}
        </div>
        ${card("Pay lines (sample)", table(
          [{ h: "Employee" }, { h: "Basic", r: 1 }, { h: "OT", r: 1 }, { h: "PIT", r: 1 }, { h: "SSO", r: 1 }, { h: "Net", r: 1 }],
          [
            { cells: ["Souksavanh P.", `<span class="num">${kip(4200000)}</span>`, `<span class="num">${kip(540000)}</span>`, `<span class="num" style="color:var(--bad)">− ${kip(468000)}</span>`, `<span class="num" style="color:var(--bad)">− ${kip(310200)}</span>`, `<b class="num">${kip(4862000)}</b>`] },
            { cells: ["Manysone V.", `<span class="num">${kip(3900000)}</span>`, `<span class="num">${kip(495000)}</span>`, `<span class="num" style="color:var(--bad)">− ${kip(402000)}</span>`, `<span class="num" style="color:var(--bad)">− ${kip(286000)}</span>`, `<b class="num">${kip(4307000)}</b>`] },
            { cells: ["Keo S.", `<span class="num">${kip(3600000)}</span>`, `<span class="num">${kip(648000)}</span>`, `<span class="num" style="color:var(--bad)">− ${kip(380000)}</span>`, `<span class="num" style="color:var(--bad)">− ${kip(264000)}</span>`, `<b class="num">${kip(3964000)}</b>`] }
          ]), { icon: "list" })}`
      };
    },

    docs() {
      return {
        title: "Documents", sub: "Vault + generation: issue any letter from System-Admin templates — serialized, e-signed, logged.",
        body: `
        <div class="grid cols-3">
          ${kpi("Expiring ≤ 30 d", "7", "3 contracts · 4 licenses", { hero: 1 })}
          ${kpi("Policy ack rate", "92%", "Code of conduct v4")}
          ${kpi("Generated MTD", "41", "self-serve 28 · HR 13")}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${card("Generate now", `<div class="choice-row" style="margin-bottom:12px">
            <button class="choice" data-act="gen-doc:hr-employment-letter">${icon("file")} Employment letter</button>
            <button class="choice" data-act="gen-doc:hr-bulk-salary-finance">${icon("banknote")} Salary certificate</button>
            <button class="choice" data-act="gen-doc:hr-contract-renewals">${icon("refresh")} Contract renewal</button>
          </div><p class="small muted">Each pulls merge fields from the people-ledger and routes via flow J (DOC-####).</p>`, { icon: "sparkle" })}
          ${card("Expiry watchlist", rowlist([
          rowitem({ icon: "alert", title: "3 contracts — Jul 2026", sub: "Davone P. +2 · renewal letters ready", side: badge("expiring") }),
          rowitem({ icon: "alert", title: "4 licenses — Q3", sub: "Forklift ×2 · electrician ×2", side: badge("expiring") }),
          rowitem({ icon: "check", title: "Visas / work permits", sub: "none expiring ≤ 90 d", side: badge("ok") })
        ]), { icon: "bell" })}
        </div>`
      };
    },

    reports() {
      return {
        title: "Reports", sub: "Each section keeps its last 3 generated runs with query detail — click a run to view (read-only) or use its download link. Older runs move to file storage, one folder per report.",
        actions: `<button class="btn ghost" data-go="hr/web/report-files">${icon("folder")} File storage</button>`,
        body: REP.library("hr", "hr/web")
      };
    },

    /* ---------- v2.3.2.db — run viewer (view-only snapshot + download link) ---------- */
    "report-run"(param) {
      const p = REP.runPage(param, "hr", "hr/web");
      return {
        title: p.title, sub: p.sub,
        crumbs: [{ label: "Reports", go: "hr/web/reports" }, { label: p.run ? p.run.id : "run" }],
        actions: p.run ? `${idtag(p.run.id)} ${p.run.archived ? `<span class="badge plain">archived</span>` : `<span class="badge ok plain">recent</span>`}` : "",
        body: p.body
      };
    },

    /* ---------- v2.3.2.db — file storage (archive, one folder per report) ---------- */
    "report-files"() {
      const f = REP.filesPage("hr", "hr/web");
      return {
        title: "Report file storage", sub: "Runs older than the last 3 are hidden here — one folder per report, view-only with download links. Retention expires files beyond 12 per report.",
        crumbs: [{ label: "Reports", go: "hr/web/reports" }, { label: "File storage" }],
        body: f.kpis + f.folders
      };
    },

    /* ---------- v2.4.2 — Clock-in/out: capture groups & methodology ---------- */
    clocking() {
      const groups = DEVICES.groups(), mix = DEVICES.captureMix();
      const tbl = table(
        [{ h: "Group" }, { h: "Staff", r: 1 }, { h: "Primary method" }, { h: "Also allowed" }, { h: "Devices" }, { h: "Geofence" }, { h: "", r: 1 }],
        groups.map(g => ({
          go: `hr/web/group/${g.id}`,
          cells: [
            `<span class="strong">${esc(g.name)}</span> <span class="mono small muted">${g.id}</span>`,
            `<span class="num">${(g.members || []).length}</span>`,
            methodChip(g.primary, true),
            (g.allow || []).filter(m => m !== g.primary).map(m => methodChip(m)).join(" ") || `<span class="small muted">—</span>`,
            (g.devices && g.devices.length) ? g.devices.map(d => `<span class="pill">${d}</span>`).join(" ") : `<span class="small muted">mobile / web</span>`,
            g.geofence ? `<span class="small">${g.geofence} m</span>` : `<span class="small muted">off</span>`,
            icon("chevR")
          ]
        })));
      return {
        title: "Clock-in / out",
        sub: "Group your people, then choose how each group clocks — biometric terminal, card, gate, mobile GPS + selfie, web or PIN. The methodology a person inherits from their group drives what they see and how the device routes their punch into db_time.",
        actions: `<button class="btn ghost" data-go="sysadmin/web/devmonitor">${icon("pulse")} Device monitor</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Capture groups", String(groups.length), "by methodology", { hero: 1 })}
          ${kpi("Staff assigned", String(DEVICES.assignedCount()), `of ${DATA.employees.length} on file`)}
          ${kpi("Methods in use", String(new Set(groups.map(g => g.primary)).size), "primary across groups")}
          ${kpi("Devices bound", String(new Set([].concat(...groups.map(g => g.devices || []))).size), "terminals → groups")}
        </div>
        ${card("Capture groups", tbl, { icon: "users", link: "sysadmin/web/biometrics", linkLabel: "Devices" })}
        <div class="grid cols-3">
          <div class="span-2">${card("Create a capture group", `
            <div id="grpf-new" class="pv-form" style="max-width:520px">
              <div class="field"><label>Group name</label><input class="input" data-f="name" placeholder="e.g. Night shift · Line C"></div>
              <div class="field"><label>Primary clock-in/out method</label><select class="input" data-f="primary">${DEVICES.methods().map(m => `<option value="${m.id}">${m.label}</option>`).join("")}</select><span class="hint">Add fallback methods and assign staff on the next screen.</span></div>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="group-add">${icon("plus")} Create group</button></div>`, { icon: "plus" })}</div>
          ${card("Capture mix — today", `${bars(mix.map(m => ({ l: m.label, v: m.v })), { values: 1, w: 300, h: 140 })}<div class="small muted" style="margin-top:4px">${mix.map(m => `${m.label} ${m.pct}%`).join(" · ")}</div>`, { icon: "chart" })}
        </div>
        ${card("Methodologies", `<div class="methgrid">${DEVICES.methods().map(m => `<div class="methtile"><div class="mt-h">${icon(m.icon)} ${m.label}</div><div class="mt-s">${esc(m.blurb)}</div></div>`).join("")}</div>`, { icon: "layers" })}`
      };
    },

    group(param) {
      const g = DEVICES.groupById(param) || DEVICES.groups()[0];
      if (!g) return { title: "Capture group", body: empty("users", "No capture groups", "Create one from Clock-in / out.") };
      const members = g.members || [];
      const avail = DATA.employees.filter(e => !members.includes(e.id));
      const methodPicker = `<div class="methgrid">${DEVICES.methods().map(m => {
        const isPrimary = g.primary === m.id, isAllowed = (g.allow || []).includes(m.id);
        return `<div class="methtile" aria-pressed="${isAllowed}" data-act="group-allow:${g.id}:${m.id}" role="button" tabindex="0">
          <div class="mt-h">${icon(m.icon)} ${m.label}</div>
          <div class="mt-s">${esc(m.blurb)}</div>
          <div style="margin-top:5px">${isPrimary ? `<span class="badge ok">Primary</span>` : isAllowed ? `<button class="btn xs ghost" data-act="group-method:${g.id}:${m.id}">Make primary</button>` : `<span class="small muted">tap to allow</span>`}</div>
        </div>`;
      }).join("")}</div>`;
      const memberTbl = members.length ? table(
        [{ h: "Staff" }, { h: "Role" }, { h: "Clocks via" }, { h: "", r: 1 }],
        members.map(id => { const m = empMeta(id); return { cells: [`<span class="strong">${esc(m.name)}</span> <span class="mono small muted">${id}</span>`, `<span class="small">${esc(m.role)}</span>`, methodChip(g.primary, true), `<button class="btn xs ghost" data-act="group-remove:${g.id}:${id}">Remove</button>`] }; })
      ) : empty("users", "No staff yet", "Add people on the right.");
      return {
        title: g.name, sub: `Methodology & roster for this capture group. Staff here clock via ${DEVICES.methodLabel(g.primary)}${(g.allow || []).length > 1 ? ` (fallbacks: ${(g.allow || []).filter(x => x !== g.primary).map(DEVICES.methodLabel).join(", ")})` : ""}.`,
        crumbs: [{ label: "Clock-in / out", go: "hr/web/clocking" }, { label: g.id }],
        actions: `${idtag(g.id)} ${methodChip(g.primary, true)}`,
        body: `
        <div class="grid cols-4">
          ${kpi("Members", String(members.length), "in this group", { hero: 1 })}
          ${kpi("Primary method", DEVICES.methodLabel(g.primary), "device-routed")}
          ${kpi("Fallbacks", String(Math.max(0, (g.allow || []).length - 1)), "never-block")}
          ${kpi("Geofence", g.geofence ? g.geofence + " m" : "off", g.geofence ? "radius" : "no GPS gate")}
        </div>
        ${card("Clock-in/out methodology", `<p class="small muted" style="margin-bottom:10px">Tap a method to allow it for this group; “Make primary” sets the default the device routes to. The primary is always allowed; extra methods are never-block fallbacks (e.g. mobile when a terminal is down).</p>${methodPicker}`, { icon: "settings" })}
        <div class="grid cols-3">
          <div class="span-2">${card("Roster", memberTbl, { icon: "users" })}</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Add staff", `<div class="field"><label>Assign to ${esc(g.name)}</label><select class="input" id="grp-assign-${g.id}">${avail.map(e => `<option value="${e.id}">${esc(e.name)} · ${e.team && e.team !== "—" ? e.team : e.div}</option>`).join("")}</select></div><button class="btn sm" data-act="group-assign:${g.id}">${icon("plus")} Add to group</button><p class="small muted" style="margin-top:8px">A person belongs to one capture group — adding moves them here.</p>`, { icon: "plus" })}
            ${card("Bound devices", (g.devices && g.devices.length) ? rowlist(g.devices.map(d => { const dv = DEVICES.deviceById(d); return rowitem({ icon: "grid", title: dv ? `${dv.vendor} ${dv.model}` : d, sub: dv ? dv.zone : "—", side: dv ? `<button class="btn xs ghost" data-go="sysadmin/web/device/${dv.id}">Open</button>` : "" }); })) : `<p class="small muted">No fixed terminal — this group clocks by ${DEVICES.methodLabel(g.primary)}.</p>`, { icon: "plug" })}
          </div>
        </div>
        ${g.note ? card("Note", `<p class="small muted">${esc(g.note)}</p>`, { icon: "file" }) : ""}`
      };
    },

    /* ===================================================================
       v2.4.3 — PAYROLL area  (Dashboard · Staff pay · Pay slips · OT · Tax)
       =================================================================== */
    "pay-dash"() {
      const dl = PAY.deadline(), sums = PAY.divisionSums();
      const grossAll = sums.reduce((a, s) => a + s.gross, 0);
      const netAll = sums.reduce((a, s) => a + s.net, 0);
      const dedAll = sums.reduce((a, s) => a + s.nssf + s.pit, 0);
      const over = OT.overDivisions("monthly"), tot = OT.totals("monthly"), run = DATA.payrollRuns[0];
      const otPend = DATA.requests.filter(r => r.type === "Overtime" && r.status === "pending");
      return {
        title: "Payroll dashboard", sub: "Deadlines, alerts and the month at a glance — NSSF & PIT remit by the 15th of the following month (Lao rule).",
        actions: `<button class="btn ghost" data-go="hr/web/pay-staff">${icon("users")} Staff pay</button><button class="btn" data-go="hr/web/payroll">${icon("banknote")} Pay runs</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Remittance due", dl.date, dl.days + " day" + (dl.days === 1 ? "" : "s") + " left", { hero: 1 })}
          ${kpi("Current run", run.id, run.state + " · cut-off " + run.cutoff)}
          ${kpi("Gross (month)", kip(grossAll), DATA.employees.length + " staff")}
          ${kpi("OT used", tot.used + " h", "of " + tot.limit + " h budget")}
        </div>
        <div class="grid cols-3" style="margin-top:16px">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Alerts & approvals", rowlist([
          over.length
            ? rowitem({ icon: "alert", title: over.length + " division" + (over.length > 1 ? "s" : "") + " over OT quota", sub: over.map(o => o.div + " +" + o.by + " h").join(" · "), side: badge("flagged"), go: "hr/web/pay-ot" })
            : rowitem({ icon: "check", title: "OT within quota", sub: "every division under its monthly limit", side: badge("ok"), go: "hr/web/pay-ot" }),
          rowitem({ icon: "clock", title: "OT approvals pending", sub: tot.pending + " h awaiting decision (L1 → HR)", side: `<b class="num">${otPend.length}</b>`, go: "hr/web/pay-ot" }),
          rowitem({ icon: "sun", title: "Over-quota leave check", sub: "pending leave beyond annual balance", side: badge("warn"), go: "hr/web/approvals" }),
          rowitem({ icon: "banknote", title: "Pay run " + run.id + " · " + run.state, sub: run.notes, side: badge(run.state), go: "hr/web/payroll" })
        ]), { icon: "bell" })}
            ${card("Cost by division — this month", bars(sums.map(s => ({ l: s.div, v: Math.round(s.gross / 1e6), vt: Math.round(s.gross / 1e6) + "M" })), { values: 1 }), { icon: "chart", link: "hr/web/pay-staff", linkLabel: "Staff pay" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Remittance countdown", `<div style="text-align:center">${donut(Math.max(2, Math.min(100, Math.round((1 - dl.days / 30) * 100))), { color: dl.days <= 5 ? "var(--bad)" : dl.days <= 10 ? "var(--warn)" : "var(--acc)" })}<div style="margin-top:8px"><div class="strong">${dl.date}</div><div class="small muted">${dl.days} day(s) · NSSF + PIT</div></div></div>`, { icon: "clock" })}
            ${card("This month", rowlist([
          rowitem({ icon: "banknote", title: "Gross", sub: "earnings + OT + allowances", side: `<b class="num">${kip(grossAll)}</b>` }),
          rowitem({ icon: "shield", title: "NSSF + PIT", sub: "employee deductions", side: `<b class="num">${kip(dedAll)}</b>` }),
          rowitem({ icon: "check", title: "Net payout", sub: "after deductions", side: `<b class="num">${kip(netAll)}</b>` })
        ]), { icon: "layers" })}
          </div>
        </div>`
      };
    },

    "pay-staff"(param) {
      const divs = OT.divisions();
      const sel = (param && (param === "all" || divs.includes(param))) ? param : "all";
      const sums = PAY.divisionSums();
      const rows = PAY.components().filter(c => sel === "all" || c.div === sel);
      const chips = [`<button class="choice" ${sel === "all" ? 'aria-pressed="true"' : ""} data-go="hr/web/pay-staff/all">All divisions</button>`]
        .concat(divs.map(d => `<button class="choice" ${sel === d ? 'aria-pressed="true"' : ""} data-go="hr/web/pay-staff/${d}">${d}</button>`)).join("");
      const keys = ["count", "basic", "allowance", "ot", "misc", "gross", "nssf", "pit", "net"];
      const selSum = sel === "all"
        ? sums.reduce((a, s) => { keys.forEach(k => a[k] = (a[k] || 0) + s[k]); return a; }, {})
        : (sums.find(s => s.div === sel) || { count: 0, basic: 0, allowance: 0, ot: 0, misc: 0, gross: 0, nssf: 0, pit: 0, net: 0 });
      const tbl = table(
        [{ h: "Employee" }, { h: "Division" }, { h: "Basic", r: 1 }, { h: "Allowance", r: 1 }, { h: "OT", r: 1 }, { h: "Misc", r: 1 }, { h: "Gross", r: 1 }, { h: "Net", r: 1 }],
        rows.map(c => ({
          cells: [
            `<span class="strong">${esc(c.name)}</span> <span class="mono small muted">${c.emp}</span>`, c.div,
            `<span class="num">${kip(c.basic)}</span>`, `<span class="num">${kip(c.allowance)}</span>`,
            `<span class="num">${kip(c.ot)}</span>`, `<span class="num">${kip(c.misc)}</span>`,
            `<span class="num">${kip(c.gross)}</span>`, `<b class="num">${kip(c.net)}</b>`
          ]
        })).concat([{
          cells: [`<span class="strong">Σ ${sel === "all" ? "All divisions" : sel}</span>`, `<span class="small muted">${selSum.count || 0} staff</span>`,
          `<b class="num">${kip(selSum.basic || 0)}</b>`, `<b class="num">${kip(selSum.allowance || 0)}</b>`, `<b class="num">${kip(selSum.ot || 0)}</b>`,
          `<b class="num">${kip(selSum.misc || 0)}</b>`, `<b class="num">${kip(selSum.gross || 0)}</b>`, `<b class="num">${kip(selSum.net || 0)}</b>`]
        }]));
      return {
        title: "Staff pay", sub: "Per-employee components by division — allowance, OT and misc, with a running sum per division. Snapshot, or export / import a division as CSV.",
        actions: `<button class="btn ghost" data-act="pay-export:${sel}">${icon("download")} Export ${sel === "all" ? "all" : sel}</button><button class="btn ghost" data-act="pay-export-json:${sel}">${icon("download")} JSON</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Division", sel === "all" ? "All" : sel, (selSum.count || 0) + " staff", { hero: 1 })}
          ${kpi("Allowance Σ", kip(selSum.allowance || 0), "position + meal / transport")}
          ${kpi("OT Σ", kip(selSum.ot || 0), "approved overtime pay")}
          ${kpi("Gross Σ", kip(selSum.gross || 0), "before NSSF + PIT")}
        </div>
        ${card("Filter by division", `<div class="choice-row">${chips}</div>`, { icon: "layers" })}
        ${card(sel === "all" ? "All divisions" : sel + " division", tbl, { icon: "banknote", link: "hr/web/pay-tax", linkLabel: "Tax config" })}
        <div class="grid cols-3">
          <div class="span-2">${card("Save · load · export · import", `
            <div class="choice-row" style="margin-bottom:12px">
              <button class="choice" data-act="pay-save">${icon("download")} Save snapshot</button>
              <button class="choice" data-act="pay-load">${icon("refresh")} Load latest</button>
              <button class="choice" data-act="pay-export:${sel}">${icon("download")} Export CSV (${sel})</button>
              <button class="choice" data-act="pay-import">${icon("files")} Import CSV</button>
            </div>
            <input type="hidden" id="paydiv" value="${sel}">
            <div class="field"><label>Import CSV into <b>${sel === "all" ? "matched divisions" : sel}</b> — columns: emp,name,div,basic,allowance,ot,misc</label>
              <textarea class="input mono" id="payimp" placeholder="EMP-0214,Souksavanh Phommachanh,Production,4200000,1500000,540000,200000"></textarea>
              <span class="hint">Export first to get the exact format, edit values, then paste back and Import.</span></div>
            <div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn ghost" data-act="pay-import-sample">${icon("files")} Load current as sample</button><button class="btn" data-act="pay-import">${icon("send")} Import</button></div>`, { icon: "layers" })}</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Per-division sums", rowlist(sums.map(s => rowitem({ icon: "banknote", title: s.div, sub: s.count + " staff · OT " + kip(s.ot), side: `<b class="num">${kip(s.gross)}</b>`, go: `hr/web/pay-staff/${s.div}` }))), { icon: "chart" })}
          </div>
        </div>`
      };
    },

    "pay-slips"() {
      const slips = DATA.payslips, months = PAY.months(), sum = PAY.monthSum();
      return {
        title: "Pay slips", sub: "Per-employee payslips by month — view the monthly sum, download one or ZIP them all, and set the delivery schedule.",
        actions: `<button class="btn" data-act="pay-zip">${icon("download")} ZIP all</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Payslips on file", String(slips.length), months.length + " month(s)", { hero: 1 })}
          ${kpi("Gross Σ", kip(sum.gross), "all slips")}
          ${kpi("Net Σ", kip(sum.net), "after deductions")}
          ${kpi("Next delivery", "Jun 30", "auto · Email + Push")}
        </div>
        ${card("Slips", table(
          [{ h: "Slip" }, { h: "Employee" }, { h: "Period" }, { h: "Gross", r: 1 }, { h: "Net", r: 1 }, { h: "Status" }, { h: "", r: 1 }],
          slips.map(p => ({
            cells: [idtag(p.id), esc((DATA.employees.find(e => e.id === p.emp) || {}).name || p.emp), p.period,
            `<span class="num">${kip(p.gross)}</span>`, `<b class="num">${kip(p.net)}</b>`,
            badge(p.status === "ready" ? "ok" : p.status), `<button class="btn xs ghost" data-act="pay-slip-dl:${p.id}">${icon("download")} CSV</button>`]
          }))), { icon: "receipt" })}
        <div class="grid cols-2">
          ${card("Monthly summary", rowlist(months.map(mn => { const s = PAY.monthSum(mn); return rowitem({ icon: "banknote", title: mn, sub: s.count + " slip(s) · net " + kip(s.net), side: `<b class="num">${kip(s.gross)}</b>` }); })), { icon: "chart" })}
          ${card("Delivery schedule", `
            <div class="field"><label>Channel</label><div class="choice-row"><button class="choice" aria-pressed="true" data-act="pick:pd">${icon("mail")} Email</button><button class="choice" aria-pressed="true" data-act="pick:pd">${icon("phone")} Push</button><button class="choice" data-act="pick:pd">${icon("send")} SMS</button></div></div>
            <div class="grid cols-2">
              <div class="field"><label>When</label><select class="input"><option>On disburse (auto)</option><option>Day after disburse</option><option>Manual release</option></select></div>
              <div class="field"><label>Day</label><select class="input"><option>Last working day</option><option>1st of month</option></select></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span class="small muted">Template: Payslip ready (TPL-021)</span><button class="btn sm soft soon" data-act="toast:Delivery dispatch is a build-phase feature — the schedule is saved; PDF render + send land in the build phase">${icon("send")} Save schedule</button></div>
            <p class="small muted" style="margin-top:8px">${icon("lock", "lk")} PDF render &amp; dispatch are build-phase; CSV download &amp; ZIP all work now.</p>`, { icon: "calendar" })}
        </div>`
      };
    },

    "pay-ot"() {
      const seg = `<div class="seg" role="group" aria-label="Overtime view" style="margin-bottom:16px;width:fit-content"><button aria-pressed="true">${icon("inbox")} Approvals</button><button data-go="hr/web/pay-otq">${icon("settings")} Quota management</button></div>`;
      const divs = OT.divisions();
      const pend = DATA.requests.filter(r => r.type === "Overtime" && r.status === "pending");
      const tot = OT.totals("monthly");
      const divOf = (r) => r.div || ((DATA.employees.find(e => e.id === r.emp || e.name === r.who) || {}).div);
      const sections = divs.map(d => {
        const q = OT.quotaFor(d, "monthly"), rem = OT.remaining(q);
        const reqs = pend.filter(r => divOf(r) === d);
        const head = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <div style="flex:1;min-width:170px">${UI.meter(OT.pct(q), { label: `${q.used} / ${q.limit} h used · ${rem} h left · ${q.pending} h pending` })}</div>
            <div style="display:flex;align-items:center;gap:6px"><label class="small muted">Limit</label><input class="input" style="width:88px" id="ot-${d}-monthly" value="${q.limit}"><button class="btn xs soft" data-act="ot-limit:${d}:monthly">Set</button></div>
          </div>`;
        const body = reqs.length ? reqs.map(r => `
          <div class="qrow"><div class="qmain"><div class="qt">${idtag(r.id)} ${esc(r.who.split(" ")[0])} · ${esc(r.detail)} <span class="sla">${r.sla}</span></div><div class="qs">${esc(r.dates)} · ${OT.parseHours(r.detail)} h → ${d}</div></div>
          <div class="qact"><button class="btn ok sm" data-act="approve:${r.id}">${icon("check")} Approve</button><button class="btn danger sm" data-act="return:${r.id}">${icon("x")} Return</button></div></div>`).join("") : `<p class="small muted">No pending OT for ${d}.</p>`;
        return card(d, head + body, { icon: "clock", badge: `<span class="badge ${OT.tone(q)}">${rem} h left</span>` });
      }).join("");
      return {
        title: "Overtime — approvals", sub: "Pending OT split by division, each against its live monthly quota. Approving consumes the division's remaining hours; set a division's limit inline.",
        crumbs: [{ label: "Payroll", go: "hr/web/pay-dash" }, { label: "Overtime" }],
        actions: `<button class="btn ghost" data-go="hr/web/pay-otq">${icon("settings")} Quota management</button>`,
        body: seg + `
        <div class="grid cols-4">
          ${kpi("Pending OT", String(pend.length), "awaiting approval", { hero: 1 })}
          ${kpi("OT used", tot.used + " h", "of " + tot.limit + " h")}
          ${kpi("Remaining", Math.max(0, tot.limit - tot.used - tot.pending) + " h", "across divisions")}
          ${kpi("Over quota", String(tot.over.length), tot.over.length ? tot.over.map(o => o.div).join(", ") : "none")}
        </div>
        ${sections}`
      };
    },

    "pay-otq"() {
      const seg = `<div class="seg" role="group" aria-label="Overtime view" style="margin-bottom:16px;width:fit-content"><button data-go="hr/web/pay-ot">${icon("inbox")} Approvals</button><button aria-pressed="true">${icon("settings")} Quota management</button></div>`;
      const divs = OT.divisions(), pol = OT.policy();
      const mk = (scope) => table(
        [{ h: "Division" }, { h: "Limit (h)", r: 1 }, { h: "Used", r: 1 }, { h: "Pending", r: 1 }, { h: "Remaining", r: 1 }, { h: "Utilisation" }, { h: "", r: 1 }],
        divs.map(d => { const q = OT.quotaFor(d, scope), rem = OT.remaining(q);
          return { cells: [
            `<span class="strong">${d}</span>`,
            `<input class="input" style="width:88px" id="ot-${d}-${scope}" value="${q.limit}">`,
            `<span class="num">${q.used}</span>`, `<span class="num">${q.pending}</span>`,
            `<span class="num">${rem}</span>`, UI.meter(OT.pct(q), {}),
            `<button class="btn xs soft" data-act="ot-limit:${d}:${scope}">Set</button>`
          ] }; }));
      return {
        title: "Overtime — quota management", sub: "Set the OT budget per division, monthly or yearly. Limits drive the approval guardrails and the over-quota alerts on the dashboard.",
        crumbs: [{ label: "Payroll", go: "hr/web/pay-dash" }, { label: "Overtime" }],
        actions: `<button class="btn ghost" data-go="hr/web/pay-ot">${icon("inbox")} Approvals</button>`,
        body: seg + `
        <div class="grid cols-2">
          ${card("Monthly quota — Jun 2026", mk("monthly"), { icon: "clock" })}
          ${card("Yearly quota — 2026", mk("yearly"), { icon: "calendar" })}
        </div>
        ${card("OT rate policy — Lao Labour Law", table(
          [{ h: "Rule" }, { h: "Rate / cap", r: 1 }],
          [
            { cells: ["Weekday overtime", `<b class="num">${pol.weekday}%</b>`] },
            { cells: ["Weekly rest-day", `<b class="num">${pol.restday}%</b>`] },
            { cells: ["Public-holiday rest", `<b class="num">${pol.holiday}%</b>`] },
            { cells: ["Daily cap", `<b class="num">${pol.dailyCapH} h</b>`] },
            { cells: ["Monthly cap / person", `<b class="num">${pol.monthlyCapH} h</b>`] }
          ]) + `<p class="small muted" style="margin-top:8px">${esc(pol.note)}</p>`, { icon: "shield" })}`
      };
    },

    "pay-tax"() {
      const t = PAY.taxConfig(), comp = PAY.compliance();
      const brTbl = table(
        [{ h: "Monthly band (₭)" }, { h: "Rate", r: 1 }],
        t.brackets.map((b, i) => { const lo = i === 0 ? 0 : t.brackets[i - 1][0], hi = b[0];
          return { cells: [lo.toLocaleString("en-US") + " – " + (hi == null ? "above" : hi.toLocaleString("en-US")), `<b class="num">${b[1]}%</b>`] }; }));
      return {
        title: "Tax & NSSF", sub: "NSSF and PIT configuration. The Lao statutory values are the compliance baseline — adjust any field and a badge flags deviation.",
        actions: `<button class="btn ghost" data-act="tax-reset">${icon("refresh")} Reset to statutory</button><button class="btn" data-act="tax-save">${icon("check")} Save config</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Compliance", comp.level, comp.level === "Compliant" ? "matches Lao statutory" : comp.diffs.length + " deviation(s)", { hero: 1 })}
          ${kpi("NSSF (employee)", t.nssfEmp + "%", "employer " + t.nssfEr + "%")}
          ${kpi("NSSF cap", kip(t.nssfCap), "monthly ceiling")}
          ${kpi("PIT exemption", kip(t.pitExempt), "monthly · 0% band")}
        </div>
        <div class="grid cols-3">
          <div class="span-2">${card("Configure", `
            <div class="grid cols-2">
              <div class="field"><label>NSSF — employee %</label><input class="input" id="tax-nssfEmp" value="${t.nssfEmp}"></div>
              <div class="field"><label>NSSF — employer %</label><input class="input" id="tax-nssfEr" value="${t.nssfEr}"></div>
              <div class="field"><label>NSSF — monthly cap (₭)</label><input class="input" id="tax-nssfCap" value="${t.nssfCap}"></div>
              <div class="field"><label>PIT — monthly exemption (₭)</label><input class="input" id="tax-pitExempt" value="${t.pitExempt}"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn ghost" data-act="tax-reset">${icon("refresh")} Reset to statutory</button><button class="btn" data-act="tax-save">${icon("check")} Save</button></div>
            <p class="small muted" style="margin-top:6px">Saving recomputes every payslip's PIT &amp; NSSF and the Staff-pay net column.</p>`, { icon: "settings" })}
          ${card("PIT brackets (progressive)", brTbl, { icon: "chart" })}</div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Compliance — " + comp.level, comp.level === "Compliant"
          ? `<p class="small"><span class="badge ok">Compliant</span> Config matches the Lao statutory baseline.</p>`
          : `<p class="small" style="margin-bottom:6px"><span class="badge warn">Adjusted</span> Deviates from statutory:</p><ul class="small muted" style="margin:0;padding-left:18px">${comp.diffs.map(d => `<li>${esc(d)}</li>`).join("")}</ul>`, { icon: "shield" })}
            ${card("Statutory guideline", rowlist([
          rowitem({ icon: "heart", title: "NSSF", sub: "5.5% employee · 6% employer", side: badge("active") }),
          rowitem({ icon: "shield", title: "PIT", sub: "0–25% · exempt ₭1.3M", side: badge("active") }),
          rowitem({ icon: "clock", title: "Remit by", sub: "15th of following month", side: "" })
        ]), { icon: "file" })}
          </div>
        </div>`
      };
    }
  };

  /* ---------- MOBILE (light) ---------- */
  const mobile = {
    queue() {
      const inbox = APPROVALSVIEW.inboxScreen({ persona: "hr", device: "mobile", canEdit: true });
      return {
        title: "Queue", body: `
        <div class="grid cols-2">${kpi("Waiting on HR", String(APPROVALS.pending()), "all modules", { hero: 1 })}${kpi("Present", "95.1%", "236 of 248")}</div>
        ${inbox.body}
        ${card("Cross-module", rowlist([
          rowitem({ icon: "edit", title: "TC-0109 · ledger adjust", sub: "Latsamy V.", side: `<button class="btn xs soft" data-act="wf-ledger-adjust">Post</button>` }),
          rowitem({ icon: "file", title: "DOC-0290 · salary cert", sub: "Manysone V.", side: `<button class="btn xs soft" data-act="gen-doc:hr-salary-manysone">Go</button>` })
        ]), { icon: "layers" })}`
      };
    },
    alerts() {
      return {
        title: "Alerts", body: card("Today", rowlist([
          rowitem({ icon: "banknote", title: "Payroll cut-off in 15 d", sub: "PR-2026-06 still in draft", side: badge("draft") }),
          rowitem({ icon: "alert", title: "3 contracts expiring", sub: "Renewal letters ready", side: badge("expiring") }),
          rowitem({ icon: "x", title: "LINE channel down", sub: "SysAdmin notified 09:31", side: badge("failed") }),
          rowitem({ icon: "shield", title: "2 compliance flags", sub: "No-show ladder · Production", side: badge("flagged") })
        ]), { icon: "bell" })
      };
    },
    me() {
      const m = DATA.me.hr;
      return {
        title: "Me", body: `
        ${card("", `<div style="display:flex;align-items:center;gap:12px">${avatar(m.name, 1)}<div><div style="font-weight:800">${m.name}</div><div class="small muted">${m.role}</div></div></div>`)}
        ${card("Mobile is deliberately light", `<p class="small muted">Queue, alerts and profile only — the full HR console (payroll, people, comms) lives on web. That split is a v2.3 design decision, not a gap.</p>`, { icon: "sparkle" })}`
      };
    },
    approval(id) {
      const r = DATA.requests.find(x => x.id === id) || DATA.requests[0];
      return {
        title: r.id, back: "hr/mobile/queue", body: `
        ${card("", `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">${idtag(r.id)}${badge(r.status)}</div>
        <h3 style="font-size:16px;margin:10px 0 2px">${r.who} · ${r.detail}</h3><div class="small muted">L1 ✓ · ${r.dates}</div>`)}
        ${r.status === "pending" ? `<div style="display:flex;gap:9px"><button class="btn ok" style="flex:1" data-act="approve:${r.id}">${icon("check")} Settle</button><button class="btn danger" style="flex:1" data-act="return:${r.id}">${icon("x")} Return</button></div>` : ""}`
      };
    }
  };

  /* ---------- v2.4.4 — Job Schedule & shifts (delegated to SCHEDVIEWS) ---------- */
  web["sched-cal"] = (param) => SCHEDVIEWS.calendar({ persona: "hr", device: "web", canEdit: true, param });
  web["sched-control"] = () => SCHEDVIEWS.shiftControl({ persona: "hr", device: "web", canEdit: true });
  web["sched-staff"] = (param) => SCHEDVIEWS.staffDivision({ persona: "hr", device: "web", canEdit: true, param });
  web["sched-manage"] = (param) => SCHEDVIEWS.shiftManage({ persona: "hr", device: "web", canEdit: true, param });
  web["sched-swaps"] = () => SCHEDVIEWS.swaps({ persona: "hr", device: "web", canEdit: true });
  web["sched-backup"] = () => SCHEDVIEWS.backupRestore({ persona: "hr", device: "web" });
  web["sched-connector"] = () => SCHEDVIEWS.connector({ persona: "hr", device: "web" });

  /* ==SEAM:SCREENS:hr== insert HR web[...] builders here == */
  /* ---------- v2.4.5 T2 (A1·A3) — Accounting ---------- */
  web["cashbook"] = () => {
    const cb = LEDGER.cashbook(), roll = LEDGER.rollup();
    const rows = cb.slice().sort((a, b) => a.date < b.date ? 1 : -1).map(r => ({ cells: [
      idtag(r.id), `<span class="small">${esc(r.date)}</span>`,
      `<span class="badge ${r.kind === "revenue" ? "ok" : r.kind === "staff" ? "acc" : "plain"} plain">${esc(r.kind)}</span>`,
      esc(r.cat), `<span class="small muted">${esc(r.note)}</span>`, `<span class="num">${kip(r.amount)}</span>`
    ] }));
    return {
      title: "Cashbook", sub: "Every cash movement in one book. Staff cost posts here automatically when a payroll run closes (T3).",
      body: `
        <div class="grid cols-4">
          ${kpi("Revenue (MTD)", kip(roll.revenue), "in", { hero: 1 })}
          ${kpi("Expenses", kip(roll.expense), "out")}
          ${kpi("Staff cost", kip(roll.staff), "from payroll")}
          ${kpi("Result", kip(roll.result), (roll.margin * 100).toFixed(0) + "% margin")}
        </div>
        ${card("Quick cash entry", `<div id="cash-form" class="pv-form" style="max-width:560px"><div class="field"><label>Kind</label><select class="input" data-f="kind"><option value="expense">Expense</option><option value="revenue">Revenue</option></select></div><div class="field"><label>Category</label><input class="input" data-f="cat" placeholder="e.g. Utilities · Supplies · Sales"></div><div class="field"><label>Note</label><input class="input" data-f="note" placeholder="What was this for?"></div><div class="field"><label>Amount (₭)</label><input class="input" data-f="amount" inputmode="numeric" placeholder="e.g. 1500000"></div></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="cash-post">${icon("plus")} Post to cashbook</button></div>`, { icon: "plus" })}
        ${card("Cashbook", table([{ h: "ID" }, { h: "Date" }, { h: "Kind" }, { h: "Category" }, { h: "Note" }, { h: "Amount", r: 1 }], rows), { icon: "book" })}`
    };
  };
  web["costbenefit"] = () => {
    const roll = LEDGER.rollup(), top = LEDGER.topExpenses(5), ser = LEDGER.series();
    return {
      title: "Cost & benefit", sub: "Where the money goes, and the 6-month revenue-vs-staff-cost trend (derived from the cashbook + payroll).",
      body: `
        <div class="grid cols-3">
          ${kpi("Revenue", kip(roll.revenue), "this month", { hero: 1 })}
          ${kpi("Staff-cost ratio", Math.round(roll.staffRatio * 100) + "%", "of revenue")}
          ${kpi("Result", kip(roll.result), (roll.margin * 100).toFixed(0) + "% margin")}
        </div>
        ${card("Top expenses (₭M)", bars(top.map(e => ({ l: e.cat, v: Math.round(e.amount / 1e5) / 10 })), { values: 1 }), { icon: "chart" })}
        ${card("Revenue vs staff-cost — 6 months (derived)", lines2(ser.map(s => Math.round(s.revenue / 1e5) / 10), ser.map(s => Math.round(s.staffCost / 1e5) / 10), ser.map(s => s.month)) + legend([{ c: "var(--acc)", l: "Revenue (₭M)" }, { c: "var(--muted-2)", l: "Staff cost (₭M)" }]), { icon: "trend" })}`
    };
  };
  /* ---------- v2.4.5 T3 (B1·B2) — Compliance & close ---------- */
  web["leveling"] = () => {
    const lv = PAY.leveling(), r = PAY.run();
    const recov = (PAY.recoverable ? PAY.recoverable() : []), recovSum = recov.reduce((s, a) => s + (a.amount || 0), 0); // G5 — approved advances awaiting recovery
    return {
      title: "Compliance & close", sub: "Set the compliance level, then close the month's run. A closed run is immutable and posts staff cost to the cashbook.",
      body: `
        <div class="grid cols-3">
          ${kpi("Compliance", lv.code, lv.desc, { hero: 1 })}
          ${kpi("Current run", r.id, r.state)}
          ${kpi("Run cost", PAY.kip(r.cost), r.people + " people")}
        </div>
        ${card("Compliance leveling (L0–L3)", `<p class="small muted" style="margin-bottom:8px">L0 setup → L3 audit-ready. Closing a run needs L1 or higher.</p><div class="choice-row">${lv.all.map(([code], i) => `<button class="btn xs ${lv.level === i ? "soft" : ""}" data-act="pay:level:${i}">${code}</button>`).join("")}</div>`, { icon: "shield" })}
        ${card("Pay-run lifecycle", `${rowitem({ icon: r.state === "close" ? "check" : "banknote", title: `${r.id} · ${r.state}`, sub: r.state === "close" ? ("closed " + r.closedAt + " · " + PAY.kip(r.cost) + " posted to cashbook" + (r.recoveredCount ? " · recovered " + PAY.kip(r.recovered) + " from " + r.recoveredCount + " advance(s)" : "")) : ("draft · " + PAY.kip(r.cost) + " · " + r.people + " people"), side: r.state === "close" ? badge("approved") : `<button class="btn" data-act="pay:close">${icon("check")} Close run</button>` })}<p class="small muted" style="margin-top:8px">${r.state === "close" ? "Immutable — post an adjustment to change a closed run." : ("Draft is editable in Staff pay; closing locks it, posts to the ledger" + (recov.length ? " and recovers " + PAY.kip(recovSum) + " from " + recov.length + " approved advance(s)" : "") + ".")}</p>`, { icon: "banknote" })}`
    };
  };
  /* ---------- v2.4.5 T3 (B3·B4) — Advances (EWA) + earned-to-date ---------- */
  web["advances"] = () => {
    const comps = PAY.components().slice(0, 10), adv = PAY.advances();
    const sum = (arr) => arr.reduce((a, x) => a + (x.amount || 0), 0); // G5 — split outstanding vs recovered
    const outstanding = adv.filter(a => a.status !== "recovered"), recovered = adv.filter(a => a.status === "recovered");
    const rows = comps.map(c => { const etd = PAY.earnedToDate(c.emp), cap = PAY.advanceCap(c.emp);
      return { cells: [`<span class="strong">${esc(c.name)}</span>`, `<span class="badge acc plain">${esc(c.div || "—")}</span>`, `<span class="num">${PAY.kip(etd.net)}</span> <span class="small muted">${etd.pct}%</span>`, `<span class="num">${PAY.kip(cap)}</span>`, `<button class="btn xs" data-act="pay:advance:${c.emp}">${icon("banknote")} Advance</button>`] };
    });
    return {
      title: "Advances (EWA)", sub: "Earned-wage access — staff draw up to 50% of their earned-to-date; recovered on the next run. Each request lands in the approvals inbox.",
      body: `
        <div class="grid cols-3">
          ${kpi("Advances drawn", String(adv.length), "this cycle", { hero: 1 })}
          ${kpi("Outstanding", PAY.kip(sum(outstanding)), recovered.length ? "to recover next run" : "to recover · 50% cap")}
          ${kpi("Recovered", PAY.kip(sum(recovered)), recovered.length ? "netted on close" : "none yet")}
        </div>
        ${card("Earned-to-date · advance cap", table([{ h: "Staff" }, { h: "Division" }, { h: "Earned-to-date" }, { h: "Cap (50%)" }, { h: "", r: 1 }], rows), { icon: "banknote" })}
        ${adv.length ? card("Advances drawn", rowlist(adv.map(a => rowitem({ icon: "banknote", title: `${idtag(a.id)} ${esc(a.name)} — ${PAY.kip(a.amount)}`, sub: `cap ${PAY.kip(a.cap)} · ${a.date}`, side: badge(a.status) }))), { icon: "history" }) : ""}`
    };
  };

  /* ---------- v2.4.5 T4 (E1) — People profile (SF-style) ---------- */
  web["profile-view"] = () => {
    const e = (DB.list("db_people", "employees") || [])[0] || { id: "EMP-0214", name: "Staff" };
    const sec = (s) => card(s.label, table([{ h: "Field" }, { h: "Value", r: 1 }], s.fields.map(([k, lbl]) => ({ cells: [`<span class="small muted">${esc(lbl)}</span>`, `<span class="strong">${esc(PROFILE.value(e, k, s.sealed))}</span>`] }))) + (s.sealed ? `<p class="small muted" style="margin-top:6px">Sealed fields (DOB · National ID) are masked.</p>` : ""), { icon: s.icon });
    return {
      title: `Profile — ${esc(e.name)}`, sub: "SuccessFactors-style profile — General · Personal · Job. Sealed fields masked. Staff see the same profile read-only under “Me”.",
      actions: `<button class="btn" data-go="hr/web/profile-edit/${e.id}">${icon("edit")} Edit profile</button>`,
      body: `<div class="grid cols-3">${PROFILE.sections().map(sec).join("")}</div>`
    };
  };
  /* ---------- v2.4.5 G3 — HR Profile EDIT form (writes db_people via the People cell) ---------- */
  web["profile-edit"] = (param) => {
    const list = DB.list("db_people", "employees") || [];
    const e = (param ? list.find(x => x.id === param) : null) || list[0] || { id: "EMP-0214", name: "Staff" };
    const f = (k, lbl, ph) => `<div class="field"><label>${esc(lbl)}</label><input class="input" data-f="${k}" value="${esc(PROFILE.value(e, k) === "—" ? "" : PROFILE.value(e, k))}" placeholder="${esc(ph || "")}"></div>`;
    return {
      title: `Edit profile — ${esc(e.name)}`, sub: "HR edits the People record (db_people) — General + Job fields. Sealed identity fields (DOB · National ID) stay read-only and masked.",
      crumbs: [{ label: "Profile", go: "hr/web/profile-view" }, { label: e.id }],
      body: `
        <div class="grid cols-3">
          <div class="span-2">${card("General & Job", `<div id="pe-form" data-emp="${e.id}" class="grid cols-2" style="gap:12px">
            ${f("name", "Full name")}
            ${f("pos", "Position")}
            ${f("div", "Division")}
            ${f("team", "Team")}
            ${f("phone", "Phone", "+856 20 …")}
            ${f("pemail", "Personal email", "name@mail.la")}
            ${f("manager", "Reports to")}
            ${f("start", "Start date")}
          </div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn ghost" data-go="hr/web/profile-view">${icon("x")} Cancel</button><button class="btn" data-act="profile-save">${icon("check")} Save changes</button></div>`, { icon: "edit" })}</div>
          <div>${card("Sealed — read-only", table([{ h: "Field" }, { h: "Value", r: 1 }], [["dob", "Date of birth"], ["nid", "National ID"]].map(([k, lbl]) => ({ cells: [`<span class="small muted">${esc(lbl)}</span>`, `<span class="strong">${esc(PROFILE.value(e, k, true))}</span>`] }))) + `<p class="small muted" style="margin-top:6px">Identity fields are masked and change only through the secured identity flow.</p>`, { icon: "shield" })}</div>
        </div>`
    };
  };
  /* ---------- v2.4.5 T5 (F1) — Holidays ---------- */
  web["holidays"] = () => {
    const hol = LEAVECAL.holidays();
    const rows = hol.map(h => ({ cells: [`<span class="small">${esc(h.date)}</span>`, esc(h.name), `<span class="badge ${h.kind === "public" ? "acc" : "plain"} plain">${esc(h.kind)}</span>`] }));
    return {
      title: "Holidays", sub: "Lao public holidays + your company days. Holidays block the column on the team calendar and the staff time-off picker.",
      body: `
        <div class="grid cols-3">
          ${kpi("Holidays", String(hol.length), "this year", { hero: 1 })}
          ${kpi("Public", String(hol.filter(h => h.kind === "public").length), "statutory")}
          ${kpi("Company", String(hol.filter(h => h.kind === "company").length), "your days")}
        </div>
        ${card("Calendar holidays", table([{ h: "Date" }, { h: "Name" }, { h: "Kind", r: 1 }], rows), { icon: "calendar" })}
        ${card("Add a company holiday", `<div id="hol-form" class="pv-form" style="max-width:480px"><div class="field"><label>Date</label><input class="input" data-f="date" type="date" value="2026-08-15"></div><div class="field"><label>Name</label><input class="input" data-f="name" placeholder="e.g. Staff retreat"></div></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="hol-add">${icon("plus")} Add holiday</button></div>`, { icon: "plus" })}`
    };
  };

  mobile["sched-cal"] = (param) => SCHEDVIEWS.calendar({ persona: "hr", device: "mobile", canEdit: true, param, back: "hr/mobile/me" });
  mobile["sched-swaps"] = () => SCHEDVIEWS.swaps({ persona: "hr", device: "mobile", canEdit: true, back: "hr/mobile/me" });

  PERSONAS.hr = {
    key: "hr", label: t("personas.hr"), icon: "pulse",
    appName: "Adeptio Ops", roleLine: "HR Operations Console",
    domain: "admin.adeptio.hr/pulse",
    nav: [
      { group: "Work", items: [
        { id: "pulse", icon: "pulse", label: t("hr.pulse") },
        { id: "approvals", icon: "inbox", label: t("hr.approvals"), lock: "l2", count: () => APPROVALS.pending() },
        { id: "comms", icon: "megaphone", label: t("hr.comms") },
        { id: "access", icon: "key", label: "Access & invites", count: () => AUTH.stats().invited || "" },
        { id: "import", icon: "files", label: "Import accounts" },
        { id: "outbox", icon: "mail", label: "Demo outbox", count: () => AUTH.mails().length }
      ]},
      { group: "People & time", items: [
        { id: "people", icon: "users", label: t("hr.people") },
        { id: "profile-view", icon: "user", label: "Profile" },
        { id: "sched-staff", icon: "building", label: "Staff & Division" },
        { id: "time", icon: "clock", label: t("hr.time") },
        { id: "clocking", icon: "grid", label: "Clock-in / out", lock: "biometrics", count: () => DEVICES.groups().length },
        { id: "leave", icon: "sun", label: t("hr.leave") },
        { id: "holidays", icon: "calendar", label: "Holidays" },
        { id: "docs", icon: "folder", label: t("hr.docs"), lock: "vault" }
      ]},
      { group: "Payroll", items: [
        { id: "pay-dash", icon: "chart", label: "Dashboard" },
        { id: "payroll", icon: "banknote", label: "Pay runs" },
        { id: "pay-staff", icon: "users", label: "Staff pay" },
        { id: "pay-slips", icon: "receipt", label: "Pay slips" },
        { id: "pay-ot", icon: "clock", label: "Overtime", count: () => DATA.requests.filter(r => r.type === "Overtime" && r.status === "pending").length || "" },
        { id: "pay-tax", icon: "shield", label: "Tax & NSSF" },
        { id: "advances", icon: "banknote", label: "Advances (EWA)" },
        { id: "leveling", icon: "shield", label: "Compliance & close" }
      ]},
      /* ==SEAM:NAV:hr== insert HR nav groups/items here == */
      { group: "Accounting", items: [
        { id: "cashbook", icon: "book", label: "Cashbook" },
        { id: "costbenefit", icon: "chart", label: "Cost & benefit" }
      ]},
      { group: "Job Schedule & shifts", items: [
        { id: "sched-cal", icon: "calendar", label: "Calendar" },
        { id: "sched-control", icon: "clock", label: "Shift Control" },
        { id: "sched-manage", icon: "calcheck", label: "Shift Management" },
        { id: "sched-swaps", icon: "swap", label: "Shift swaps", count: () => { try { return DB.list("db_workflow", "requests").filter(r => r.type === "Swap" && r.status === "pending").length || ""; } catch (e) { return ""; } } },
        { id: "sched-backup", icon: "box", label: "Backup/Restore" },
        { id: "sched-connector", icon: "plug", label: "Plug-in Connector" }
      ]},
      { group: "Insight", items: [{ id: "reports", icon: "chart", label: t("hr.reports") }] },
      { group: "Data", items: [{ id: "data", icon: "layers", label: "Data manager" }] },
      { group: "Account", items: [{ id: "security", icon: "shield", label: "My security" }] }
    ],
    parent: { approval: "approvals", person: "people", "person-new": "people", "profile-edit": "profile-view", "payroll-run": "payroll", "pay-otq": "pay-ot", "report-run": "reports", "report-files": "reports", group: "clocking" },
    tabs: [
      { id: "queue", icon: "inbox", label: "Queue", lock: "l2" },
      { id: "alerts", icon: "bell", label: "Alerts" },
      { id: "me", icon: "user", label: "Me" }
    ],
    tabParent: { approval: "queue", "sched-cal": "me", "sched-swaps": "me" },
    web, mobile
  };
})();
