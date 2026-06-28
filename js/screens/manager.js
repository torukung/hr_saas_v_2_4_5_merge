/* ============================================================
   ADEPTIO · MANAGER persona (MSS) — sage
   Web: Overview · Approvals(→detail) · Team(→member) · Schedule · Reports
   Mobile: Home · Approvals · Team · Alerts (+ drills)
   Approve / Return actually mutate the shared ledger.
   ============================================================ */
(function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, table, steps, empty, avatar, sparkline, bars, heatcal } = UI;

  const present = () => DATA.team.filter(m => m.state === "present").length;

  // OT remaining-quota context for the division behind an Overtime request
  function otContext(r) {
    if (r.type !== "Overtime" || typeof OT === "undefined") return "";
    const div = r.div || ((DATA.employees.find(e => e.id === r.emp || e.name === r.who) || {}).div);
    if (!div) return "";
    const q = OT.quotaFor(div, "monthly");
    return ` <span class="badge ${OT.tone(q)}">${div} · ${OT.remaining(q)} h left</span>`;
  }
  // overview / mobile-home L1 quick-queue card — the Approvals SCREEN itself now renders the
  // unified inbox (APPROVALSVIEW.inboxScreen), so the per-type tab bar was retired in v2.4.5 T1.
  function queue(device, compact) {
    const q = DATA.pendingL1();
    if (!q.length) return empty("check", "Queue clear", "Nothing in this queue right now.");
    return q.map(r => `
      <div class="qrow">
        <div class="qmain" data-go="manager/${device}/approval/${r.id}" role="button" tabindex="0">
          <div class="qt">${idtag(r.id)} ${UI.esc(r.who.split(" ")[0])} · ${UI.esc(r.detail)} <span class="sla">${r.sla}</span></div>
          <div class="qs">${r.dates} · submitted ${r.submitted}${otContext(r)}</div>
        </div>
        <div class="qact">
          <button class="btn ok sm" data-act="approve:${r.id}" aria-label="Approve ${r.id}">${icon("check")}${compact ? "" : " " + t("common.approve")}</button>
          <button class="btn danger sm" data-act="return:${r.id}" aria-label="Return ${r.id}">${icon("x")}${compact ? "" : " " + t("common.return")}</button>
        </div>
      </div>`).join("");
  }

  // v2.4.2 — the clock method a team member inherits from their capture group
  const memberMethod = (id) => (typeof DEVICES !== "undefined" && DATA.has("biometrics")) ? DEVICES.methodOf(id) : null;
  const methodShort = (md) => md ? md.label.replace(/ \(.*\)/, "") : "";

  function teamBoard(device) {
    return rowlist(DATA.team.map(m => {
      const md = memberMethod(m.id);
      return rowitem({
        avatar: m.name,
        title: m.name,
        sub: `${m.pos} · in ${m.in}${md ? " · " + methodShort(md) : ""}`,
        side: badge(m.state),
        go: `manager/${device}/member/${m.id}`
      });
    }));
  }

  // v2.4.2 — device health + the team's clock methodology, for the overview
  function captureCard() {
    if (typeof DEVICES === "undefined" || !DATA.has("biometrics")) return "";
    const down = DEVICES.devices().filter(d => d.status === "offline" || d.status === "degraded");
    const g = DEVICES.groupOf((DATA.team[0] || {}).id);
    const rows = [];
    if (down.length) rows.push(rowitem({ icon: "alert", title: `${down.length} device${down.length > 1 ? "s" : ""} need attention`, sub: down.map(d => `${d.vendor} · ${d.zone}`).join(", "), side: `<button class="btn xs soft" data-go="sysadmin/web/devmonitor">Monitor</button>` }));
    else rows.push(rowitem({ icon: "check", title: "All terminals online", sub: "punches flowing to db_time", side: badge("online") }));
    if (g) rows.push(rowitem({ icon: DEVICES.methodById(g.primary).icon, title: "Team clocks via " + DEVICES.methodLabel(g.primary), sub: (g.devices && g.devices.length) ? g.devices.map(d => { const dv = DEVICES.deviceById(d); return dv ? dv.zone : d; }).join(" · ") : "mobile / web", neutral: 1 }));
    return card("Capture & devices", rowlist(rows), { icon: "wifi", link: "sysadmin/web/devmonitor", linkLabel: "Monitor" });
  }

  /* ---------- WEB ---------- */
  const web = {
    overview() {
      const pend = DATA.pendingL1().length;
      return {
        title: "Team overview", sub: "Production Line A · Wednesday, Jun 10 — approvals first, then the day.",
        actions: `<button class="btn soft" data-act="comms-nudge">${icon("megaphone")} Message team</button>
                  <button class="btn" data-go="manager/web/approvals">${icon("inbox")} Open queue${pend ? ` · ${pend}` : ""}</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Present", `${present()} / ${DATA.team.length}`, `<span class="up">▲</span> on shift now`, { hero: 1 })}
          ${kpi("Pending L1", String(pend), "Oldest · LV-0481")}
          ${kpi("On leave", "1", "Somphone · annual")}
          ${kpi("OT this week", "12.5 h", "Cap 40h · healthy")}
        </div>
        <div class="grid cols-3" style="margin-top:16px">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Approvals waiting · L1", queue("web"), { icon: "inbox", link: "manager/web/approvals" })}
            ${card("Team today", teamBoard("web"), { icon: "users", link: "manager/web/team" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Alerts", rowlist([
          rowitem({ icon: "alert", title: "Keo — no-show today", sub: "2nd this month · policy ladder step 1", side: `<button class="btn xs soft" data-act="wf-coaching">Coach</button>` }),
          rowitem({ icon: "clock", title: "Noy — late 09:12", sub: "+42 min · auto-flagged", side: badge("late") }),
          rowitem({ icon: "user", title: "Probation review due", sub: "Chanthala · by Jun 15", side: badge("pending") })
        ]), { icon: "bell" })}
            ${captureCard()}
            ${card("Attendance — 30 days", sparkline(DATA.attendanceTrend) + `<div class="small muted" style="margin-top:8px">Team average <b class="num" style="color:var(--ink)">95.1%</b> · trending steady</div>`, { icon: "trend" })}
            ${card("My submissions to HR", rowlist([
          rowitem({ icon: "send", title: "Team OT batch · May", sub: "OT-B-0512 · sent to payroll", side: badge("approved") })
        ]), { icon: "send" })}
          </div>
        </div>`
      };
    },

    approvals() {
      // v2.4.5 T1 — the standalone unified inbox is now the driving surface (replaces the per-type
      // tab queue). Scoped to the manager's L1 authority so the screen total == the nav badge.
      const pend = DATA.pendingL1();
      const inbox = APPROVALSVIEW.inboxScreen({ persona: "manager", device: "web", canEdit: true, scopeIds: pend.map(r => r.id) });
      const decided = DATA.requests.filter(r => r.status !== "pending");
      return {
        title: inbox.title, sub: inbox.sub,
        body: `
        <div class="grid cols-4">
          ${kpi("Waiting", String(pend.length), "in your queue", { hero: 1 })}
          ${kpi("Avg. response", "3.2 h", "last 30 days")}
          ${kpi("Returned", "1", "this week")}
          ${kpi("SLA breaches", "0", "this month")}
        </div>
        ${inbox.body}
        ${card("Recently decided", decided.length ? rowlist(decided.slice(0, 6).map(r => rowitem({
          icon: "check", neutral: r.status !== "approved",
          title: `${r.id} · ${r.who.split(" ")[0]} · ${r.detail}`,
          sub: r.stage, side: badge(r.status), go: `manager/web/approval/${r.id}`
        }))) : `<p class="small muted">Nothing decided yet.</p>`, { icon: "history" })}`
      };
    },

    approval(id) {
      const r = DATA.requests.find(x => x.id === id) || DATA.requests[0];
      const conflict = r.type === "Leave";
      return {
        title: `${r.type} — ${r.who.split(" ")[0]}`, sub: `Decide with context: balance, schedule and team conflicts inline.`,
        crumbs: [{ label: "Approvals", go: "manager/web/approvals" }, { label: r.id }],
        actions: `${idtag(r.id)} ${badge(r.status)}`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Request", table([{ h: "Field" }, { h: "Value" }], [
          { cells: ["Who", `${r.who} ${idtag("EMP")}`] },
          { cells: ["What", r.detail] }, { cells: ["When", r.dates] },
          { cells: ["Note", r.note] }, { cells: ["Submitted", r.submitted] },
          { cells: ["SLA", `<span class="sla">${r.sla}</span>`] }
        ]), { icon: "file" })}
            ${conflict ? card("Team conflict check — Jun 18 & 19", `
              <div class="small muted" style="margin-bottom:10px">1 overlap on the same days — still above minimum crew of 6.</div>
              ${rowlist([
          rowitem({ avatar: "Somphone Inthavong", title: "Somphone — on leave Jun 16–19", sub: "Annual · approved LV-0468", side: badge("onleave") }),
          rowitem({ avatar: "Bounmy Latsavong", title: "Crew available Jun 18–19", sub: "7 of 8 present after this approval", side: badge("ok") })
        ])}`, { icon: "calendar" }) : card("Schedule check", `<p class="small muted">Within OT cap (40h/week) and roster window. Payroll applies rate & cap rules at L2 automatically.</p>`, { icon: "check" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${r.status === "pending" ? card("Decide", `
              <div style="display:flex;flex-direction:column;gap:8px">
                <button class="btn ok" data-act="approve:${r.id}">${icon("check")} ${t("common.approve")}${r.type === "Claim" ? " → HR / Finance" : ""}</button>
                <button class="btn danger" data-act="return:${r.id}">${icon("x")} ${t("common.return")} with note</button>
                ${DATA.has("delegation") ? `<button class="btn ghost" data-act="wf-delegate">${icon("users")} Delegate</button>` : UI.lockBtn("Delegate", DATA.unlockLabel("delegation"), "ghost")}
              </div>`, { icon: "settings" }) : card("Decided", `<p class="small muted">This item is ${r.status} — see the audit ledger for the trail.</p>`, { icon: "check" })}
            ${card("Requester snapshot", rowlist([
          rowitem({ icon: "check", title: "Attendance 98%", sub: "90-day", side: "" }),
          rowitem({ icon: "sun", title: "Leave balance 12 d", sub: "After request: 10 d", side: "" }),
          rowitem({ icon: "history", title: "Last request", sub: "EX-0210 · pending L2", side: "" })
        ]), { icon: "user" })}
          </div>
        </div>`
      };
    },

    team() {
      return {
        title: "Team — Production Line A", sub: "8 reports · live state from the attendance ledger.",
        actions: `<button class="btn soft" data-act="export:teamreport">${icon("download")} Team report</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Present", `${present()}/8`, "on shift", { hero: 1 })}
          ${kpi("Avg attendance", "94.8%", "90-day")}
          ${kpi("Leave liability", "74 d", "accrued team total")}
          ${kpi("OT MTD", "58 h", "vs 64 budget")}
        </div>
        ${(() => {
          const bio = DATA.has("biometrics");
          const cols = [{ h: "Member" }, { h: "Position" }, { h: "Today" }].concat(bio ? [{ h: "Clocks via" }] : []).concat([{ h: "Attend.", r: 1 }, { h: "OT MTD", r: 1 }, { h: "Leave", r: 1 }]);
          return card("Roster", table(cols, DATA.team.map(m => {
            const md = memberMethod(m.id);
            const cells = [
              `<div style="display:flex;align-items:center;gap:10px">${avatar(m.name)}<div><div class="strong">${m.name}</div><div class="small muted">${m.id}</div></div></div>`,
              m.pos, badge(m.state)
            ];
            if (bio) cells.push(md ? `<span class="pill">${icon(md.icon)} ${methodShort(md)}</span>` : `<span class="small muted">—</span>`);
            cells.push(`<span class="num">${m.attend}%</span>`, `<span class="num">${m.ot} h</span>`, `<span class="num">${m.leaveBal} d</span>`);
            return { go: `manager/web/member/${m.id}`, cells };
          })), { icon: "users" });
        })()}`
      };
    },

    member(id) {
      const m = DATA.team.find(x => x.id === id) || DATA.team[0];
      return {
        title: m.name, sub: `${m.pos} · ${m.id} · your direct report — scoped view, not the HR master record.`,
        crumbs: [{ label: "Team", go: "manager/web/team" }, { label: m.name.split(" ")[0] }],
        actions: `${badge(m.state)}`,
        body: `
        <div class="grid cols-3">
          ${kpi("Attendance", m.attend + "%", "90-day", { hero: 1 })}
          ${kpi("OT MTD", m.ot + " h", "within cap")}
          ${kpi("Leave balance", m.leaveBal + " d", "annual")}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${card("June attendance", heatcal({ until: 10, levels: m.state === "absent" ? { 10: "bad", 3: "bad" } : m.state === "late" ? { 10: "l1" } : {} }), { icon: "calendar" })}
          ${card("Recent items", rowlist(DATA.requests.filter(r => r.who === m.name).map(r => rowitem({
          icon: "inbox", title: `${r.id} · ${r.detail}`, sub: r.stage, side: badge(r.status), go: `manager/web/approval/${r.id}`
        })).concat(rowitem({ icon: "history", title: "Schedule — Shift A", sub: "Mon–Fri 08:30–17:30", side: `<button class="btn xs ghost" data-go="manager/web/schedule">Edit</button>` }))), { icon: "history" })}
        </div>`
      };
    },

    schedule() {
      const days = ["Mon 8", "Tue 9", "Wed 10", "Thu 11", "Fri 12", "Sat 13", "Sun 14"];
      const shift = (label, tone) => `<td><span class="badge ${tone}">${label}</span></td>`;
      return {
        title: "Schedule — week 24", sub: "Shift templates and rotations live in the Time cell; edits publish to staff mobile instantly.",
        actions: `<button class="btn ghost soon" title="Build-phase feature — not wired in this UI preview" data-act="toast:Duplicate week is a build-phase scheduling feature — not wired in this preview">${icon("files")} Duplicate week</button><button class="btn" data-act="comms-publish">${icon("send")} Publish</button>`,
        body: card("", `<div class="tablewrap"><table class="tbl">
          <thead><tr><th>Member</th>${days.map(d => `<th>${d}</th>`).join("")}</tr></thead>
          <tbody>${DATA.team.slice(0, 6).map((m, i) => `<tr>
            <td><div class="strong" style="white-space:nowrap">${m.name.split(" ")[0]}</div></td>
            ${days.map((d, j) => j === 5 && i % 3 === 0 ? shift("OT 4h", "warn") : j >= 5 ? `<td><span class="small muted">—</span></td>` : (m.state === "onleave" && j < 2) ? shift("Leave", "") : shift("A · 08:30", "acc")).join("")}
          </tr>`).join("")}</tbody></table></div>
          <p class="small muted" style="margin-top:12px">${icon("sparkle", "")} Drag-to-assign and rotation templates arrive with the real Time & Attendance cell — this frame fixes the layout contract.</p>`, { icon: "calendar" })
      };
    },

    /* ---------- v2.3.2.db — team slice of the split stores ---------- */
    teamdata() {
      return {
        title: "Team data", sub: "Your team's rows in db_people and db_workflow — scoped by RBAC, addable & deletable so the live DB is easy to grasp.",
        actions: `<button class="btn ghost" data-act="export:teamslice">${icon("download")} Export team slice</button>`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Roster — db_people.employees (team Line A)", DBV.tableEditor("db_people", "employees", { filter: e => e.team === "Line A" }) + `<span class="hint">Tip: set <b>team</b> to “Line A” when adding so the new member appears on your roster, attendance board and schedule instantly — one write, many lenses.</span>`, { icon: "users" })}
            ${card("Team requests — db_workflow.requests", DBV.tableEditor("db_workflow", "requests", { canAdd: false, canDel: false }) + `<p class="small muted" style="margin-top:8px">Decisions happen in the Approvals queue (the cell API) — the table here is the store truth those buttons mutate.</p>`, { icon: "inbox" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Assign existing staff to Line A", `
              <div class="field"><label>Staff member</label>
                <select class="input" id="mg-assign">${DATA.employees.filter(e => e.team !== "Line A").map(e => `<option value="${e.id}">${e.name} · ${e.pos} (${e.div})</option>`).join("")}</select>
              </div>
              <button class="btn soft" style="width:100%" data-act="mgr-assign">${icon("users")} Assign to my team</button>
              <p class="small muted" style="margin-top:10px">Sets <b>team → Line A</b> on the db_people row — roster, attendance board and schedule pick it up on the same write. New hires are created by HR (People &amp; Org → New hire); managers assign, never create.</p>`, { icon: "plus" })}
            ${card("Stores you touch", DBV.storeGrid(null, ["db_people", "db_time", "db_leave", "db_workflow"]), { icon: "layers" })}
            ${card("One writer per store", `<p class="small muted">Approving ${idtag("LV-0481")} writes <b>db_workflow</b> only; the fact lands on <b>db_audit</b>; the projector updates <b>dw_reports</b>. A bad write in leave can never reach payroll — corruption stays inside one file.</p>`, { icon: "shield" })}
          </div>
        </div>`
      };
    },

    reports() {
      return {
        title: "Team reports", sub: "Each section keeps its last 3 generated runs with query detail — click a run to view (read-only) or use its download link. Older runs move to file storage.",
        actions: `<button class="btn ghost" data-go="manager/web/report-files">${icon("folder")} File storage</button>`,
        body: REP.library("manager", "manager/web")
      };
    },

    /* ---------- v2.3.2.db — run viewer (view-only snapshot + download link) ---------- */
    "report-run"(param) {
      const p = REP.runPage(param, "manager", "manager/web");
      return {
        title: p.title, sub: p.sub,
        crumbs: [{ label: "Reports", go: "manager/web/reports" }, { label: p.run ? p.run.id : "run" }],
        actions: p.run ? `${idtag(p.run.id)} ${p.run.archived ? `<span class="badge plain">archived</span>` : `<span class="badge ok plain">recent</span>`}` : "",
        body: p.body
      };
    },

    /* ---------- v2.3.2.db — file storage (archive, one folder per report) ---------- */
    "report-files"() {
      const f = REP.filesPage("manager", "manager/web");
      return {
        title: "Report file storage", sub: "Runs older than the last 3 are hidden here — one folder per report, view-only with download links. Retention expires files beyond 12 per report.",
        crumbs: [{ label: "Reports", go: "manager/web/reports" }, { label: "File storage" }],
        body: f.kpis + f.folders
      };
    }
  };

  /* ---------- MOBILE ---------- */
  const mobile = {
    home() {
      const pend = DATA.pendingL1().length;
      return {
        title: "Team", body: `
        <div class="grid cols-2">
          ${kpi("Present", `${present()}/8`, "now", { hero: 1 })}
          ${kpi("Waiting", String(pend), "L1 queue")}
        </div>
        ${card("Approve now", queue("mobile", true), { icon: "inbox" })}
        ${card("Alerts", rowlist([
          rowitem({ icon: "alert", title: "Keo — no-show", sub: "Coach on policy ladder", side: badge("absent") }),
          rowitem({ icon: "clock", title: "Noy — late 09:12", sub: "+42 min", side: badge("late") })
        ]), { icon: "bell" })}`
      };
    },
    approvals() {
      const pend = DATA.pendingL1();
      const inbox = APPROVALSVIEW.inboxScreen({ persona: "manager", device: "mobile", canEdit: true, scopeIds: pend.map(r => r.id) });
      const decided = DATA.requests.filter(r => r.status !== "pending").slice(0, 3);
      return { title: inbox.title, body: inbox.body + card("Decided", rowlist(decided.map(r => rowitem({ icon: "check", neutral: 1, title: r.id + " · " + r.detail, sub: r.stage, side: badge(r.status) }))), { icon: "history" }) };
    },
    team() {
      return { title: "Team", body: card("Production Line A", teamBoard("mobile"), { icon: "users" }) };
    },
    alerts() {
      return {
        title: "Alerts", body: card("Today", rowlist([
          rowitem({ icon: "alert", title: "No-show — Keo", sub: "Auto-flagged 09:00 · PV ladder", side: badge("absent") }),
          rowitem({ icon: "clock", title: "Late — Noy 09:12", sub: "Auto-flagged · +42 min", side: badge("late") }),
          rowitem({ icon: "user", title: "Probation review — Chanthala", sub: "Due Jun 15", side: badge("pending") }),
          rowitem({ icon: "inbox", title: "SLA reminder — LV-0481", sub: "14h left on your queue", side: badge("pending"), go: "manager/mobile/approval/LV-0481" })
        ]), { icon: "bell" })
      };
    },
    approval(id) {
      const r = DATA.requests.find(x => x.id === id) || DATA.requests[0];
      return {
        title: r.id, back: "manager/mobile/approvals", body: `
        ${card("", `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">${idtag(r.id)}${badge(r.status)}</div>
          <h3 style="font-size:16px;margin:10px 0 2px">${r.who.split(" ")[0]} · ${r.detail}</h3>
          <div class="small muted">${r.dates} · ${r.note}</div>`)}
        ${r.status === "pending" ? `<div style="display:flex;gap:9px">
          <button class="btn ok" style="flex:1" data-act="approve:${r.id}">${icon("check")} Approve</button>
          <button class="btn danger" style="flex:1" data-act="return:${r.id}">${icon("x")} Return</button></div>` : ""}
        ${card("Snapshot", rowlist([
          rowitem({ icon: "check", title: "Attendance 98%", sub: "90-day" }),
          rowitem({ icon: "sun", title: "Balance after: 10 d", sub: "Annual leave" })
        ]), { icon: "user" })}`
      };
    },
    member(id) {
      const m = DATA.team.find(x => x.id === id) || DATA.team[0];
      return {
        title: m.name.split(" ")[0], back: "manager/mobile/team", body: `
        ${card("", `<div style="display:flex;align-items:center;gap:12px">${avatar(m.name, 1)}<div><div style="font-weight:800">${m.name}</div><div class="small muted">${m.pos} · ${m.id}</div></div></div>`)}
        <div class="grid cols-2">${kpi("Attend.", m.attend + "%", "90-day")}${kpi("OT", m.ot + " h", "MTD")}</div>
        ${card("June", heatcal({ until: 10 }), { icon: "calendar" })}`
      };
    }
  };

  /* ---------- v2.4.0.db.auth — My security ---------- */
  web.security = () => ({
    title: "My security", sub: "Your account behind the portal — manager + staff scopes ride on one sign-in.",
    body: AUTHV.mySecurity("manager")
  });

  /* ---------- v2.4.4 — Job Schedule & shifts (delegated to SCHEDVIEWS) ----------
     Manager default scope = their team (G-PRDA). canEdit for calendar/assign;
     Shift Control is NOT in the manager nav — managers can't create shifts, so a
     direct hit renders read-only (canEdit:false). */
  const MGR_SCOPE = "G-PRDA";
  web["sched-cal"] = (param) => SCHEDVIEWS.calendar({ persona: "manager", device: "web", canEdit: true, scope: MGR_SCOPE, param });
  web["sched-control"] = () => SCHEDVIEWS.shiftControl({ persona: "manager", device: "web", canEdit: false });
  web["sched-staff"] = (param) => SCHEDVIEWS.staffDivision({ persona: "manager", device: "web", canEdit: true, param });
  web["sched-manage"] = (param) => SCHEDVIEWS.shiftManage({ persona: "manager", device: "web", canEdit: true, scope: MGR_SCOPE, param });
  web["sched-swaps"] = () => SCHEDVIEWS.swaps({ persona: "manager", device: "web", canEdit: true });
  mobile["sched-cal"] = (param) => SCHEDVIEWS.calendar({ persona: "manager", device: "mobile", canEdit: true, scope: MGR_SCOPE, param, back: "manager/mobile/team" });
  mobile["sched-swaps"] = () => SCHEDVIEWS.swaps({ persona: "manager", device: "mobile", canEdit: true, back: "manager/mobile/team" });

  PERSONAS.manager = {
    key: "manager", label: t("personas.manager"), icon: "users",
    appName: "Adeptio Team", roleLine: "Manager Self-Service",
    domain: "app.adeptio.hr/team",
    nav: [
      { group: "Work", items: [
        { id: "overview", icon: "home", label: t("mgr.overview") },
        { id: "approvals", icon: "inbox", label: t("mgr.approvals"), count: () => DATA.pendingL1().length },
        { id: "team", icon: "users", label: t("mgr.team") }
      ]},
      { group: "Plan", items: [
        { id: "schedule", icon: "calendar", label: t("mgr.schedule") },
        { id: "reports", icon: "chart", label: t("mgr.reports") },
        { id: "teamdata", icon: "layers", label: "Team data" }
      ]},
      { group: "Job Schedule & shifts", items: [
        { id: "sched-cal", icon: "calendar", label: "Calendar" },
        { id: "sched-staff", icon: "users", label: "Staff & Division" },
        { id: "sched-manage", icon: "calcheck", label: "Shift Management" },
        { id: "sched-swaps", icon: "swap", label: "Shift swaps", count: () => { try { return DB.list("db_workflow", "requests").filter(r => r.type === "Swap" && r.status === "pending").length || ""; } catch (e) { return ""; } } }
      ]},
      { group: "Account", items: [{ id: "security", icon: "shield", label: "My security" }] }
    ],
    parent: { approval: "approvals", member: "team", "report-run": "reports", "report-files": "reports", "sched-control": "sched-cal" },
    tabs: [
      { id: "home", icon: "home", label: "Home" },
      { id: "approvals", icon: "inbox", label: "Approvals" },
      { id: "team", icon: "users", label: "Team" },
      { id: "alerts", icon: "bell", label: "Alerts" }
    ],
    tabParent: { approval: "approvals", member: "team", "sched-cal": "team", "sched-swaps": "team" },
    web, mobile
  };
})();
