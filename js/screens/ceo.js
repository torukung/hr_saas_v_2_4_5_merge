/* ============================================================
   ADEPTIO · CEO / SHAREHOLDER persona — plum · READ-ONLY
   Web: Board · Trends · Divisions(→drill) · Compliance · Packs
   Mobile: Board · Trends · Me — no edit controls anywhere.
   ============================================================ */
(function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, table, empty, sparkline, bars, lines2, donut, legend } = UI;

  const ro = `<span class="ro-chip">${icon("eye")} ${t("common.readonly")}</span>`;

  function boardKpis(compact) {
    return `
      ${kpi("Labor cost %", "18.4%", `<span class="up">▼ 0.3</span> vs Q1 · of revenue`, { hero: 1 })}
      ${kpi("Payroll burn", "96%", "of budget · YTD")}
      ${kpi("Headcount", "248", `<span class="up">+3</span> vs plan 250`)}
      ${kpi("Attrition", "7.2%", `<span class="up">▼ 1.2</span> rolling 12-mo`)}`;
  }

  function burnChart() {
    return card("Payroll burn — 12-month trend",
      lines2(DATA.burn.actual, DATA.burn.budget, DATA.burn.labels, { fmt: v => "₭" + v.toFixed(1) + "B" }) +
      legend([{ c: "var(--acc)", l: "Actual" }, { c: "var(--muted-2)", l: "Budget" }]),
      { icon: "trend", link: "ceo/web/trends", linkLabel: "Drill" });
  }

  function divisionBars() {
    return card("Division comparison — labor cost share (%)",
      bars(DATA.company.divisions.map(d => ({ l: d.name, v: d.cost, vt: d.cost + "%" })), { values: 1 }),
      { icon: "chart", link: "ceo/web/divisions", linkLabel: "Compare" });
  }

  /* ---------- WEB ---------- */
  const web = {
    board() {
      return {
        title: "Executive board — Q2 2026", sub: "Aggregates over the same ledger everyone else writes — no individuals, drill-down and export only.",
        actions: `${ro} <button class="btn ghost" data-act="export:boardpack">${icon("download")} ${t("common.export")} board pack</button>`,
        body: `
        <div class="grid cols-4">${boardKpis()}</div>
        <div class="grid cols-3" style="margin-top:16px">
          <div class="span-2">${burnChart()}</div>
          ${card("Signals to watch", rowlist([
          rowitem({ icon: "trend", title: "OT cost — Logistics", sub: "+18% MoM · seasonal peak", side: badge("flagged"), go: "ceo/web/divisions" }),
          rowitem({ icon: "users", title: "Attrition — Sales 9.8%", sub: "above org 7.2%", side: badge("expiring"), go: "ceo/web/divisions" }),
          rowitem({ icon: "shield", title: "Compliance posture", sub: "2 open flags · low risk", side: badge("ok"), go: "ceo/web/compliance" }),
          rowitem({ icon: "check", title: "Headcount vs plan", sub: "248 of 250 · on track", side: badge("ok") })
        ]), { icon: "bell" })}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${divisionBars()}
          ${card("Org attendance — trend", sparkline(DATA.attendanceTrend, { h: 96 }) + `<div class="small muted" style="margin-top:8px">Today 95.1% · no per-person data at this altitude — the read-only guarantee made visible.</div>`, { icon: "pulse" })}
        </div>
        ${(typeof DEVICES !== "undefined" && DATA.has("biometrics")) ? `<div class="grid cols-3" style="margin-top:16px">
          ${card("Attendance capture — coverage", (() => { const mix = DEVICES.captureMix(); return `${UI.bars(mix.map(m => ({ l: m.label, v: m.v })), { values: 1, w: 320, h: 140 })}<div class="small muted" style="margin-top:6px">How the org clocks in today — ${mix.map(m => m.label + " " + m.pct + "%").join(" · ")}. Source mix only; no individuals at this altitude.</div>`; })(), { icon: "chart", cls: "span-2" })}
          ${card("Device fleet", (() => { const c = DEVICES.statusCounts(); return `<div style="display:flex;align-items:center;gap:16px">${UI.donut(DEVICES.uptime())}<div class="small muted"><b class="num" style="color:var(--ink)">${c.online}/${c.total}</b> terminals online<br>uptime <b class="num" style="color:var(--ink)">${DEVICES.uptime()}%</b><br><b class="num" style="color:var(--ink)">${DEVICES.punchesToday()}</b> device punches today</div></div>`; })(), { icon: "wifi" })}
        </div>` : ""}`
      };
    },

    /* ---------- v2.4.5 G6 — CEO finance read (board-level P&L over the LEDGER) ---------- */
    finance() {
      const L = (typeof LEDGER !== "undefined" && LEDGER.rollup) ? LEDGER : null;
      const roll = L ? L.rollup() : { revenue: 0, expense: 0, staff: 0, result: 0, margin: 0, staffRatio: 0 };
      const top = L ? L.topExpenses(5) : [];
      const ser = L ? L.series() : [];
      const M = (n) => Math.round((n || 0) / 1e5) / 10; // ₭ → ₭M, one decimal (matches HR Cost & benefit)
      return {
        title: "Finance — board read", sub: "Aggregate P&L over the same cashbook everyone writes — revenue, cost and the 6-month trend. Read-only · no individuals.",
        actions: `${ro} <button class="btn ghost" data-act="export:boardpack">${icon("download")} ${t("common.export")} board pack</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Revenue", UI.kip(roll.revenue), "this month", { hero: 1 })}
          ${kpi("Expenses", UI.kip(roll.expense), "operating")}
          ${kpi("Staff cost", UI.kip(roll.staff), Math.round(roll.staffRatio * 100) + "% of revenue")}
          ${kpi("Result", UI.kip(roll.result), Math.round(roll.margin * 100) + "% margin")}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${ser.length ? card("Revenue vs staff-cost — 6 months (derived)", lines2(ser.map(s => M(s.revenue)), ser.map(s => M(s.staffCost)), ser.map(s => s.month)) + legend([{ c: "var(--acc)", l: "Revenue (₭M)" }, { c: "var(--muted-2)", l: "Staff cost (₭M)" }]), { icon: "trend" }) : card("Revenue vs staff-cost", empty("trend", "No ledger data yet", "The cashbook is empty."), { icon: "trend" })}
          ${top.length ? card("Top expenses (₭M)", bars(top.map(e => ({ l: e.cat, v: M(e.amount) })), { values: 1 }), { icon: "chart" }) : card("Top expenses", empty("chart", "No expenses posted", "Nothing to chart yet."), { icon: "chart" })}
        </div>`
      };
    },

    trends() {
      return {
        title: "Trends", sub: "Twelve months of derived metrics from the reporting warehouse — never the operational stores.",
        actions: ro,
        body: `
        ${burnChart()}
        <div class="grid cols-2" style="margin-top:16px">
          ${card("OT cost (₭M / month)", bars([62, 58, 71, 66, 74, 81, 64, 60, 69, 72, 78, 84].map((v, i) => ({ l: DATA.burn.labels[i], v, tone: v > 75 ? "warn" : undefined })), {}), { icon: "clock" })}
          ${card("Attrition % (rolling)", sparkline([8.8, 8.6, 8.4, 8.1, 8.2, 7.9, 7.7, 7.6, 7.5, 7.4, 7.3, 7.2], { h: 110 }) + `<div class="small muted" style="margin-top:8px">7.2% — down 1.2 pts year-on-year</div>`, { icon: "trend" })}
        </div>
        <div class="grid cols-3" style="margin-top:16px">
          ${kpi("Cost / hire", "₭ 4.1M", "rolling 6-mo")}
          ${kpi("Avg tenure", "3.4 y", "+0.2 YoY")}
          ${kpi("Productivity proxy", "104", "output / labor-hour idx")}
        </div>`
      };
    },

    divisions() {
      return {
        title: "Divisions", sub: "Same rows, aggregated by costCenter — click through for a division rollup.",
        actions: ro,
        body: card("Compare", table(
          [{ h: "Division" }, { h: "Staff", r: 1 }, { h: "Cost share", r: 1 }, { h: "Attrition", r: 1 }, { h: "OT h / mo", r: 1 }, { h: "", r: 1 }],
          DATA.company.divisions.map(d => ({
            go: `ceo/web/division/${d.name}`,
            cells: [`<span class="strong">${d.name}</span>`, `<span class="num">${d.staff}</span>`, `<span class="num">${d.cost}%</span>`,
            `<span class="num" style="color:${d.attr > 8 ? "var(--bad)" : "inherit"}">${d.attr}%</span>`, `<span class="num">${d.ot}</span>`, icon("chevR")]
          }))), { icon: "building" })
      };
    },

    division(name) {
      const d = DATA.company.divisions.find(x => x.name === name) || DATA.company.divisions[0];
      return {
        title: d.name + " — rollup", sub: "Division aggregate · still no individuals at this lens.",
        crumbs: [{ label: "Divisions", go: "ceo/web/divisions" }, { label: d.name }],
        actions: ro,
        body: `
        <div class="grid cols-4">
          ${kpi("Staff", String(d.staff), "headcount", { hero: 1 })}
          ${kpi("Cost share", d.cost + "%", "of org labor cost")}
          ${kpi("Attrition", d.attr + "%", d.attr > 8 ? "above org avg" : "below org avg")}
          ${kpi("OT", d.ot + " h", "per month")}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${card("Attendance trend", sparkline(DATA.attendanceTrend.map(v => v - (d.attr / 10)), { h: 100 }), { icon: "pulse" })}
          ${card("Notes from the warehouse", rowlist([
          rowitem({ icon: "trend", title: "OT trending " + (d.ot > 100 ? "up" : "flat"), sub: "vs trailing 3-mo", side: d.ot > 100 ? badge("expiring") : badge("ok") }),
          rowitem({ icon: "users", title: "Headcount steady", sub: "no open requisitions at this tier", side: badge("ok") })
        ]), { icon: "file" })}
        </div>`
      };
    },

    compliance() {
      return {
        title: "Compliance & risk posture", sub: "Derived from the audit ledger and policy signals — org-wide score, no case files at this lens.",
        actions: ro,
        body: `
        <div class="grid cols-3">
          ${card("Risk score", `<div style="display:flex;align-items:center;gap:18px">${donut(86, { color: "var(--ok)" })}<div><div style="font-weight:800;font-size:15px">Low risk</div><div class="small muted">86 / 100 · improving</div></div></div>`, { icon: "shield" })}
          ${kpi("Open policy flags", "2", "both on coaching ladder")}
          ${kpi("Policy ack rate", "92%", "Code of conduct v4")}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          ${card("Posture by area", rowlist([
          rowitem({ icon: "clock", title: "Attendance compliance", sub: "late/no-show signals", side: badge("ok") }),
          rowitem({ icon: "file", title: "Document validity", sub: "7 expiring ≤ 30 d — managed", side: badge("expiring") }),
          rowitem({ icon: "banknote", title: "Statutory filings", sub: "PIT + SSO current", side: badge("ok") }),
          rowitem({ icon: "lock", title: "Access & audit", sub: "0 anomalies · 1,204 events/day", side: badge("ok") })
        ]), { icon: "shield" })}
          ${card("Trail (aggregate)", `<p class="small muted">Every change in the platform lands on the append-only audit ledger (db_audit). The board sees rates and trends; case-level detail stays with HR and System Admin — separation of duties, by design.</p>`, { icon: "history" })}
        </div>`
      };
    },

    /* ---------- v2.3.2.db — data room (read-only, aggregates only) ---------- */
    dataroom() {
      const snaps = DB.list("dw_reports", "org_snapshots");
      const drills = DB.list("db_platform", "drills");
      return {
        title: "Data room", sub: "What the board can see of the data layer — derived projections and resilience posture. No row-level records at this altitude.",
        actions: ro,
        body: `
        <div class="grid cols-4">
          ${kpi("Stores live", String(DB.CATALOG.filter(c => DB.provisioned(c.id)).length) + " / " + DB.CATALOG.length, "one DB per tenant × store", { hero: 1 })}
          ${kpi("Snapshots held", String(DB.backups.all().length), "custodial layer (L-CU)")}
          ${kpi("Last restore drill", drills[0] ? drills[0].result.toUpperCase() : "—", drills[0] ? drills[0].ts : "scheduled monthly")}
          ${kpi("Audit facts", String(DB.rows("db_audit")), "append-only · WORM exported")}
        </div>
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("dw_reports · org snapshots — the only store this board reads", DBV.tableEditor("dw_reports", "org_snapshots", {}), { icon: "chart" })}
            ${card("Resilience drills — pass/fail line, audit-logged", UI.table(
              [{ h: "Drill" }, { h: "When" }, { h: "Target" }, { h: "Checks" }, { h: "Result", r: 1 }],
              drills.map(d => ({ cells: [idtag(d.id), `<span class="small mono">${d.ts}</span>`, `<span class="mono small">${d.target}</span>`, `<span class="small muted">${d.checks}</span>`, d.result === "pass" ? badge("ok") : badge("failed")] }))), { icon: "shield" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Why this view is safe", `<p class="small muted">dw_reports is <b>derived</b> — rebuilt from the event ledger, never written directly. The board reads aggregates over the same rows the other lenses write; never copies, never case files. Losing this store costs compute, not truth.</p>`, { icon: "eye" })}
            ${card("Custody, in one line", `<p class="small muted">Two custodians, always (P3): the provider's continuous backups <i>and</i> nightly exports to object storage we control. Either alone can rebuild the platform.</p>`, { icon: "lock" })}
          </div>
        </div>`
      };
    },

    packs() {
      return {
        title: "Board packs", sub: "Compiled from aggregates on demand — each pack keeps its last 3 runs with query detail; click a run to view (read-only) or download. Older runs move to file storage.",
        actions: `${ro}<button class="btn ghost" data-go="ceo/web/report-files">${icon("folder")} File storage</button>`,
        body: REP.library("ceo", "ceo/web") +
          card("Schedule", `<p class="small muted" style="margin-bottom:10px">Compiled monthly on the 1st, quarterly on close — delivered to the board via email channel.</p><button class="btn ghost sm soon" title="Owned by HR / SysAdmin — not actionable from the read-only CEO view" data-act="toast:Delivery schedule is owned by HR / SysAdmin — not actionable from the read-only CEO view">${icon("send")} Request a change</button>`, { icon: "calendar" })
      };
    },

    "report-run"(param) {
      const p = REP.runPage(param, "ceo", "ceo/web");
      return {
        title: p.title, sub: p.sub,
        crumbs: [{ label: "Board packs", go: "ceo/web/packs" }, { label: p.run ? p.run.id : "run" }],
        actions: p.run ? `${idtag(p.run.id)} ${ro}` : ro,
        body: p.body
      };
    },
    "report-files"() {
      const f = REP.filesPage("ceo", "ceo/web");
      return {
        title: "Pack file storage", sub: "Packs older than the last 3 are hidden here — one folder per pack, view-only with download links.",
        crumbs: [{ label: "Board packs", go: "ceo/web/packs" }, { label: "File storage" }],
        actions: ro,
        body: f.kpis + f.folders
      };
    }
  };

  /* ---------- MOBILE (snapshot) ---------- */
  const mobile = {
    board() {
      return {
        title: "Snapshot · Q2", body: `
        ${card("", `<div style="display:flex;justify-content:space-between;align-items:center">${ro}<span class="small muted">Jun 10, 2026</span></div>`)}
        <div class="grid cols-2">${boardKpis(1)}</div>
        ${card("Burn vs budget", sparkline(DATA.burn.actual.slice(-8), { h: 70 }) + `<div class="small muted" style="margin-top:6px">96% of budget YTD</div>`, { icon: "trend" })}`
      };
    },
    trends() {
      return {
        title: "Trends", body: `
        ${card("Attrition", sparkline([8.8, 8.4, 8.2, 7.9, 7.6, 7.4, 7.2], { h: 64 }) + `<div class="small muted" style="margin-top:6px">7.2% · improving</div>`, { icon: "trend" })}
        ${card("Divisions", rowlist(DATA.company.divisions.slice(0, 4).map(d => rowitem({ icon: "building", title: d.name, sub: d.staff + " staff", side: `<b class="num">${d.cost}%</b>`, go: "ceo/mobile/division/" + d.name }))), { icon: "chart" })}`
      };
    },
    me() {
      const m = DATA.me.ceo;
      return {
        title: "Me", body: `
        ${card("", `<div style="display:flex;align-items:center;gap:12px">${UI.avatar(m.name, 1)}<div><div style="font-weight:800">${m.name}</div><div class="small muted">${m.role}</div></div></div>`)}
        ${card("This lens", `<p class="small muted">Aggregate, read-only — no edit controls exist anywhere in this app. Exports and scheduled packs only.</p>`, { icon: "eye" })}`
      };
    },
    division(name) {
      const d = DATA.company.divisions.find(x => x.name === name) || DATA.company.divisions[0];
      return {
        title: d.name, back: "ceo/mobile/trends", body: `
        <div class="grid cols-2">${kpi("Staff", String(d.staff), "")}${kpi("Cost", d.cost + "%", "share")}</div>
        <div class="grid cols-2">${kpi("Attrition", d.attr + "%", "")}${kpi("OT", d.ot + "h", "/ month")}</div>`
      };
    }
  };

  /* ---------- v2.4.0.db.auth — My security ---------- */
  web.security = () => ({
    title: "My security", sub: "Read-only everywhere else — but your own credential is yours to manage.",
    body: AUTHV.mySecurity("ceo")
  });

  /* ---------- v2.4.4 — Schedule coverage (read-only, org-wide month) ---------- */
  web["sched-cal"] = (param) => SCHEDVIEWS.calendar({ persona: "ceo", device: "web", canEdit: false, scope: "all", perspective: "month", param });
  mobile["sched-cal"] = (param) => SCHEDVIEWS.calendar({ persona: "ceo", device: "mobile", canEdit: false, scope: "all", perspective: "month", param, back: "ceo/mobile/board" });

  PERSONAS.ceo = {
    key: "ceo", label: t("personas.ceo"), icon: "trend",
    appName: "Adeptio Board", roleLine: "Executive · read-only",
    domain: "board.adeptio.hr/overview",
    nav: [
      { group: "Insight", items: [
        { id: "board", icon: "grid", label: t("ceo.board") },
        { id: "finance", icon: "banknote", label: t("ceo.finance") },
        { id: "trends", icon: "trend", label: t("ceo.trends") },
        { id: "divisions", icon: "building", label: t("ceo.divisions") },
        { id: "sched-cal", icon: "calendar", label: "Schedule coverage" }
      ]},
      { group: "Governance", items: [
        { id: "compliance", icon: "shield", label: t("ceo.compliance") },
        { id: "packs", icon: "files", label: t("ceo.packs") },
        { id: "dataroom", icon: "layers", label: "Data room" }
      ]},
      { group: "Account", items: [{ id: "security", icon: "key", label: "My security" }] }
    ],
    parent: { division: "divisions", "report-run": "packs", "report-files": "packs" },
    tabs: [
      { id: "board", icon: "grid", label: "Board" },
      { id: "trends", icon: "trend", label: "Trends" },
      { id: "me", icon: "user", label: "Me" }
    ],
    tabParent: { division: "trends", "sched-cal": "board" },
    web, mobile
  };
})();
