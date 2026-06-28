/* ============================================================
   ADEPTIO · v2.4.4 — shared SCHEDULE screen builders (window.SCHEDVIEWS)
   The five personas stay DRY: each Job-Schedule screen is built
   here once and the persona files delegate to it. Every builder
   returns the standard screen object {title, sub, actions?, body}
   (web) or {title, back?, body} (mobile). PURE strings — no DOM at
   load, so tools/smoke.js (node) renders these too. Data comes from
   the SCHEDULE cell (the roster's one writer) and CALCORE (the
   read-only calendar engine). Interactivity follows app.js exactly:
   data-act="cmd:arg" → handleAct() → SCHEDULE / DATA / DB then
   DATA.pulse(); data-go for navigation. Colours come from tokens
   via css/schedule.css — never a hard-coded hex.
   ============================================================ */
window.SCHEDVIEWS = (function () {
  const U = window.UI;
  const icon = (n, c) => U.icon(n, c);
  const esc = (s) => U.esc(String(s == null ? "" : s));
  const card = (t, b, o) => U.card(t, b, o);
  const table = (c, r, o) => U.table(c, r, o);
  const kpi = (l, v, s, o) => U.kpi(l, v, s, o);
  const empty = (i, t, s) => U.empty(i, t, s);
  const SC = () => window.SCHEDULE;
  const CC = () => window.CALCORE;

  /* current month in the seed data is June 2026 */
  const SEED_YEAR = 2026, SEED_MONTH = 5, SEED_DATE = "2026-06-08";

  /* ---------- param → calendar state ----------------------------------
     param shape (route trailing segment): "<perspective>[.<dateISO>][~<scope>]"
     e.g. "month", "week.2026-06-08", "people~Production",
     "week.2026-06-08~G-PRDA". Tolerates undefined. The ~scope segment lets
     the division filter survive a perspective/week switch without extra state. */
  function parseParam(param) {
    let raw = String(param == null ? "" : param);
    let scope = "";
    const tilde = raw.indexOf("~");
    if (tilde >= 0) { scope = decodeURIComponent(raw.slice(tilde + 1)); raw = raw.slice(0, tilde); }
    const dot = raw.indexOf(".");
    const persp = (dot >= 0 ? raw.slice(0, dot) : raw) || "month";
    const dateISO = dot >= 0 ? raw.slice(dot + 1) : "";
    const ok = ["month", "week", "day", "people", "shift"].includes(persp) ? persp : "month";
    return { perspective: ok, dateISO: /^\d{4}-\d\d-\d\d$/.test(dateISO) ? dateISO : "", scope };
  }
  function calState(opts) {
    const p = parseParam(opts.param);
    const st = {
      perspective: opts.perspective || p.perspective,
      scope: p.scope || opts.scope || "all",
      persona: opts.persona,
      canEdit: !!opts.canEdit,
      year: SEED_YEAR, month: SEED_MONTH
    };
    if (p.dateISO) { st.dateISO = p.dateISO; st.weekStartISO = p.dateISO; }
    else if (st.perspective !== "month") { st.dateISO = SEED_DATE; st.weekStartISO = SEED_DATE; }
    return st;
  }
  /* rebuild the trailing param from a state so perspective/scope/date survive a nav */
  function paramOf(persp, dateISO, scope) {
    let s = persp || "month";
    if (dateISO && persp !== "month") s += "." + dateISO;
    if (scope && scope !== "all") s += "~" + encodeURIComponent(scope);
    return s;
  }

  /* ---------- perspective switcher (data-go, node-safe) ---------- */
  function perspSwitch(persona, device, current, dateISO, scope, screen) {
    const scr = screen || "sched-cal";
    const opts = [["month", "Month"], ["week", "Week"], ["people", "People"], ["shift", "Shift"]];
    return `<div class="seg sm" role="tablist" aria-label="Calendar perspective">${opts.map(([id, lbl]) =>
      `<button role="tab" aria-pressed="${current === id}" data-go="${persona}/${device}/${scr}/${paramOf(id, dateISO, scope)}">${esc(lbl)}</button>`
    ).join("")}</div>`;
  }

  /* ---------- multi-status filter (Leave · OT · Sick + Division) ----------
     The status pills toggle client-side (aria-pressed, like composer chips)
     — a presentational lens over the read-only calendar. The Division select
     drives the real CALCORE scope through the route param so it actually
     filters. */
  function statusFilter(persona, device, scope, persp, dateISO, screen) {
    const scr = screen || "sched-cal";
    const divs = SC().divisions();
    const sets = { leave: SC().leaveSet().size, ot: SC().otSet().size, sick: SC().sickSet().size };
    const pill = (cls, lbl, n) => `<button class="sf-pill ${cls}" aria-pressed="false" data-act="sched-flag:${cls}"><i></i>${esc(lbl)}${n ? ` <b class="num">${n}</b>` : ""}</button>`;
    // the select's value (a division name or "all") is appended as ~scope by the app.js handler
    const scopeSel = `<select class="input sf-scope" data-sched-scope="${persona}/${device}/${scr}/${paramOf(persp, dateISO, "all")}" aria-label="Filter by division">
      <option value="all"${scope === "all" ? " selected" : ""}>All divisions</option>
      ${divs.map(d => `<option value="${esc(d)}"${scope === d ? " selected" : ""}>${esc(d)}</option>`).join("")}
    </select>`;
    return `<div class="statusfilter">
      ${pill("on-active", "Active", "")}
      ${pill("on-leave", "Leave", sets.leave)}
      ${pill("on-ot", "OT", sets.ot)}
      ${pill("on-sick", "Sick", sets.sick)}
      ${scopeSel}
    </div>`;
  }

  function legend() {
    return `<div class="cal-legend">
      <span><i class="is-hr"></i>Office / full-day</span>
      <span><i class="is-mgr"></i>Morning</span>
      <span><i class="is-staff"></i>Afternoon</span>
      <span><i class="is-ceo"></i>Night</span>
    </div>`;
  }

  /* mobile agenda: a flat list of the seeded month's shifts for the scope */
  function agenda(scope, empScope) {
    const sc = SC();
    let rows = sc.roster({ from: "2026-06-01", to: "2026-06-30" });
    if (empScope) rows = rows.filter(r => r.emp === empScope);
    else if (scope && scope !== "all") rows = rows.filter(r => { const sg = sc.shiftGroup(r.sg); const g = sg && sc.group(sg.group); return g && (g.div === scope || g.id === scope); });
    rows = rows.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    if (!rows.length) return empty("calendar", "No shifts", "Nothing rostered in this view yet.");
    return U.rowlist(rows.map(r => {
      const sg = sc.shiftGroup(r.sg); const p = sg && sc.period(sg.period);
      return U.rowitem({
        icon: "calendar",
        title: `${esc(r.date)} · ${esc((sg && sg.label) || r.sg)}`,
        sub: `${esc(sc.empName(r.emp))}${p ? " · " + p.start + "–" + p.end : ""}`,
        side: U.badge(r.status)
      });
    }));
  }

  /* ====================================================================
     1) CALENDAR — the main screen (Month·Week·People·Shift)
     ==================================================================== */
  function calendar(o) {
    const persona = o.persona, device = o.device || "web", canEdit = !!o.canEdit;
    const st = calState({ param: o.param, scope: o.scope || "all", perspective: o.perspective, persona, canEdit });
    const scope = st.scope;
    st.changeLog = canEdit;          // Task 1 — surface the planned-moves change log on the calendar
    st.device = device; st.screen = "sched-cal"; // lets the inline week link back to the hour grid
    const fixedScope = !!o.scope && o.scope !== "all"; // manager/staff lock to their own scope — no division dropdown
    const sub = canEdit
      ? "Drag a shift chip onto a day to roster the next free person; open a week for the hour grid. Status filters lens the same read-only roster."
      : "Read-only — your published shifts. Open a week for the hour-by-hour view.";

    if (device === "mobile") {
      return {
        title: "Schedule", back: o.back,
        body: `${card("This view", `<div class="small muted">${esc(st.perspective[0].toUpperCase() + st.perspective.slice(1))} · ${scope === "all" ? "all divisions" : esc(scope)}</div>`, { icon: "calendar" })}
        ${card("Upcoming shifts", agenda(scope, o.empScope), { icon: "calendar" })}
        ${canEdit ? card("Edit on web", `<p class="small muted">Roster editing, drag-drop and the hour grid live on the web console.</p>`, { icon: "sparkle" }) : ""}`
      };
    }

    const actions = perspSwitch(persona, device, st.perspective, st.dateISO, fixedScope ? "all" : scope)
      + (canEdit ? `<button class="btn soft" data-act="sched-publish-month">${icon("calcheck")} Publish planned</button>` : "");

    return {
      title: "Calendar", sub,
      actions,
      body: `
        ${fixedScope ? "" : statusFilter(persona, device, scope, st.perspective, st.dateISO)}
        ${CC().render(st)}
        ${legend()}
        ${canEdit ? `<div class="sched-divider"><span>Roster a shift</span></div>${card("Assign to roster", assignForm(persona), { icon: "plus" })}` : ""}`
    };
  }

  /* inline assign affordance (HR/Manager) — pick day + shift-group + person */
  function assignForm(persona) {
    const sc = SC();
    const sgs = sc.shiftGroups();
    const emps = sc.groups().reduce((acc, g) => { (g.members || []).forEach(id => { if (!acc.find(e => e.id === id)) { const e = sc.empById(id); if (e) acc.push(e); } }); return acc; }, []);
    return `<div id="sched-assignf" class="pv-form" style="max-width:560px">
      <div class="field"><label>Date</label><input class="input" data-f="date" type="date" value="${SEED_DATE}" min="2026-06-01" max="2026-06-30"></div>
      <div class="field"><label>Shift group</label><select class="input" data-f="sg">${sgs.map(s => `<option value="${s.id}">${esc(s.label)} · cap ${s.cap}</option>`).join("")}</select></div>
      <div class="field"><label>Person</label><select class="input" data-f="emp">${emps.map(e => `<option value="${e.id}">${esc(e.name)} · ${esc(e.div || e.pos || "")}</option>`).join("")}</select></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <button class="btn" data-act="sched-assign">${icon("plus")} Assign to roster</button>
      </div>
      <p class="small muted" style="margin-top:8px">A person can hold one slot per shift-group per day. New rows land as <b>planned</b> until you publish.</p>`;
  }

  /* split summary (v2.4.4 fine-tune) — on the green line under the Shift-Control KPIs.
     Section 1: each Shift period in full detail (hours · days · kind).
     Section 2: each Shift group → its people-group, the divisions inside it, the
     head-count per division and the people by name. Reads the same cell as the tables. */
  const dotClass = (c) => ({ hr: "is-hr", mgr: "is-mgr", staff: "is-staff", ceo: "is-ceo" }[c] || "is-hr");
  /* one frame per shift PERIOD: section 1 = the period in full detail; section 2 (beside,
     same frame) = the shift group(s) that use that period → group · division · head-count
     per division · the people by name. Reads the same SCHEDULE cell as the tables below. */
  function shiftSummary() {
    const sc = SC();
    const periods = sc.periods(), sgs = sc.shiftGroups();
    if (!periods.length) return card("Shift summary", `<div class="ssum-empty">No shift periods defined yet.</div>`, { icon: "pulse" });

    const frames = periods.map(p => {
      const days = p.days || [];
      const allWeek = days.length === 7;
      const periodCell = `<div class="ssum2-period">
        <div class="ssum-itop"><span class="ssum-dot ${dotClass(p.color)}"></span><span class="ssum-name">${esc(p.name)}</span><span class="ssum-kind">${esc(p.kind)}</span></div>
        <div class="ssum-meta"><span class="ssum-hours num">${esc(p.start)}–${esc(p.end)}</span><span class="ssum-sep">·</span><span class="ssum-sub">${allWeek ? "Every day" : (days.length ? days.join(" ") : "No days set")}</span></div>
      </div>`;

      const sgsForPeriod = sgs.filter(s => s.period === p.id);
      const groupCells = sgsForPeriod.length ? sgsForPeriod.map(s => {
        const g = sc.group(s.group);
        const members = g ? sc.groupMembers(g.id) : [];
        const byDiv = {};
        members.forEach(e => { const d = e.div || "—"; (byDiv[d] = byDiv[d] || []).push(e); });
        const divKeys = Object.keys(byDiv).sort();
        const divRows = divKeys.length ? divKeys.map(d => `
          <div class="ssum-div">
            <div class="ssum-divhead"><span class="ssum-divname">${esc(d)}</span><span class="ssum-divn num">${byDiv[d].length}</span></div>
            <div class="ssum-names">${byDiv[d].map(e => `<span class="ssum-chip">${esc(e.name)}</span>`).join("")}</div>
          </div>`).join("") : `<div class="ssum-none">No people in this group yet.</div>`;
        return `<div class="ssum-gitem">
          <div class="ssum-itop"><span class="ssum-name">${esc(s.label)}</span><span class="ssum-kind num">cap ${s.cap}</span></div>
          <div class="ssum-meta"><span class="ssum-sub">${esc(g ? g.name : s.group)}</span><span class="ssum-sep">·</span><span class="ssum-sub">${members.length} ${members.length === 1 ? "person" : "people"}</span></div>
          <div class="ssum-divs">${divRows}</div>
        </div>`;
      }).join("") : `<div class="ssum-none">No shift groups use this period yet.</div>`;

      return `<div class="ssum2-frame">
        ${periodCell}
        <div class="ssum2-groups">${groupCells}</div>
      </div>`;
    }).join("");

    return card("Shift summary", `<div class="ssum2">
      <div class="ssum2-cols ssum2-head">
        <div class="ssum-eyebrow">${icon("clock")} Shift period</div>
        <div class="ssum-eyebrow">${icon("users")} Shift group · division &amp; people</div>
      </div>
      ${frames}
    </div>`, { icon: "pulse" });
  }

  /* ====================================================================
     2) SHIFT CONTROL — Shift Period · Group of People · Shift Group
     ==================================================================== */
  function shiftControl(o) {
    const persona = o.persona, device = o.device || "web", canEdit = !!o.canEdit;
    const sc = SC();
    const periods = sc.periods(), groups = sc.groups(), sgs = sc.shiftGroups();

    if (device === "mobile") {
      return {
        title: "Shift control", back: o.back,
        body: `${!canEdit ? card("Read-only", `<p class="small muted">Managers can roster and approve swaps, but only HR defines shift periods and groups. View only.</p>`, { icon: "lock" }) : ""}
        ${card("Shift periods", U.rowlist(periods.map(p => U.rowitem({ icon: "clock", title: esc(p.name), sub: `${p.start}–${p.end} · ${(p.days || []).join(" ")}`, side: U.badge("active") }))), { icon: "clock" })}
        ${card("Groups", U.rowlist(groups.map(g => U.rowitem({ icon: "users", title: esc(g.name), sub: `${esc(g.kind)} · ${(g.members || []).length} people`, side: g.div ? `<span class="badge acc plain">${esc(g.div)}</span>` : "" }))), { icon: "users" })}
        ${card("Shift groups", U.rowlist(sgs.map(s => U.rowitem({ icon: "calendar", title: esc(s.label), sub: `cap ${s.cap}`, side: U.badge("published") }))), { icon: "calendar" })}`
      };
    }

    const readNote = !canEdit
      ? card("Read-only for managers", `<p class="small muted">Shift periods, people groups and shift-group bindings are HR-defined master data. Managers roster against them and approve swaps — but cannot create or edit them here.</p>`, { icon: "lock", cls: "row-locked" })
      : "";

    /* ---- Shift Period ---- */
    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const periodTbl = table(
      [{ h: "ID" }, { h: "Name" }, { h: "Hours" }, { h: "Days" }, { h: "Kind" }],
      periods.map(p => ({ cells: [U.idtag(p.id), esc(p.name), `<span class="num">${p.start}–${p.end}</span>`, `<span class="small">${(p.days || []).join(" ")}</span>`, `<span class="small muted">${esc(p.kind)}</span>`] }))
    );
    const timeOpts = (() => { let o = ""; for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) { const v = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); o += `<option value="${v}">${v}</option>`; } return o; })();
    const periodForm = canEdit ? card("Create a shift period", `
      <div id="sched-periodf" class="pv-form" style="max-width:640px">
        <div class="field"><label>Name</label><input class="input" data-f="name" placeholder="e.g. Evening · Line C"></div>
        <div class="field"><label>Days</label><div class="choice-row">${dows.map(d => `<label class="checkpill"><input type="checkbox" data-day="${d}"${["Mon", "Tue", "Wed", "Thu", "Fri"].includes(d) ? " checked" : ""}> ${d}</label>`).join("")}</div></div>
        <div class="grid cols-2" style="gap:12px">
          <div class="field"><label>Start</label><select class="input" data-f="start">${timeOpts.replace('value="08:00"', 'value="08:00" selected')}</select></div>
          <div class="field"><label>End</label><select class="input" data-f="end">${timeOpts.replace('value="17:00"', 'value="17:00" selected')}</select></div>
        </div>
        <div class="field"><label>Kind</label><select class="input" data-f="kind"><option value="full-day">Full-day</option><option value="shift">Shift</option></select></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="sched-period-add">${icon("plus")} Create period</button></div>
      <p class="small muted" style="margin-top:8px">30-minute granularity over a 24-hour day. An end earlier than the start is treated as overnight.</p>`, { icon: "clock" }) : "";

    /* ---- Group of People ---- */
    const allEmp = window.DATA ? DATA.employees : sc.groups().flatMap(g => sc.groupMembers(g.id));
    const groupTbl = table(
      [{ h: "ID" }, { h: "Name" }, { h: "Kind" }, { h: "Division" }, { h: "Members", r: 1 }],
      groups.map(g => ({ cells: [U.idtag(g.id), esc(g.name), `<span class="small muted">${esc(g.kind)}</span>`, g.div ? `<span class="badge acc plain">${esc(g.div)}</span>` : "—", `<span class="num">${(g.members || []).length}</span>`] }))
    );
    const groupForm = canEdit ? card("Create a group of people", `
      <div id="sched-groupf" class="pv-form" style="max-width:640px">
        <div class="field"><label>Group name</label><input class="input" data-f="name" placeholder="e.g. Line C crew"></div>
        <div class="field"><label>Kind</label><select class="input" data-f="kind"><option value="position">Position</option><option value="division">Division</option><option value="individual">Individual</option><option value="manual" selected>Manual</option></select></div>
        <div class="field"><label>Division (optional)</label><select class="input" data-f="div"><option value="">—</option>${sc.divisions().map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}</select></div>
        <div class="field"><label>Members</label><select class="input" data-f="members" multiple size="6">${allEmp.map(e => `<option value="${e.id}">${esc(e.name)} · ${esc(e.div || e.pos || "")}</option>`).join("")}</select><span class="hint">Cmd/Ctrl-click to pick several.</span></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="sched-group-add">${icon("plus")} Create group</button></div>`, { icon: "users" }) : "";

    /* ---- Shift Group (binding) ---- */
    const sgTbl = table(
      [{ h: "ID" }, { h: "Label" }, { h: "Period" }, { h: "Group" }, { h: "Cap", r: 1 }],
      sgs.map(s => { const p = sc.period(s.period), g = sc.group(s.group); return { cells: [U.idtag(s.id), esc(s.label), `<span class="small">${esc(p ? p.name : s.period)}</span>`, `<span class="small">${esc(g ? g.name : s.group)}</span>`, `<span class="num">${s.cap}</span>`] }; })
    );
    const sgForm = canEdit ? card("Bind a shift group", `
      <div id="sched-sgf" class="pv-form" style="max-width:640px">
        <div class="field"><label>Label</label><input class="input" data-f="label" placeholder="e.g. Line C · Evening"></div>
        <div class="grid cols-2" style="gap:12px">
          <div class="field"><label>Shift period</label><select class="input" data-f="period">${periods.map(p => `<option value="${p.id}">${esc(p.name)} · ${p.start}–${p.end}</option>`).join("")}</select></div>
          <div class="field"><label>Group of people</label><select class="input" data-f="group">${groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>Capacity</label><input class="input" data-f="cap" type="number" min="1" value="4"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="sched-sg-add">${icon("plus")} Create shift group</button></div>
      <p class="small muted" style="margin-top:8px">A shift group binds one period to one people-group with a head-count cap — the unit you roster and the Shift-CAP meter tracks.</p>`, { icon: "calendar" }) : "";

    return {
      title: "Shift control", sub: "Define the building blocks: shift periods (Mon–Sun × 24h), people groups, and the shift-group bindings you roster against.",
      body: `
        ${readNote}
        <div class="grid cols-4">
          ${kpi("Shift periods", String(periods.length), "Mon–Sun × 24h", { hero: 1 })}
          ${kpi("People groups", String(groups.length), "position · division · manual")}
          ${kpi("Shift groups", String(sgs.length), "period × group × cap")}
          ${kpi("Rostered slots", String(sc.roster().length), "across the month")}
        </div>
        ${shiftSummary()}
        <div class="grid cols-3" style="margin-top:4px">
          <div class="span-2">${card("Shift periods", periodTbl, { icon: "clock" })}</div>
          <div>${periodForm || card("Shift periods", `<p class="small muted">HR-defined. View only.</p>`, { icon: "lock" })}</div>
        </div>
        <div class="grid cols-3">
          <div class="span-2">${card("Groups of people", groupTbl, { icon: "users" })}</div>
          <div>${groupForm || card("Groups", `<p class="small muted">HR-defined. View only.</p>`, { icon: "lock" })}</div>
        </div>
        <div class="grid cols-3">
          <div class="span-2">${card("Shift groups", sgTbl, { icon: "calendar" })}</div>
          <div>${sgForm || card("Shift groups", `<p class="small muted">HR-defined. View only.</p>`, { icon: "lock" })}</div>
        </div>`
    };
  }

  /* ====================================================================
     3) STAFF & DIVISION — tabs (All staff + one per division)
     ==================================================================== */
  function staffDivision(o) {
    const persona = o.persona, device = o.device || "web", canEdit = !!o.canEdit;
    const sc = SC();
    const divs = sc.divisions();
    const allEmp = window.DATA ? DATA.employees : [];
    const active = o.param && (o.param === "all" || divs.includes(o.param)) ? o.param : "all";
    const inDiv = active === "all" ? allEmp : allEmp.filter(e => e.div === active);

    if (device === "mobile") {
      return {
        title: "Staff & division", back: o.back,
        body: `${card("Divisions", U.rowlist(divs.map(d => U.rowitem({ icon: "building", title: esc(d), sub: `${allEmp.filter(e => e.div === d).length} staff`, side: "" }))), { icon: "building" })}
        ${card("All staff", U.rowlist(allEmp.slice(0, 12).map(e => U.rowitem({ icon: "user", title: esc(e.name), sub: `${esc(e.pos || "")} · ${esc(e.div || "")}`, side: "" }))), { icon: "users" })}`
      };
    }

    const tabBtn = (id, label, n) => `<button role="tab" aria-pressed="${active === id}" data-go="${persona}/${device}/sched-staff/${id === "all" ? "all" : encodeURIComponent(id)}">${esc(label)}${n != null ? ` <b class="num">${n}</b>` : ""}</button>`;
    const tabs = `<div class="seg sm" role="tablist" aria-label="Division" style="flex-wrap:wrap;border-radius:14px">
      ${tabBtn("all", "All staff", allEmp.length)}
      ${divs.map(d => tabBtn(d, d, allEmp.filter(e => e.div === d).length)).join("")}
    </div>`;

    const staffTbl = inDiv.length ? table(
      [{ h: "Staff" }, { h: "Position" }, { h: "Division" }, { h: "Team" }, canEdit ? { h: "", r: 1 } : { h: "State", r: 1 }],
      inDiv.map(e => ({
        cells: [
          `<span class="strong">${esc(e.name)}</span> <span class="mono small muted">${e.id}</span>`,
          `<span class="small">${esc(e.pos || "—")}</span>`,
          `<span class="badge acc plain">${esc(e.div || "—")}</span>`,
          `<span class="small muted">${esc(e.team && e.team !== "—" ? e.team : "—")}</span>`,
          canEdit
            ? `<select class="input sm sched-divsel" data-emp="${e.id}"><option value="">Move to…</option>${divs.filter(d => d !== e.div).map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("")}</select>`
            : U.badge(e.state)
        ]
      }))
    ) : empty("users", "No staff in this division", "Pick another tab.");

    const createDiv = canEdit ? card("Create a division", `
      <div id="sched-divf" class="pv-form" style="max-width:420px">
        <div class="field"><label>Division name</label><input class="input" data-f="name" placeholder="e.g. Quality"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="sched-div-add">${icon("plus")} Create division</button></div>
      <p class="small muted" style="margin-top:8px">A division lives on the person (db_people) — never duplicated into the roster. Assigning someone writes their record.</p>`, { icon: "building" }) : "";

    return {
      title: "Staff & division", sub: "Who belongs where. Tabs filter by division; reassigning a person writes db_people — the roster reads it as a lens.",
      actions: canEdit ? `<button class="btn soft" data-go="${persona}/web/sched-control">${icon("users")} People groups</button>` : "",
      body: `
        <div class="grid cols-4">
          ${kpi("Divisions", String(divs.length), "on the org", { hero: 1 })}
          ${kpi("Staff on file", String(allEmp.length), "across divisions")}
          ${kpi("In view", String(inDiv.length), active === "all" ? "all staff" : esc(active))}
          ${kpi("People groups", String(sc.groups().length), "roster units")}
        </div>
        ${tabs}
        <div class="grid cols-3" style="margin-top:4px">
          <div class="span-2">${card(active === "all" ? "All staff" : active + " · staff", staffTbl, { icon: "users" })}</div>
          <div>${createDiv || card("Divisions", U.rowlist(divs.map(d => U.rowitem({ icon: "building", title: esc(d), sub: `${allEmp.filter(e => e.div === d).length} staff`, side: "" }))), { icon: "building" })}</div>
        </div>`
    };
  }

  /* ====================================================================
     4) SHIFT MANAGEMENT — per-day Shift-CAP frames + data summary
     ==================================================================== */
  function shiftManage(o) {
    const persona = o.persona, device = o.device || "web";
    const sc = SC();
    const st = calState({ param: o.param, scope: o.scope || "all", perspective: o.perspective, persona, canEdit: !!o.canEdit });
    const scope = st.scope;
    st.device = device; st.screen = "sched-manage"; // inline week expand link target
    const fixedScope = !!o.scope && o.scope !== "all";
    const dateISO = st.dateISO || SEED_DATE;
    const sgs = sc.shiftGroups();
    const capMeter = (sgId) => {
      const c = sc.capForDate(sgId, dateISO); const sg = sc.shiftGroup(sgId);
      return `<div class="shift-cap ${c.tone}">
        <div class="sc-track"><span style="width:${Math.min(100, c.pct)}%"></span></div>
        <span class="sc-figs">${c.assigned}/${c.cap}</span>
      </div>`;
    };

    if (device === "mobile") {
      return {
        title: "Shift management", back: o.back,
        body: `${card("Coverage · " + esc(dateISO), U.rowlist(sgs.map(s => U.rowitem({ icon: "calendar", title: esc(s.label), sub: `cap ${s.cap}`, side: `<span class="num">${sc.capForDate(s.id, dateISO).assigned}/${s.cap}</span>` }))), { icon: "calcheck" })}`
      };
    }

    const sum = sc.summary({ date: dateISO });
    const capCards = sgs.map(s => {
      const c = sc.capForDate(s.id, dateISO); const p = sc.period(s.period);
      const tone = c.tone === "bad" ? "bad" : c.tone === "warn" ? "warn" : "ok";
      return `<div class="card" style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span class="strong small">${esc(s.label)}</span>${U.badge(c.tone === "bad" ? "flagged" : c.tone === "warn" ? "pending" : "ok")}
        </div>
        <div class="small muted">${p ? p.start + "–" + p.end : ""} · ${c.free} free</div>
        ${capMeter(s.id)}
      </div>`;
    }).join("");

    return {
      title: "Shift management", sub: "Coverage at a glance — each shift group's Shift-CAP for the day, with a live data summary under the calendar.",
      actions: perspSwitch(persona, device, st.perspective, st.dateISO, fixedScope ? "all" : scope, "sched-manage"),
      body: `
        ${fixedScope ? "" : statusFilter(persona, device, scope, st.perspective, st.dateISO, "sched-manage")}
        ${CC().render(st)}
        ${card("Shift-CAP · " + esc(dateISO), `<div class="grid cols-3" style="gap:12px">${capCards}</div>`, { icon: "calcheck" })}
        ${card("Data summary — " + esc(dateISO), `<div class="cal-quick sched-summary">
          ${["Total staff|" + sum.total + "|", "Active|" + sum.active + "|ok", "Leave|" + sum.leave + "|warn", "Available|" + sum.available + "|acc", "On shift|" + sum.onShift + "|"].map(s => { const [l, v, tn] = s.split("|"); return `<div class="qv-cell ${tn}"><span class="qv-n num">${v}</span><span class="qv-l">${esc(l)}</span></div>`; }).join("")}
        </div>`, { icon: "pulse" })}`
    };
  }

  /* ====================================================================
     5) SHIFT SWAPS — HR/Manager approval queue · Staff request form
     ==================================================================== */
  function swapRows() {
    try { return (DB.list("db_workflow", "requests") || []).filter(r => r.type === "Swap"); } catch (e) { return []; }
  }
  function swaps(o) {
    const persona = o.persona, device = o.device || "web", canEdit = !!o.canEdit;
    const sc = SC();
    const reqs = swapRows();
    const pending = reqs.filter(r => r.status === "pending");

    /* ---------- Staff: request a swap ---------- */
    if (!canEdit) {
      const meId = (window.DATA && DATA.me && DATA.me.staff && DATA.me.staff.id) || "EMP-0214";
      const myShifts = sc.roster({ emp: meId, from: "2026-06-01", to: "2026-06-30" });
      const colleagues = (window.DATA ? DATA.employees : []).filter(e => e.id !== meId);
      const mine = reqs.filter(r => r.swap && r.swap.from === meId);

      const form = myShifts.length ? `
        <div id="sched-swapf" class="pv-form" style="max-width:560px">
          <div class="field"><label>My upcoming shift</label><select class="input" data-f="shift">${myShifts.map(r => { const sg = sc.shiftGroup(r.sg); return `<option value="${r.date}|${r.sg}">${esc(r.date)} · ${esc((sg && sg.label) || r.sg)}</option>`; }).join("")}</select></div>
          <div class="field"><label>Swap to</label><select class="input" data-f="to">${colleagues.map(e => `<option value="${e.id}">${esc(e.name)} · ${esc(e.div || e.pos || "")}</option>`).join("")}</select></div>
          <div class="field"><label>Reason</label><input class="input" data-f="reason" placeholder="e.g. Family appointment"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-act="sched-swap-req">${icon("swap")} Request swap</button></div>
        <p class="small muted" style="margin-top:8px">Your manager approves swaps. On approval the roster updates automatically — no other store changes.</p>`
        : empty("calendar", "No upcoming shifts", "Nothing to swap right now.");

      const hist = mine.length ? U.rowlist(mine.map(r => U.rowitem({ icon: "swap", title: `${U.idtag(r.id)} ${esc(r.detail)}`, sub: r.note || "", side: U.badge(r.status) }))) : empty("history", "No swap requests yet", "Your requests will show here.");

      if (device === "mobile") {
        return { title: "Shift swap", back: o.back, body: `${card("Request a swap", form, { icon: "swap" })}${card("My swaps", hist, { icon: "history" })}` };
      }
      return {
        title: "Shift swaps", sub: "Hand a shift to a colleague — your manager approves, then the roster updates itself.",
        body: `${card("Request a swap", form, { icon: "swap" })}${card("My swap history", hist, { icon: "history" })}`
      };
    }

    /* ---------- HR/Manager: approval queue ---------- */
    const impact = (r) => {
      if (!r.swap) return "—";
      const sg = sc.shiftGroup(r.swap.sg);
      return `${esc(sc.empName(r.swap.from))} → ${esc(sc.empName(r.swap.to))}<span class="small muted"> · ${esc(r.swap.date)} · ${esc((sg && sg.label) || r.swap.sg)}</span>`;
    };
    if (device === "mobile") {
      return {
        title: "Shift swaps", back: o.back,
        body: pending.length
          ? card("Pending", U.rowlist(pending.map(r => U.rowitem({ icon: "swap", title: `${U.idtag(r.id)} ${esc(r.who)}`, sub: esc(r.detail), side: `<button class="btn xs ok" data-act="approve:${r.id}">${icon("check")}</button>` }))), { icon: "swap" })
          : card("Pending", empty("check", "No swaps waiting", "All clear."), { icon: "swap" })
      };
    }
    const queue = pending.length ? table(
      [{ h: "ID" }, { h: "Requested by" }, { h: "Roster impact" }, { h: "SLA" }, { h: "", r: 1 }],
      pending.map(r => ({
        cells: [
          U.idtag(r.id), esc(r.who), impact(r), `<span class="small">${esc(r.sla || "—")}</span>`,
          `<span style="display:inline-flex;gap:6px"><button class="btn xs ok" data-act="approve:${r.id}">${icon("check")} Approve</button><button class="btn xs danger" data-act="return:${r.id}">${icon("x")} Return</button></span>`
        ]
      }))
    ) : empty("check", "No swaps waiting", "Approved swaps re-write the roster automatically.");

    const decided = reqs.filter(r => r.status !== "pending");
    const history = decided.length ? U.rowlist(decided.map(r => U.rowitem({ icon: "swap", title: `${U.idtag(r.id)} ${esc(r.who)}`, sub: esc(r.detail), side: U.badge(r.status) }))) : "";

    return {
      title: "Shift swaps", sub: "The swap approval queue. Approving an SW request is the only thing that re-writes a published roster.",
      body: `
        <div class="grid cols-4">
          ${kpi("Pending swaps", String(pending.length), "awaiting you", { hero: 1 })}
          ${kpi("Approved", String(reqs.filter(r => r.status === "approved").length), "roster updated")}
          ${kpi("Returned", String(reqs.filter(r => r.status === "returned").length), "sent back")}
          ${kpi("Total requests", String(reqs.length), "this period")}
        </div>
        ${card("Pending approvals", queue, { icon: "swap" })}
        ${history ? card("Decided", history, { icon: "history" }) : ""}`
    };
  }

  /* ====================================================================
     6) BACKUP / RESTORE — area-scoped to db_schedule (blast radius = 1)
     ==================================================================== */
  function backupRestore(o) {
    const device = o.device || "web";
    let all = []; try { all = DB.backups.all() || []; } catch (e) {}
    const mine = all.filter(b => (b.stores || []).includes("db_schedule"));
    const last = mine[0];

    if (device === "mobile") {
      return {
        title: "Backup", back: o.back,
        body: `${card("db_schedule", `<button class="btn" style="width:100%" data-act="sched-backup-now">${icon("download")} Back up now</button><p class="small muted" style="margin-top:8px">${last ? "Last: " + esc(last.id) + " · " + esc(last.ts) : "No snapshot yet."}</p>`, { icon: "box" })}`
      };
    }

    const snaps = mine.length ? table(
      [{ h: "Snapshot" }, { h: "When" }, { h: "Kind" }, { h: "Rows", r: 1 }, { h: "", r: 1 }],
      mine.map(b => ({ cells: [U.idtag(b.id), `<span class="small">${esc(b.ts)}</span>`, `<span class="small muted">${esc(b.kind)}</span>`, `<span class="num">${b.rows}</span>`, `<button class="btn xs ghost" data-act="sched-restore:${b.id}">${icon("refresh")} Restore</button>`] }))
    ) : empty("box", "No snapshots yet", "Back up db_schedule to create the first one.");

    return {
      title: "Backup & restore", sub: "Area-scoped to the schedule store. A snapshot covers db_schedule only — restoring it never touches people, pay or attendance.",
      actions: `<button class="btn" data-act="sched-backup-now">${icon("download")} Back up now</button>`,
      body: `
        <div class="grid cols-3">
          ${kpi("Schedule snapshots", String(mine.length), "db_schedule only", { hero: 1 })}
          ${kpi("Last backup", last ? esc(last.ts) : "—", last ? esc(last.id) : "none yet")}
          ${kpi("Blast radius", "1 store", "db_schedule")}
        </div>
        ${card("Snapshots that include db_schedule", snaps, { icon: "box" })}
        ${card("Why area-scoped", `<p class="small muted">The schedule store is one of ${(function () { try { return DB.CATALOG.length; } catch (e) { return "13"; } })()} sealed stores. Backing up here writes a snapshot of <b>db_schedule</b> alone — shift periods, groups, bindings, the roster and saved views — so a restore rewinds the roster without disturbing any other module. Full multi-store backups live in the Data manager.</p>`, { icon: "shield" })}`
    };
  }

  /* ====================================================================
     7) PLUG-IN CONNECTOR — manifest of build-phase seams
     ==================================================================== */
  const CONNECTORS = [
    { id: "extcal", icon: "calendar", name: "External calendar", sub: "Google Calendar · Outlook / Microsoft 365", blurb: "Two-way sync of published shifts to a personal calendar so staff see rosters in the tool they already check." },
    { id: "actuals", icon: "grid", name: "Capture-actuals binding", sub: "db_devices — biometric & gate punches", blurb: "Bind a shift group to a capture group so planned shifts reconcile against real clock-in/out actuals." },
    { id: "rostering", icon: "layers", name: "Third-party rostering", sub: "External WFM / scheduling engines", blurb: "Import an externally-optimised roster, or export demand so a specialist engine can solve it." }
  ];
  function connector(o) {
    const device = o.device || "web";
    if (device === "mobile") {
      return {
        title: "Connectors", back: o.back,
        body: card("Plug-ins", U.rowlist(CONNECTORS.map(c => U.rowitem({ icon: c.icon, title: esc(c.name), sub: esc(c.sub), side: `<span class="badge acc plain">build-phase</span>` }))), { icon: "plug" })
      };
    }
    const tbl = table(
      [{ h: "Connector" }, { h: "Target" }, { h: "Status" }, { h: "", r: 1 }],
      CONNECTORS.map(c => ({ cells: [`<span class="strong">${icon(c.icon)} ${esc(c.name)}</span>`, `<span class="small muted">${esc(c.sub)}</span>`, `<span class="badge acc plain">build-phase</span>`, `<button class="btn xs ghost soon" title="Build-phase seam — not wired in this UI preview" data-act="toast:${esc(c.name)} is a build-phase connector — the seam is reserved; wiring lands with the Cloudflare-DB cutover">${icon("settings")} Configure</button>`] }))
    );
    return {
      title: "Plug-in connector", sub: "The integration seam for the schedule cell. Each connector is a reserved stub — clearly labelled build-phase, like the PDF/email stubs in v2.4.3.",
      body: `
        ${card("Connector manifest", tbl, { icon: "plug" })}
        <div class="grid cols-2">
          ${CONNECTORS.map(c => card(c.name, `<p class="small muted">${esc(c.blurb)}</p><div style="margin-top:8px"><span class="badge acc plain">build-phase</span></div>`, { icon: c.icon })).join("")}
        </div>
        ${card("The seam", `<p class="small muted">Connectors read and write only through the Schedule cell — the roster's one writer — so an external source can never bypass capacity or scope rules. Live wiring targets the Cloudflare DB (D1) alongside the rest of the platform; until then these stubs hold the contract.</p>`, { icon: "shield" })}`
    };
  }

  /* ====================================================================
     8) MY SCHEDULE — Staff own roster (read-only) + request-swap entry
     ==================================================================== */
  function myschedule(o) {
    const device = o.device || "web";
    const meId = (window.DATA && DATA.me && DATA.me.staff && DATA.me.staff.id) || "EMP-0214";
    const st = calState({ param: o.param, scope: meId, persona: "staff", canEdit: false });
    st.scope = meId;

    if (device === "mobile") {
      return {
        title: "My shifts", back: o.back,
        body: `${card("Upcoming", agenda(null, meId), { icon: "calendar" })}
        ${card("Need to swap?", `<button class="btn" style="width:100%" data-go="staff/mobile/sched-swaps">${icon("swap")} Request a shift swap</button>`, { icon: "swap" })}`
      };
    }
    return {
      title: "My schedule", sub: "Your published shifts, read-only. Open a week for the hour view, or request a swap if something clashes.",
      actions: `${perspSwitch("staff", "web", st.perspective, st.dateISO, "all", "sched-me")}<button class="btn soft" data-go="staff/web/sched-swaps">${icon("swap")} Request swap</button>`,
      body: `
        ${CC().render(st)}
        ${legend()}
        ${card("Need to swap a shift?", `<p class="small muted" style="margin-bottom:8px">Hand a shift to a colleague — your manager approves, then the roster updates itself.</p><button class="btn sm" data-go="staff/web/sched-swaps">${icon("swap")} Request a shift swap</button>`, { icon: "swap" })}`
    };
  }

  return { calendar, shiftControl, staffDivision, shiftManage, swaps, backupRestore, connector, myschedule };
})();
