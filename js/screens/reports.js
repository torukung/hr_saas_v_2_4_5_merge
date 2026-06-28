/* ============================================================
   ADEPTIO · v2.3.2.db — report engine (runs + file storage)
   "Generate" queries the live stores and SAVES a run into
   dw_reports.generated (the Projector is its one writer).
   · Each report section shows its LAST 3 runs with query detail
   · A run is click-and-VIEW-ONLY, with a download file link
   · Runs older than the last 3 auto-archive into File storage —
     one folder per report (reports/{tenant}/{report}/)
   · Every persona has a report section (staff · manager · hr ·
     ceo · sysadmin), each scoped to its own lens.
   ============================================================ */
window.REP = (function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, empty, kip } = UI;
  const tbl = UI.table;

  /* ---------- live lenses ---------- */
  const emp = () => DB.list("db_people", "employees");
  const team = () => emp().filter(e => e.team === "Line A");
  const reqs = () => DB.list("db_workflow", "requests");
  const pct = (a, b) => b ? (Math.round(a / b * 1000) / 10).toFixed(1) + "%" : "—";
  const sum = (arr, f) => arr.reduce((n, x) => n + (Number(f ? x[f] : x) || 0), 0);
  const OT_RATE = 45000;

  /* ---------- report catalog — every persona has a section ---------- */
  const R = {

    /* ===== STAFF — scoped to the acting user ===== */
    "my-attendance": {
      persona: "staff", icon: "clock", title: "My attendance", formats: "PDF · CSV",
      desc: "Your punches, score and exceptions for the period — own slice only.",
      query() { return `SELECT * FROM time_punches WHERE emp='${DATA.me.staff.id}' — db_time · db_people`; },
      headline() { const m = DATA.me.staff; return m.attend + "% score · " + DB.list("db_time", "punches").filter(p => p.emp === m.id).length + " punches"; },
      kpis() {
        const m = DATA.me.staff;
        const mine = DB.list("db_time", "punches").filter(p => p.emp === m.id);
        return [["Score", m.attend + "%", "trailing 90 days", 1], ["Punches", String(mine.length), "this period"], ["Flagged", String(mine.filter(p => p.status === "flagged").length), "fix via TC flow"], ["OT", m.ot + " h", "MTD"]];
      },
      rows() { const m = DATA.me.staff; return [["date", "in", "out", "hours", "status"]].concat(DB.list("db_time", "punches").filter(p => p.emp === m.id).map(p => [p.date, p.in, p.out, p.hours, p.status])); }
    },
    "my-requests": {
      persona: "staff", icon: "inbox", title: "My requests statement", formats: "PDF · CSV",
      desc: "Every request you submitted with its current chain position — traceable shared IDs.",
      query() { return `SELECT * FROM workflow_requests WHERE who='${DATA.me.staff.name}' — db_workflow`; },
      headline() { const m = DATA.mine(); return m.filter(r => r.status === "pending").length + " open · " + m.length + " total"; },
      kpis() {
        const m = DATA.mine();
        return [["Total", String(m.length), "all time", 1], ["Open", String(m.filter(r => r.status === "pending").length), "in chains"], ["Approved", String(m.filter(r => r.status === "approved").length), "recorded"], ["Returned", String(m.filter(r => r.status === "returned").length), "need edits"]];
      },
      rows() { return [["id", "type", "detail", "dates", "stage", "status"]].concat(DATA.mine().map(r => [r.id, r.type, r.detail, r.dates, r.stage, r.status])); }
    },

    /* ===== MANAGER — team scope ===== */
    "team-attendance": {
      persona: "manager", icon: "clock", title: "Team attendance — June", formats: "PDF · XLSX · CSV",
      desc: "Present / late / absent board, 90-day scores and punch exceptions — Production Line A.",
      query() { return "SELECT * FROM people_employees WHERE team='Line A'; punches WHERE status='flagged' — db_people · db_time"; },
      headline() { const t = team(); return `${t.filter(e => e.state === "present").length} / ${t.length} present now`; },
      kpis() {
        const t = team(); const c = s => t.filter(e => e.state === s).length;
        return [["Present", `${c("present")} / ${t.length}`, pct(c("present"), t.length) + " of roster", 1], ["Late", String(c("late")), "auto-flagged"], ["Absent", String(c("absent")), "PV ladder"], ["On leave", String(c("onleave")), "approved"]];
      },
      rows() { return [["id", "name", "status", "attend_pct", "ot_h"]].concat(team().map(m => [m.id, m.name, m.state, m.attend, m.ot])); }
    },
    "ot-summary": {
      persona: "manager", icon: "pulse", title: "OT summary — June", formats: "PDF · XLSX · CSV",
      desc: "Hours by member vs the 40 h cap, cost preview and OT requests in flight.",
      query() { return "SUM(ot) GROUP BY member FROM people_employees WHERE team='Line A'; requests WHERE type='Overtime' — db_people · db_workflow"; },
      headline() { return sum(team(), "ot") + " h MTD · " + reqs().filter(r => r.type === "Overtime" && r.status === "pending").length + " pending"; },
      kpis() {
        const t = team(); const total = sum(t, "ot");
        const top = t.slice().sort((a, b) => b.ot - a.ot)[0];
        return [["OT hours MTD", total + " h", "team total", 1], ["Cost preview", kip(total * OT_RATE), "blended ₭45k/h"], ["Top", top ? top.name.split(" ")[0] + " · " + top.ot + " h" : "—", "cap 40 h"], ["Pending requests", String(reqs().filter(r => r.type === "Overtime" && r.status === "pending").length), "db_workflow"]];
      },
      rows() {
        return [["id", "name", "ot_h", "ot_cost_kip"]].concat(team().map(m => [m.id, m.name, m.ot, m.ot * OT_RATE]))
          .concat([["—", "— OT requests —", "", ""]]).concat(reqs().filter(r => r.type === "Overtime").map(r => [r.id, r.who, r.detail, r.status]));
      }
    },
    "leave-calendar": {
      persona: "manager", icon: "sun", title: "Leave calendar — Q3", formats: "PDF · XLSX",
      desc: "Approved + pending leave with balances — the conflict view behind every L1 decision.",
      query() { return "SELECT * FROM workflow_requests WHERE type='Leave'; leave_balances — db_workflow · db_leave"; },
      headline() { const lv = reqs().filter(r => r.type === "Leave"); return lv.filter(r => r.status === "pending").length + " pending · " + lv.filter(r => r.status === "approved").length + " approved"; },
      kpis() {
        const lv = reqs().filter(r => r.type === "Leave");
        const t = team();
        return [["On leave today", String(t.filter(e => e.state === "onleave").length), "of " + t.length + " roster", 1], ["Pending", String(lv.filter(r => r.status === "pending").length), "awaiting L1"], ["Approved", String(lv.filter(r => r.status === "approved").length), "recorded"], ["Team balance", sum(t, "leaveBal") + " d", "accrued"]];
      },
      rows() { return [["id", "who", "dates", "stage", "status"]].concat(reqs().filter(r => r.type === "Leave").map(r => [r.id, r.who, r.dates, r.stage, r.status])); }
    },

    /* ===== HR — org-wide ===== */
    "attendance": {
      persona: "hr", icon: "clock", title: "Attendance — org", formats: "PDF · XLSX · CSV",
      desc: "Daily / period · late & absence · by division — db_people joined with db_time.",
      query() { return "GROUP BY division ON people_employees; flagged punches; open TC — db_people · db_time · db_workflow"; },
      headline() { const o = DATA.org(); return o.presentPct + " present · " + o.late + " late"; },
      kpis() {
        const o = DATA.org();
        return [["Present", String(o.present), o.presentPct + " of " + o.headcount, 1], ["Late", String(o.late), "auto-flagged"], ["Absent", String(o.absent), "no-show"], ["On leave", String(o.onleave), "approved"]];
      },
      rows() { const o = DATA.org(); return [["division", "staff"]].concat(o.divisions.map(d => [d.name, d.staff])).concat([["present", o.present], ["late", o.late], ["absent", o.absent], ["onleave", o.onleave]]); }
    },
    "leave": {
      persona: "hr", icon: "sun", title: "Leave — balances & liability", formats: "PDF · XLSX",
      desc: "Balances · liability · accrual — db_leave joined with the request ledger.",
      query() { return "SUM(leaveBal) FROM people_employees; requests WHERE type='Leave' — db_people · db_leave · db_workflow"; },
      headline() { return sum(emp(), "leaveBal") + " d accrued org-wide"; },
      kpis() {
        const lv = reqs().filter(r => r.type === "Leave");
        return [["Accrued liability", sum(emp(), "leaveBal") + " d", "all active staff", 1], ["Pending", String(lv.filter(r => r.status === "pending").length), "in chains"], ["Approved MTD", String(lv.filter(r => r.status === "approved").length), "recorded"], ["Policy", "1.25 d / mo", "annual accrual"]];
      },
      rows() { return [["id", "name", "division", "leave_bal_d"]].concat(emp().map(e => [e.id, e.name, e.div, e.leaveBal])); }
    },
    "payroll": {
      persona: "hr", icon: "banknote", title: "Payroll — register & burn", formats: "PDF · XLSX · bank",
      desc: "Register · pay-code · tax & social security — db_payroll plus the burn projection.",
      query() { return "SELECT * FROM payroll_payroll_runs ORDER BY period DESC — db_payroll · dw_reports.series(burn)"; },
      headline() { const r = DB.list("db_payroll", "payroll_runs")[0]; return r ? r.id + " · " + r.state : "no runs"; },
      kpis() {
        const cur = DB.list("db_payroll", "payroll_runs")[0] || {};
        return [["Current run", cur.id || "—", (cur.state || "—") + " · step " + (cur.step || 0) + "/4", 1], ["Staff in run", String(DATA.org().runStaff), "active headcount"], ["Gross (period)", DATA.org().gross, "before PIT + SSO"], ["Payslips on file", String(DB.list("db_payroll", "payslips").length), "serialized"]];
      },
      rows() { return [["run", "period", "staff", "gross", "step", "state"]].concat(DB.list("db_payroll", "payroll_runs").map(r => [r.id, r.period, r.staff, r.gross, r.step, r.state])); }
    },
    "headcount": {
      persona: "hr", icon: "users", title: "People & headcount", formats: "PDF · XLSX",
      desc: "Roster · movement · tenure — derived live from db_people.",
      query() { return "COUNT(*) GROUP BY division, status FROM people_employees — db_people"; },
      headline() { return emp().length + " active · " + emp().filter(e => e.status === "probation").length + " probation"; },
      kpis() {
        const e = emp();
        return [["Active staff", String(e.length), DATA.org().newMoM + " MoM", 1], ["On probation", String(e.filter(x => x.status === "probation").length), "90-day reviews"], ["Joined 2026", String(e.filter(x => /2026/.test(x.since)).length), "new this year"], ["Divisions", String(DATA.org().divisions.length), "live counts"]];
      },
      rows() { return [["id", "name", "position", "division", "team", "since", "status"]].concat(emp().map(e => [e.id, e.name, e.pos, e.div, e.team, e.since, e.status || "active"])); }
    },
    "compliance": {
      persona: "hr", icon: "shield", title: "Compliance & exceptions", formats: "PDF · CSV",
      desc: "Policy ack · audit · doc expiry · exceptions — db_docs + db_audit + drill log.",
      query() { return "docs_documents WHERE status IN ('expiring','pending'); audit_events tail; platform_drills — db_docs · db_audit · db_platform"; },
      headline() { return DB.rows("db_audit") + " audit facts · " + DB.list("db_docs", "documents").filter(d => d.status === "expiring").length + " docs expiring"; },
      kpis() {
        const docs = DB.list("db_docs", "documents");
        const drills = DB.list("db_platform", "drills");
        return [["Audit facts", String(DB.rows("db_audit")), "append-only", 1], ["Docs expiring", String(docs.filter(d => d.status === "expiring").length), "≤ 60 days"], ["Pending acks", String(docs.filter(d => d.status === "pending").length), "policies"], ["Last drill", drills[0] ? drills[0].result.toUpperCase() : "—", drills[0] ? drills[0].ts : "monthly"]];
      },
      rows() { return [["doc", "holder", "kind", "expiry", "status"]].concat(DB.list("db_docs", "documents").map(d => [d.name, d.emp, d.kind, d.expiry, d.status])); }
    },
    "executive": {
      persona: "hr", icon: "trend", title: "Executive pack", formats: "PDF · deck", gate: "execPack",
      desc: "Board pack — cost · attrition · burn vs budget · resilience posture, compiled live.",
      query() { return "Aggregates: org snapshot, burn series, open requests, store posture — dw_reports · db_workflow · db_platform"; },
      headline() { return DATA.org().headcount + " staff · burn ₭" + DATA.burn.actual.slice(-1)[0] + "B"; },
      kpis() {
        const o = DATA.org();
        return [["Headcount", String(o.headcount), o.newMoM + " MoM", 1], ["Payroll burn", "₭ " + DATA.burn.actual.slice(-1)[0] + "B", "vs ₭ " + DATA.burn.budget.slice(-1)[0] + "B budget"], ["Open requests", String(reqs().filter(r => r.status === "pending").length), "all chains"], ["Data layer", DB.CATALOG.filter(c => DB.provisioned(c.id)).length + "/" + DB.CATALOG.length + " stores", DB.backups.all().length + " snapshots"]];
      },
      rows() { const o = DATA.org(); return [["metric", "value"], ["headcount", o.headcount], ["present_pct", o.presentPct], ["pending_requests", reqs().filter(r => r.status === "pending").length], ["burn_actual_B", DATA.burn.actual.slice(-1)[0]], ["burn_budget_B", DATA.burn.budget.slice(-1)[0]], ["stores_live", DB.CATALOG.filter(c => DB.provisioned(c.id)).length], ["snapshots", DB.backups.all().length]]; }
    },

    /* ===== CEO — read-only aggregates ===== */
    "board-pack": {
      persona: "ceo", icon: "trend", title: "Executive board pack", formats: "PDF · deck",
      desc: "Cost · attrition · burn vs budget · workforce snapshot — aggregates only, never case files.",
      query() { return "Aggregates only: headcount, burn vs budget, open requests, posture — dw_reports · db_workflow · db_platform"; },
      headline() { return DATA.org().headcount + " staff · burn ₭" + DATA.burn.actual.slice(-1)[0] + "B"; },
      kpis() {
        const o = DATA.org();
        return [["Headcount", String(o.headcount), o.newMoM + " MoM", 1], ["Payroll burn", "₭ " + DATA.burn.actual.slice(-1)[0] + "B", "vs ₭ " + DATA.burn.budget.slice(-1)[0] + "B budget"], ["Attrition", "7.2%", "rolling 12-mo"], ["Open requests", String(reqs().filter(r => r.status === "pending").length), "aggregate count"]];
      },
      rows() { const o = DATA.org(); return [["metric", "value"], ["headcount", o.headcount], ["present_pct", o.presentPct], ["burn_actual_B", DATA.burn.actual.slice(-1)[0]], ["burn_budget_B", DATA.burn.budget.slice(-1)[0]], ["attrition_pct", 7.2], ["open_requests", reqs().filter(r => r.status === "pending").length]]; }
    },
    "workforce-trends": {
      persona: "ceo", icon: "building", title: "Workforce by division", formats: "PDF",
      desc: "Division staffing, cost share, attrition and OT — the comparison behind the board chart.",
      query() { return "SELECT division, staff, cost_pct, attrition, ot FROM dw_reports.org_snapshots — dw_reports (derived)"; },
      headline() { const d = DATA.org().divisions; return d.length + " divisions · " + DATA.org().headcount + " staff"; },
      kpis() {
        const d = DATA.org().divisions.slice().sort((a, b) => b.staff - a.staff)[0];
        return [["Largest division", d ? d.name : "—", d ? d.staff + " staff" : "", 1], ["Cost leader", DATA.org().divisions.slice().sort((a, b) => b.cost - a.cost)[0].name, "of labor cost"], ["Headcount", String(DATA.org().headcount), "live"], ["Read-only", "∑ aggregates", "no per-person data"]];
      },
      rows() { return [["division", "staff", "cost_pct", "attrition_pct", "ot_h"]].concat(DATA.org().divisions.map(d => [d.name, d.staff, d.cost, d.attr, d.ot])); }
    },

    /* ===== SYSTEM ADMIN — platform only ===== */
    "audit-extract": {
      persona: "sysadmin", icon: "lock", title: "Audit ledger extract", formats: "CSV · signed",
      desc: "The append-only event ledger — every change, who and when. WORM copy unchanged.",
      query() { return "SELECT * FROM audit_events ORDER BY ts DESC LIMIT 40 — db_audit (append-only)"; },
      headline() { return DB.rows("db_audit") + " facts on the ledger"; },
      kpis() {
        const ev = DB.list("db_audit", "events");
        return [["Facts", String(ev.length), "extract window", 1], ["Anomalies", "0", "rule engine"], ["Actors", String(new Set(ev.map(a => a.who)).size), "distinct"], ["WORM", "verified", "object-lock bucket"]];
      },
      rows() { return [["time", "actor", "action", "object", "origin"]].concat(DB.list("db_audit", "events").slice(0, 40).map(a => [a.ts, a.who, a.act, a.obj, a.ip])); }
    },
    "backup-posture": {
      persona: "sysadmin", icon: "download", title: "Backup & resilience posture", formats: "PDF · CSV",
      desc: "Schedules, snapshot inventory and drill results — proof the ladder is being climbed.",
      query() { return "platform_backup_policies JOIN snapshots(L-CU) JOIN platform_drills — db_platform · custodial area"; },
      headline() { return DB.backups.all().length + " snapshots · drills " + ((DB.list("db_platform", "drills")[0] || {}).result || "—"); },
      kpis() {
        const pols = DB.list("db_platform", "backup_policies");
        const drills = DB.list("db_platform", "drills");
        return [["Snapshots held", String(DB.backups.all().length), "custodial (L-CU)", 1], ["Schedules on", pols.filter(p => p.enabled).length + " / " + pols.length, "per module"], ["Last drill", drills[0] ? drills[0].result.toUpperCase() : "—", drills[0] ? drills[0].ts : ""], ["Stores live", DB.CATALOG.filter(c => DB.provisioned(c.id)).length + "/" + DB.CATALOG.length, "tenant × store"]];
      },
      rows() { return [["store", "enabled", "frequency", "custody"]].concat(DB.list("db_platform", "backup_policies").map(p => [p.store, p.enabled ? "yes" : "no", p.freq, p.custody])); }
    }
  };

  const ids = (persona) => Object.keys(R).filter(k => R[k].persona === persona);
  const meta = (id) => R[id];
  const folder = (id) => "reports/" + DB.TENANT + "/" + id + "/";

  /* ---------- generate: query live stores → save a run (view-only snapshot) ---------- */
  function generate(id) {
    const r = R[id];
    if (!r || (r.gate && !DATA.has(r.gate))) return null;
    const rows = r.rows().slice(0, 61); // header + 60 rows max per file
    const run = {
      id: DB.reports.nextId(), report: id, persona: r.persona, title: r.title,
      ts: DB.stamp(), tier: DATA.tier(), fmt: "CSV",
      query: r.query(), kpis: r.kpis().map(k => [k[0], k[1], k[2]]), rows, archived: false
    };
    run.sizeKB = Math.max(1, Math.round(JSON.stringify(run).length / 1024));
    DB.reports.save(run);
    return run;
  }

  /* ---------- a run row (shared) ---------- */
  function runRow(run, goPrefix, inStorage) {
    return rowitem({
      icon: "file",
      title: `${run.id} <span class="small muted">· ${run.ts} · ${run.tier}</span>`,
      sub: run.query,
      side: `<span style="display:inline-flex;gap:6px;align-items:center">
        <button class="btn xs soft" data-go="${goPrefix}/report-run/${run.id}">${icon("eye")} View</button>
        <button class="btn xs ghost" data-act="report-dl:${run.id}" title="Download ${run.id}.csv">${icon("download")}</button>
        ${inStorage ? `<button class="btn xs ghost" data-act="report-rm:${run.id}" title="Expire file">${icon("x")}</button>` : ""}
      </span>`
    });
  }

  /* ---------- report sections (the menu): desc + Generate + last 3 runs ---------- */
  function library(persona, goPrefix) {
    const archTotal = DB.reports.runs().filter(r => r.persona === persona && r.archived).length;
    const head = `<div class="grid cols-3" style="margin-bottom:16px">
      ${kpi("Reports", String(ids(persona).length), "in this section", { hero: 1 })}
      ${kpi("Visible runs", String(DB.reports.runs().filter(r => r.persona === persona && !r.archived).length), "last " + DB.reports.VISIBLE + " per report")}
      ${kpi("In file storage", String(archTotal), `<a data-go="${goPrefix}/report-files" style="cursor:pointer;text-decoration:underline">open storage</a>`)}
    </div>`;
    const sections = ids(persona).map(id => {
      const r = R[id];
      if (r.gate && !DATA.has(r.gate)) return card(r.title, `
        <p class="small muted" style="margin-bottom:10px">${r.desc}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="small mono muted">${r.formats}</span>${UI.lockTag(DATA.unlockLabel(r.gate))}
        </div>`, { icon: "lock", cls: "row-locked" });
      const runs = DB.reports.runs(id);
      const visible = runs.filter(x => !x.archived).slice(0, DB.reports.VISIBLE);
      const archived = runs.filter(x => x.archived).length;
      return card(r.title, `
        <p class="small muted" style="margin-bottom:6px">${r.desc}</p>
        <div class="mono small muted" style="margin-bottom:8px">${r.query()}</div>
        <div class="small" style="margin-bottom:12px"><span class="badge acc plain">live</span> <b>${r.headline()}</b> <span class="muted small">· ${r.formats}</span></div>
        ${visible.length ? `<div class="eyebrow" style="margin-bottom:6px">Last ${visible.length} run${visible.length > 1 ? "s" : ""}</div>` + rowlist(visible.map(run => runRow(run, goPrefix))) : `<p class="small muted">No runs yet — generate the first one.</p>`}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn sm" data-act="report-gen:${id}">${icon("sparkle")} Generate now</button>
          ${archived ? `<button class="btn sm ghost" data-go="${goPrefix}/report-files">${icon("folder")} ${archived} older in file storage</button>` : `<span class="small muted">older runs auto-archive to file storage</span>`}
        </div>`, { icon: r.icon });
    }).join("");
    return head + sections;
  }

  /* ---------- run viewer — click and VIEW ONLY + download link ---------- */
  function runPage(runId, persona, goPrefix) {
    const run = DB.reports.runs().find(r => r.id === runId && r.persona === persona) || DB.reports.runs().find(r => r.persona === persona);
    if (!run) return { run: null, title: "Report run", sub: "No generated runs yet.", body: card("", empty("file", "Nothing here yet", "Generate a report from the section page first.")) };
    const header = run.rows[0] || [];
    const body = `
      <div class="grid cols-4">${run.kpis.map((k, i) => kpi(k[0], k[1], k[2], i === 0 ? { hero: 1 } : {})).join("")}</div>
      <div class="grid cols-3">
        <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
          ${card("Result set — " + (run.rows.length - 1) + " rows (view-only snapshot)", tbl(header.map((h, i) => ({ h: String(h), r: i > 1 })), run.rows.slice(1).map(rw => ({ cells: rw.map((v, i) => i > 1 && /^[\d.]+$/.test(String(v)) ? `<span class="num">${UI.esc(String(v))}</span>` : UI.esc(String(v === undefined || v === null ? "—" : v))) }))), { icon: "list" })}
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          ${card("Query detail", `<div class="mono small reg">report: ${run.report}
run: ${run.id}   tier: ${run.tier}
generated: ${run.ts}
${run.query}</div>`, { icon: "search" })}
          ${card("File", rowlist([
            rowitem({ icon: "file", title: run.id + ".csv", sub: folder(run.report) + " · " + (run.sizeKB || 1) + " KB · " + run.fmt, side: badge(run.archived ? "readonly" : "ok") })
          ]) + `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
            <button class="btn soft" data-act="report-dl:${run.id}">${icon("download")} Download file (.csv)</button>
            <button class="btn ghost" data-act="report-json:${run.id}">${icon("file")} Download payload (.json)</button>
          </div><p class="small muted" style="margin-top:10px">This run is a frozen snapshot — view-only. For today's numbers, generate a new run from the report section.</p>`, { icon: "folder" })}
        </div>
      </div>`;
    return { run, title: run.title + " · " + run.id, sub: "Generated " + run.ts + " · " + run.tier + " tier · view-only snapshot with download link.", body };
  }

  /* ---------- file storage — one folder per report, archived runs ---------- */
  function filesPage(persona, goPrefix) {
    const mine = DB.reports.runs().filter(r => r.persona === persona);
    const archived = mine.filter(r => r.archived);
    const byReport = {};
    archived.forEach(r => { (byReport[r.report] = byReport[r.report] || []).push(r); });
    const folders = ids(persona).map(id => {
      const files = byReport[id] || [];
      return card(`${R[id].title}`, `
        <div class="mono small muted" style="margin-bottom:10px">${icon("folder", "lk")} ${folder(id)} · ${files.length} archived file${files.length === 1 ? "" : "s"} · ${files.reduce((n, f) => n + (f.sizeKB || 1), 0)} KB</div>
        ${files.length ? rowlist(files.map(run => runRow(run, goPrefix, true))) : `<p class="small muted">Empty — runs land here automatically once a report has more than ${DB.reports.VISIBLE} (retention keeps 12 per report).</p>`}`, { icon: "folder" });
    }).join("");
    return {
      kpis: `<div class="grid cols-4">
        ${kpi("Folders", String(ids(persona).length), "one per report", { hero: 1 })}
        ${kpi("Archived files", String(archived.length), "hidden from sections")}
        ${kpi("Storage", String(archived.reduce((n, f) => n + (f.sizeKB || 1), 0)) + " KB", "custodial area (L-CU)")}
        ${kpi("Retention", "12 / report", "older runs expire")}
      </div>`,
      folders: folders || card("", empty("folder", "No folders", ""))
    };
  }

  return { ids, meta, generate, library, runPage, filesPage, folder };
})();
