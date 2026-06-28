/* ============================================================
   ADEPTIO · v2.4.4 — the CALENDAR CORE  (window.CALCORE)
   ONE render engine, reused by every persona and every
   perspective (month · week · day · people · shift · job).
   PURE functions → HTML strings; no DOM access at module load,
   so tools/smoke.js (node) renders calendars too. It reads the
   roster through the SCHEDULE cell and treats db_time / db_leave
   / db_overtime / db_people as a lens — it never writes them.
   Drag-and-drop is functional in the browser and inert in node:
   chips carry ondragstart, day cells carry ondragover/ondrop, and
   the only writes happen via SCHEDULE.assign() inside drop(), which
   is guarded by typeof document. canEdit:false (Manager/Staff) →
   read-only: no draggable chips, no drop targets, no assign UI.
   Colour maps period.color → the persona tokens via a chip class
   (.is-hr/.is-mgr/.is-staff/.is-ceo) — never a hard-coded hex.
   ============================================================ */
window.CALCORE = (function () {
  const esc = (s) => (window.UI && UI.esc) ? UI.esc(s) : String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = (n, c) => (window.UI && UI.icon) ? UI.icon(n, c) : "";
  const SC = () => window.SCHEDULE || null;

  /* ---------- date helpers (pure) ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  function iso(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseISO(s) { const p = String(s || "").split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const mondayIndex = (d) => (d.getDay() + 6) % 7;       // 0 = Mon … 6 = Sun
  const dowKey = (d) => DOW[mondayIndex(d)];
  function weekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  function mondayOf(d) { const x = new Date(d); x.setDate(x.getDate() - mondayIndex(x)); return x; }
  // weeks[] of 7 day-cells {iso, day, inMonth, week, today}
  function monthMatrix(year, month) {
    const first = new Date(year, month, 1);
    const start = mondayOf(first);
    const todayISO = iso(new Date());
    const weeks = [];
    let cur = new Date(start);
    for (let w = 0; w < 6; w++) {
      const days = [];
      for (let i = 0; i < 7; i++) {
        days.push({ iso: iso(cur), day: cur.getDate(), inMonth: cur.getMonth() === month, week: weekNumber(cur), today: iso(cur) === todayISO });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push({ week: days[0].week, weekStart: days[0].iso, days });
      if (cur.getMonth() !== month && cur > first) break; // trim a trailing all-spill week
    }
    return weeks;
  }

  /* ---------- colour: period.color token → chip class ---------- */
  const colorClass = (c) => ({ hr: "is-hr", mgr: "is-mgr", staff: "is-staff", ceo: "is-ceo" }[c] || "is-hr");

  /* ---------- scope filter for the roster ---------- */
  function inScope(row, state) {
    const scope = state && state.scope;
    if (!scope || scope === "all") return true;
    if (/^EMP-/.test(scope)) return row.emp === scope;             // a person
    if (/^G-/.test(scope)) { const sg = SC().shiftGroup(row.sg); return sg && sg.group === scope; } // a group
    if (/^SG-/.test(scope)) return row.sg === scope;               // a single shift-group
    // otherwise treat scope as a division name
    const sg = SC().shiftGroup(row.sg); const g = sg && SC().group(sg.group);
    return g && g.div === scope;
  }

  /* ---------- a shift chip (draggable when canEdit) ---------- */
  function chip(sgId, dateISO, state) {
    const sc = SC(); const sg = sc.shiftGroup(sgId); if (!sg) return "";
    const p = sc.period(sg.period);
    const cap = sc.capForDate(sgId, dateISO);
    const cls = colorClass(p && p.color) + (cap.tone === "bad" ? " over" : "");
    const edit = state && state.canEdit;
    const drag = edit ? `draggable="true" ondragstart="CALCORE.dragStart(event,'${sgId}','${dateISO}')"` : "";
    const time = p ? `${p.start}–${p.end}` : "";
    return `<div class="shiftchip ${cls}" ${drag} title="${esc(sg.label)} · ${time}">
      <span class="sc-name">${esc(sg.label)}</span>
      <span class="sc-cap">${cap.assigned}/${cap.cap}</span>
    </div>`;
  }

  /* ---------- quick-view strip (total · Active · Leave · Available) ---------- */
  function quickStrip(state) {
    const s = SC().summary({ date: state.dateISO });
    const cell = (label, val, tone) => `<div class="qv-cell ${tone || ""}"><span class="qv-n num">${val}</span><span class="qv-l">${esc(label)}</span></div>`;
    return `<div class="cal-quick sched-summary">
      ${cell("Total staff", s.total)}
      ${cell("Active", s.active, "ok")}
      ${cell("Leave", s.leave, "warn")}
      ${cell("Available", s.available, "acc")}
      ${cell("On shift", s.onShift)}
    </div>`;
  }

  /* ---------- CHANGE LOG (v2.4.4 fine-tune) ----------------------------
     The planned (unpublished) roster moves — what was rostered or dragged
     since the last publish — surfaced on the calendar for review before
     "Publish plan". Scope-aware (reads the same lens as the grid). Only
     rendered when the screen opts in (state.changeLog) and the persona can
     edit; everyone else sees a clean published calendar. */
  function changeLog(state) {
    const sc = SC(); if (!sc) return "";
    let rows = sc.roster({ status: "planned" }).filter(r => inScope(r, state));
    rows = rows.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1));
    const n = rows.length;
    const head = `<div class="clg-head">
      <div class="clg-title">${icon("history")}<span>Change log</span>${n ? `<b class="clg-count">${n}</b>` : ""}</div>
      <div class="clg-actions">
        <span class="clg-note">${n ? "Review these moves, then publish the plan." : "Nothing waiting — the plan is published."}</span>
        ${n ? `<button class="btn xs" data-act="sched-publish-month">${icon("calcheck")} Publish plan</button>` : ""}
      </div>
    </div>`;
    const list = n ? `<ul class="clg-list">${rows.map(r => {
      const sg = sc.shiftGroup(r.sg); const p = sg && sc.period(sg.period);
      return `<li class="clg-row">
        <span class="clg-dot ${colorClass(p && p.color)}"></span>
        <span class="clg-date num">${esc(r.date)}</span>
        <span class="clg-sg">${esc((sg && sg.label) || r.sg)}${p ? `<span class="clg-time"> · ${p.start}–${p.end}</span>` : ""}</span>
        <span class="clg-emp">${esc(sc.empName(r.emp))}</span>
        <span class="clg-badge">planned</span>
        <button class="clg-x" title="Remove this planned shift" data-act="sched-unassign:${r.id}">${icon("x")}</button>
      </li>`;
    }).join("")}</ul>`
      : `<div class="clg-empty">${icon("calcheck")}<span>New shifts land here as <b>planned</b> until you publish — your edit trail for the month.</span></div>`;
    return `<section class="cal-changelog" aria-label="Change log — planned shifts to review">${head}${list}</section>`;
  }

  /* ---------- INLINE WEEK EXPAND (v2.4.4 fine-tune) --------------------
     Clicking a week rail opens that week in place inside the month page
     (the route carries month.<weekStartISO>; app.js toggles it). A compact
     per-day plan — each day's shift groups with the people on them — so the
     month stays the home view and the week unfolds without a context switch. */
  function weekInline(state, weekStartISO, wkNo) {
    const sc = SC(); if (!sc) return "";
    const monday = mondayOf(parseISO(weekStartISO));
    const todayISO = iso(new Date());
    let total = 0;
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(d.getDate() + i);
      const dISO = iso(d);
      const rows = sc.rosterForDate(dISO).filter(r => inScope(r, state));
      total += rows.length;
      const shifts = [...new Set(rows.map(r => r.sg))].map(id => {
        const sg = sc.shiftGroup(id); const p = sg && sc.period(sg.period);
        const who = rows.filter(r => r.sg === id);
        return `<div class="cwx-shift ${colorClass(p && p.color)}">
          <div class="cwx-shead"><span class="cwx-slabel">${esc((sg && sg.label) || id)}</span><span class="cwx-scap num">${who.length}${sg ? "/" + sg.cap : ""}</span></div>
          ${p ? `<div class="cwx-stime">${p.start}–${p.end}</div>` : ""}
          <ul class="cwx-people">${who.map(r => `<li>${esc(sc.empName(r.emp))}${r.status === "planned" ? `<i class="cwx-plan" title="planned — not yet published"></i>` : ""}</li>`).join("")}</ul>
        </div>`;
      }).join("");
      cols.push(`<div class="cwx-day${dISO === todayISO ? " today" : ""}">
        <div class="cwx-dhead"><span class="cwx-dow">${dowKey(d)}</span><span class="cwx-dnum num">${d.getDate()}</span></div>
        <div class="cwx-shifts">${shifts || `<div class="cwx-none">—</div>`}</div>
      </div>`);
    }
    const canLink = state.canEdit && state.screen && state.device;
    const link = canLink
      ? `<button class="btn xs ghost" data-go="${esc(state.persona || "hr")}/${esc(state.device)}/${esc(state.screen)}/week.${esc(weekStartISO)}${state.scope && state.scope !== "all" ? "~" + encodeURIComponent(state.scope) : ""}">${icon("calendar")} Hour grid</button>`
      : "";
    return `<div class="cal-weekexpand" data-week="${esc(weekStartISO)}">
      <div class="cwx-head"><span class="cwx-title">Week ${wkNo} · plan</span>${link}</div>
      <div class="cwx-days">${cols.join("")}</div>
      ${total ? "" : `<div class="cwx-empty">No shifts planned in week ${wkNo} for this view.</div>`}
    </div>`;
  }

  /* ---------- MONTH (the standard view) ---------- */
  function month(state) {
    const sc = SC(); if (!sc) return "";
    const y = state.year, m = state.month;
    const weeks = monthMatrix(y, m);
    const edit = !!state.canEdit;
    // v2.4.4 fine-tune — the open week (inline expand) rides on the route param: month.<weekStartISO>
    const openWeek = ((state.perspective === "month" || !state.perspective) && state.dateISO)
      ? iso(mondayOf(parseISO(state.dateISO))) : "";
    const head = `<div class="cal-head"><div class="cal-title">${MON[m]} ${y}</div>
      <div class="cal-dows">${DOW.map(d => `<span>${d}</span>`).join("")}</div></div>`;
    const body = weeks.map(wk => {
      const isOpen = openWeek && wk.weekStart === openWeek;
      const rail = `<button class="cal-wk${isOpen ? " open" : ""}" data-sched-week="${wk.weekStart}" aria-expanded="${isOpen ? "true" : "false"}" title="${isOpen ? "Collapse" : "Open"} week ${wk.week}">W${wk.week}</button>`;
      const cells = wk.days.map(c => {
        const rows = sc.rosterForDate(c.iso).filter(r => inScope(r, state));
        const sgs = [...new Set(rows.map(r => r.sg))];
        const chips = sgs.map(id => chip(id, c.iso, state)).join("");
        const dropAttr = edit ? `ondragover="CALCORE.allow(event)" ondrop="CALCORE.drop(event,'${c.iso}','')"` : "";
        return `<div class="cal-day ${c.inMonth ? "" : "muted"} ${c.today ? "today" : ""}" data-iso="${c.iso}" ${dropAttr}>
          <div class="cd-num">${c.day}</div>
          <div class="cd-chips">${chips || (c.inMonth ? "" : "")}</div>
        </div>`;
      }).join("");
      const row = `<div class="cal-weekrow${isOpen ? " open" : ""}">${rail}<div class="cal-week7">${cells}</div></div>`;
      return isOpen ? row + weekInline(state, wk.weekStart, wk.week) : row;
    }).join("");
    return `<div class="calwrap cal-month" data-perspective="month">
      ${quickStrip(state)}
      ${(state.canEdit && state.changeLog) ? changeLog(state) : ""}
      ${head}
      <div class="cal-weekrail">${body}</div>
    </div>`;
  }

  /* ---------- hour-split shared by week & day ---------- */
  const H_START = 6, H_END = 22;
  const hourRows = () => { const a = []; for (let h = H_START; h <= H_END; h++) a.push(h); return a; };
  function minsOf(t) { const p = String(t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  // a positioned shift block inside an hour lane (top/height in % of the hour-grid)
  function block(row, state) {
    const sc = SC(); const p = row.periodObj; if (!p) return "";
    const span = (H_END - H_START + 1) * 60;
    let s = minsOf(p.start) - H_START * 60;
    let e = minsOf(p.end) - H_START * 60;
    if (e <= s) e = span;                       // overnight clamp to the visible window
    s = Math.max(0, s); e = Math.min(span, e);
    const top = (s / span) * 100, height = Math.max(3, ((e - s) / span) * 100);
    const cls = colorClass(p.color);
    const who = row.person ? row.person.name : row.emp;
    return `<div class="cal-block ${cls}" style="top:${top.toFixed(1)}%;height:${height.toFixed(1)}%" title="${esc(row.label)} · ${p.start}–${p.end}">
      <span class="cb-t">${esc(row.label)}</span><span class="cb-w">${esc(who)}</span>
    </div>`;
  }
  // lanes: per-shift (one lane per shift-group) or per-person, depending on perspective
  function laneFor(dateISO, state) {
    const sc = SC();
    let rows = sc.rosterForDate(dateISO).filter(r => inScope(r, state));
    const byPerson = state.perspective === "people" || state.perspective === "day";
    const keys = byPerson
      ? [...new Set(rows.map(r => r.emp))].map(id => ({ id, label: sc.empName(id), rows: rows.filter(r => r.emp === id) }))
      : [...new Set(rows.map(r => r.sg))].map(id => { const sg = sc.shiftGroup(id); return { id, label: (sg && sg.label) || id, rows: rows.filter(r => r.sg === id) }; });
    const edit = !!state.canEdit;
    return keys.map(k => {
      const drop = edit && !byPerson ? `ondragover="CALCORE.allow(event)" ondrop="CALCORE.drop(event,'${dateISO}','${k.id}')"` : "";
      return `<div class="cal-lane" data-lane="${k.id}" ${drop}>
        <div class="cl-head">${esc(k.label)}</div>
        <div class="cl-grid">${hourRows().map(() => `<div class="cl-hr"></div>`).join("")}${k.rows.map(r => block(r, state)).join("")}</div>
      </div>`;
    }).join("") || `<div class="cal-lane empty"><div class="cl-head">No shifts</div><div class="cl-grid">${hourRows().map(() => `<div class="cl-hr"></div>`).join("")}</div></div>`;
  }
  function hourAxis() {
    return `<div class="cal-hours">${hourRows().map(h => `<div class="cal-hour"><span>${pad(h)}:00</span></div>`).join("")}</div>`;
  }

  /* ---------- WEEK (expanded, working-hour rows) ---------- */
  function week(state) {
    const sc = SC(); if (!sc) return "";
    const start = parseISO(state.weekStartISO || state.dateISO || iso(new Date()));
    const monday = mondayOf(start);
    const days = []; for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(d.getDate() + i); days.push(d); }
    const wkNo = weekNumber(monday);
    const cols = days.map(d => {
      const dISO = iso(d);
      return `<div class="cal-daycol">
        <div class="cdc-head"><span class="cdc-dow">${dowKey(d)}</span><span class="cdc-num num">${d.getDate()}</span></div>
        <div class="cdc-lanes">${laneFor(dISO, state)}</div>
      </div>`;
    }).join("");
    return `<div class="calwrap cal-week" data-perspective="${esc(state.perspective || "week")}">
      ${quickStrip({ ...state, dateISO: iso(monday) })}
      <div class="cal-head"><div class="cal-title">Week ${wkNo} · ${MON[monday.getMonth()]} ${monday.getFullYear()}</div>
        <div class="cal-sub">${state.perspective === "people" ? "Per-person lanes" : "Per-shift lanes"} · ${pad(H_START)}:00–${pad(H_END)}:00</div></div>
      <div class="tablewrap"><div class="cal-weekgrid">
        ${hourAxis()}
        <div class="cal-daycols">${cols}</div>
      </div></div>
    </div>`;
  }

  /* ---------- DAY (single day, hour-split) ---------- */
  function day(state) {
    const sc = SC(); if (!sc) return "";
    const dISO = state.dateISO || iso(new Date());
    const d = parseISO(dISO);
    return `<div class="calwrap cal-week cal-day" data-perspective="day">
      ${quickStrip({ ...state, dateISO: dISO })}
      <div class="cal-head"><div class="cal-title">${dowKey(d)} · ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}</div>
        <div class="cal-sub">${pad(H_START)}:00–${pad(H_END)}:00</div></div>
      <div class="tablewrap"><div class="cal-weekgrid">
        ${hourAxis()}
        <div class="cal-daycols"><div class="cal-daycol wide"><div class="cdc-lanes">${laneFor(dISO, state)}</div></div></div>
      </div></div>
    </div>`;
  }

  /* ---------- dispatcher ---------- */
  function render(state) {
    state = state || {};
    if (!SC()) return `<div class="calwrap"><div class="empty">Schedule cell not loaded.</div></div>`;
    if (state.year == null) state.year = (state.dateISO ? parseISO(state.dateISO) : new Date()).getFullYear();
    if (state.month == null) state.month = (state.dateISO ? parseISO(state.dateISO) : new Date()).getMonth();
    switch (state.perspective) {
      case "week": return week(state);
      case "day": return day(state);
      case "people": return week({ ...state, perspective: "people" });
      case "shift": return week({ ...state, perspective: "shift" });
      case "job": return month(state);
      case "month":
      default: return month(state);
    }
  }

  /* ---------- drag & drop (functional in browser · inert in node) ---------- */
  function dragStart(ev, sgId, dateISO) {
    if (typeof document === "undefined" || !ev) return;
    try {
      ev.dataTransfer.setData("text/plain", JSON.stringify({ sg: sgId, from: dateISO }));
      ev.dataTransfer.effectAllowed = "move";
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add("dragging");
    } catch (e) {}
  }
  function allow(ev) {
    if (typeof document === "undefined" || !ev) return;
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = "move"; if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add("drop-hot"); } catch (e) {}
  }
  function drop(ev, dateISO, sgId) {
    if (typeof document === "undefined" || !ev) return;
    ev.preventDefault();
    let payload = {};
    try { payload = JSON.parse(ev.dataTransfer.getData("text/plain") || "{}"); } catch (e) {}
    if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove("drop-hot");
    const sc = SC(); if (!sc) return;
    const targetSg = sgId || payload.sg;        // dropping on a day keeps the chip's own shift-group
    if (!targetSg || !dateISO) return;
    // a chip drag carries no specific person; assign the first free member of the group as a quick-roster gesture
    const sg = sc.shiftGroup(targetSg); if (!sg) return;
    const cap = sc.capForDate(targetSg, dateISO);
    if (cap.free <= 0) { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} return; }
    const members = sc.groupMembers(sg.group);
    const taken = new Set(sc.roster({ date: dateISO, sg: targetSg }).map(r => r.emp));
    const free = members.find(p => !taken.has(p.id));
    if (free) sc.assign(dateISO, targetSg, free.id);
    try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {}
  }

  return {
    iso, parseISO, monthMatrix, weekNumber,
    render, month, week, day,
    colorClass, dragStart, allow, drop
  };
})();
