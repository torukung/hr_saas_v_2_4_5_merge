/* ============================================================
   ADEPTIO · STAFF persona (ESS) — ochre
   Web: My day · Time · Requests(→new→detail) · Payslips(→detail)
        · Documents · Me
   Mobile: Home · Time · Requests · Me (+ drill screens)
   ============================================================ */
(function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, table, steps, empty, avatar, sparkline, heatcal, kip } = UI;

  const statusBadge = (r) => badge(r.status);

  /* v2.3.2.db — acting-user picker: ANY row of db_people can drive this lens.
     New hires appear here the moment HR creates them. */
  function userPicker() {
    const cur = DATA.me.staff.id;
    return `<select class="input sm staff-pick" title="Demo — act as any user from db_people" aria-label="Acting staff user">
      ${DATA.employees.map(e => `<option value="${e.id}" ${e.id === cur ? "selected" : ""}>${e.name} · ${e.id}</option>`).join("")}</select>`;
  }
  function userPickerCard() {
    return card("Acting as — pick a user from db_people", `
      ${userPicker()}
      <p class="small muted" style="margin-top:10px">${DATA.me.staff.status === "probation" ? `<span class="badge warn plain">probation</span> ` : ""}Every Staff screen — requests, payslips, punches, documents, KPIs — re-reads the selected user's rows from the split stores. Hire someone in HR → People and they're selectable here immediately.</p>`, { icon: "user" });
  }

  /* ---------- shared fragments ---------- */
  function requestRows(device, filter) {
    let rs = DATA.mine();
    if (filter && filter !== "All") rs = rs.filter(r => r.type === filter);
    if (!rs.length) return `<p class="small muted">No ${filter && filter !== "All" ? filter.toLowerCase() : ""} requests yet.</p>`;
    return rowlist(rs.map(r => rowitem({
      icon: ({ Leave: "calendar", Overtime: "clock", Claim: "receipt", Correction: "edit", Advance: "banknote" }[r.type]) || "inbox",
      title: `${r.detail}`,
      sub: `${r.id} · ${r.dates} · ${r.stage}`,
      side: statusBadge(r),
      go: `staff/${device}/request-detail/${r.id}`
    })));
  }

  // v2.4.2 — the staff member's clock methodology, inherited from their capture group
  function clockMethod() {
    if (typeof DEVICES === "undefined" || !DATA.has("biometrics")) return null;
    const g = DEVICES.groupOf(DATA.me.staff.id);
    if (!g) return null;
    const md = DEVICES.methodById(g.primary);
    const dev = (g.devices && g.devices[0]) ? DEVICES.deviceById(g.devices[0]) : null;
    return { g, md, dev };
  }
  function clockCard() {
    const s = DATA.state, cm = clockMethod();
    let geo = `${icon("pin")} Vientiane Plant 1 · inside geofence · GPS ✓`;
    if (cm) {
      const tail = cm.dev ? ` · ${cm.dev.zone} (${cm.dev.id})` : cm.g.primary === "mobile" ? ` · geofence ${cm.g.geofence} m · GPS ✓` : cm.g.primary === "web" ? "" : "";
      geo = `${icon(cm.md.icon)} ${cm.md.label}${tail}`;
    }
    return `<div class="clock-hero">
      <div class="ch-line">
        <div>
          <div class="ch-sub">${s.clockedIn ? "Clocked in · " + s.clockIn : "Not clocked in"}</div>
          <div class="ch-time">08:31<span style="font-size:15px;opacity:.7"> AM</span></div>
        </div>
        <button class="ch-btn" data-act="clock">${icon(s.clockedIn ? "logout" : "clock")} ${s.clockedIn ? "Clock out" : "Clock in"}</button>
      </div>
      <div class="geo">${geo}</div>
    </div>`;
  }

  function alertsList(device) {
    const m = device === "mobile";
    const ps = DATA.myPayslips()[0]; // acting user's latest slip, if any
    const payGo = ps ? (m ? "staff/mobile/payslip/" + ps.id : "staff/web/payslips") : (m ? "staff/mobile/me" : "staff/web/payslips");
    const docGo = m ? "staff/mobile/me" : "staff/web/documents";
    const vault = DATA.has("vault");
    return rowlist([
      ps ? rowitem({ icon: "banknote", title: `Payslip for ${ps.period.split(" ")[0]} is ready`, sub: "Net " + kip(ps.net) + " · published " + ps.paid, side: badge("ok"), go: payGo })
         : rowitem({ icon: "banknote", title: "First payslip arrives with the next pay run", sub: "PR-2026-06 · cutoff Jun 25", side: `<span class="badge plain">Upcoming</span>`, neutral: 1, go: payGo }),
      rowitem({ icon: "megaphone", title: "Town hall — Friday 14:00", sub: "Announcement · canteen, Plant 1", side: `<span class="badge plain">In-app</span>`, neutral: 1 }),
      vault
        ? rowitem({ icon: "shield", title: "Acknowledge Code of conduct v4", sub: "Due Jun 20 · 2 min read", side: badge("pending"), go: docGo })
        : `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">Policy acknowledgements & doc-expiry alerts</div><div class="rs">Documents Vault</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("vault"))}</div></div>`
    ]);
  }

  function payslipDetailBody(id, device) {
    const p = DATA.payslips.find(x => x.id === id) || DATA.payslips[0];
    const rows = p.lines.map(l => ({ cells: [l[0], `<span class="num">${kip(l[1])}</span>`] }))
      .concat(p.deds.map(l => ({ cells: [l[0], `<span class="num" style="color:var(--bad)">− ${kip(-l[1])}</span>`] })));
    return `
      <div class="grid cols-3">
        ${kpi("Net pay", `<span class="num">${kip(p.net)}</span>`, `Paid ${p.paid} · BCEL ··4821`, { hero: 1 })}
        ${kpi("Gross", kip(p.gross), "Before tax & SSO")}
        ${kpi("Deductions", kip(p.gross - p.net), "PIT + social security")}
      </div>
      ${card("Earnings & deductions — " + p.period, table(
        [{ h: "Pay code" }, { h: "Amount", r: 1 }], rows
      ) + `<hr class="hr-sep"><div style="display:flex;justify-content:space-between;font-weight:800;font-size:13.5px;padding:0 12px"><span>Net pay</span><span class="num">${kip(p.net)}</span></div>`, { icon: "banknote" })}
      ${card("About this payslip", `<p class="small muted">Generated by pay run ${idtag("PR-" + p.id.slice(3))} from the payroll cell · PIT and social security follow the Lao statutory pack · serialized ${idtag(p.id)} and audit-logged. Tax & SSO breakdown is itemised above — one ledger line per pay code.</p>`, { icon: "shield" })}`;
  }

  /* ---------- WEB screens ---------- */
  // v2.4.5 G4 — Staff earned-to-date tile (gated by FLAGS.etd); offers the advance entry when FLAGS.ewa is on. Node-safe.
  function etdCard(device) {
    if (typeof PAY === "undefined" || !PAY.earnedToDate || !(window.FLAGS && FLAGS.on("etd"))) return "";
    const e = PAY.earnedToDate(DATA.me.staff.id);
    const ewaOn = !!(window.FLAGS && FLAGS.on("ewa"));
    return UI.card("Earned to date", `
      <div style="margin-bottom:10px"><div class="eyebrow">Earned so far this cycle</div>
        <div class="num" style="font-family:var(--display);font-size:28px;font-weight:550;letter-spacing:-.03em">${UI.kip(e.net)}</div>
        <div class="small muted">of ${UI.kip(e.full)} projected · ${e.pct}% of the pay cycle</div></div>
      ${UI.meter(e.pct, { label: "Pay cycle " + e.pct + "%" })}
      ${ewaOn ? `<div style="margin-top:12px"><button class="btn sm" data-go="staff/${device || "web"}/advance">${icon("banknote")} Request an advance</button></div>` : ""}`,
      { icon: "banknote" });
  }

  const web = {
    home() {
      const m = DATA.me.staff;
      return {
        title: "Good morning, " + m.name.split(" ")[0], sub: `Wednesday, June 10 2026 · ${m.role} · everything that needs you, in one place.`,
        actions: `${userPicker()}<button class="btn soft" data-go="staff/web/requests">${icon("plus")} New request</button>`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${clockCard()}
            <div class="grid cols-2">
              ${card("Alerts & actions", alertsList("web"), { icon: "bell", badge: badge("pending") })}
              ${card("My requests", requestRows("web"), { icon: "inbox", link: "staff/web/requests" })}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("My month", heatcal({ until: 10, levels: { 4: "bad" } }) + `<div class="legend" style="margin-top:12px"><span><i style="background:var(--acc-ln)"></i>Present</span><span><i style="background:var(--bad-bg)"></i>Absence</span><span><i style="background:var(--line-2)"></i>Upcoming</span></div>`, { icon: "calendar" })}
            ${card("My KPIs", `
              <div class="rowlist">
                ${rowitem({ icon: "check", title: "Attendance", sub: "Trailing 90 days", side: `<b class="num">${m.attend}%</b>` })}
                ${rowitem({ icon: "clock", title: "Punctuality", sub: "On-time arrivals", side: `<b class="num">96%</b>` })}
                ${rowitem({ icon: "sun", title: "Leave balance", sub: "Annual remaining", side: `<b class="num">${m.leaveBal} d</b>` })}
                ${rowitem({ icon: "sparkle", title: "Training", sub: "Safety track", side: `<b class="num">80%</b>` })}
              </div>`, { icon: "pulse" })}
          </div>
        </div>
        ${card(t("common.quickActions"), `
          <div class="choice-row">
            <button class="choice" data-act="clock">${icon("clock")} Clock in / out</button>
            <button class="choice" data-go="staff/web/request-new/Leave">${icon("calendar")} Request leave</button>
            <button class="choice" data-go="staff/web/request-new/Claim">${icon("receipt")} Submit claim</button>
            <button class="choice" data-go="staff/web/payslips">${icon("banknote")} View payslip</button>
            ${DATA.has("docRequests") ? `<button class="choice" data-go="staff/web/documents">${icon("file")} Request document</button>` : UI.lockChoice("Request document", DATA.unlockLabel("docRequests"))}
          </div>`, { icon: "sparkle" })}`
      };
    },

    time() {
      const cm = clockMethod();
      const inSrc = cm ? (cm.dev ? `${cm.dev.vendor} · ${cm.dev.zone}` : `${cm.md.label}`) : "Mobile · GPS inside geofence";
      return {
        title: "Time & attendance", sub: "Your punches, this month and history — corrections go through the TC flow.",
        actions: `<button class="btn soft" data-go="staff/web/request-new/Correction">${icon("edit")} Request correction</button>`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${clockCard()}
            ${card("Today — Wednesday, Jun 10", rowlist([
          rowitem({ icon: cm ? cm.md.icon : "check", title: "Clock in — 08:30", sub: inSrc, side: badge("ok") }),
          rowitem({ icon: "sun", title: "Lunch — 12:00 to 13:00", sub: "Auto break · unpaid", side: `<span class="badge plain">Scheduled</span>`, neutral: 1 }),
          rowitem({ icon: "clock", title: "Expected out — 17:30", sub: "Shift A · 8h standard", side: `<span class="badge plain">Upcoming</span>`, neutral: 1 })
        ]), { icon: "clock" })}
            ${card("Punch history", table(
          [{ h: "Date" }, { h: "In" }, { h: "Out" }, { h: "Hours", r: 1 }, { h: "Status", r: 1 }],
          [
            { cells: ["Tue, Jun 09", "08:28", "17:32", `<span class="num">8.1</span>`, badge("ok")] },
            { cells: ["Mon, Jun 08", "08:31", "17:30", `<span class="num">8.0</span>`, badge("ok")] },
            { cells: ["Fri, Jun 05", "—", "17:31", `<span class="num">—</span>`, badge("flagged")] },
            { cells: ["Thu, Jun 04", "08:29", "19:40", `<span class="num">10.2</span>`, `<span class="badge acc">OT +2h</span>`] },
            { cells: ["Wed, Jun 03", "08:30", "17:29", `<span class="num">8.0</span>`, badge("ok")] }
          ]), { icon: "history" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("June 2026", heatcal({ until: 10, levels: { 4: "l3", 5: "bad" } }), { icon: "calendar" })}
            ${card("Exception", rowlist([rowitem({ icon: "alert", title: "Missing punch — Jun 05", sub: "No clock-in recorded · fix via correction", side: `<button class="btn xs soft" data-go="staff/web/request-new/Correction">Fix</button>` })]), { icon: "alert" })}
            ${card("This month", `<div style="display:flex;align-items:center;gap:16px">${UI.donut(98)}<div class="small muted">Worked <b class="num" style="color:var(--ink)">62.3h</b> of 63.5h scheduled<br>OT approved · <b class="num" style="color:var(--ink)">4h</b></div></div>`, { icon: "pulse" })}
            ${cm ? card("How you clock in", `<div class="small muted" style="margin-bottom:6px">Your group <b style="color:var(--ink)">${UI.esc(cm.g.name)}</b> clocks via:</div>
              <span class="pill on">${icon(cm.md.icon)} ${cm.md.label}</span>
              ${(cm.g.allow || []).length > 1 ? `<div class="small muted" style="margin-top:8px">Fallback if unavailable: ${(cm.g.allow || []).filter(x => x !== cm.g.primary).map(DEVICES.methodLabel).join(", ")}</div>` : ""}
              ${cm.dev ? `<div class="small muted" style="margin-top:8px">${icon("grid")} ${cm.dev.vendor} ${UI.esc(cm.dev.model)} · ${UI.esc(cm.dev.zone)}</div>` : ""}`, { icon: "grid" }) : ""}
          </div>
        </div>`
      };
    },

    requests(param) {
      const mine = DATA.mine();
      const filter = ["Leave", "Overtime", "Claim", "Correction"].includes(param) ? param : "All";
      const n = (s) => String(mine.filter(r => r.status === s).length);
      const TL = { All: t("common.all"), Leave: "Leave", Overtime: "Overtime", Claim: "Claims", Correction: "Corrections" };
      const chips = ["All", "Leave", "Overtime", "Claim", "Correction"].map(tp => {
        const c = tp === "All" ? mine.length : mine.filter(r => r.type === tp).length;
        return `<button class="choice" ${filter === tp ? 'aria-pressed="true"' : ""} data-go="staff/web/requests${tp === "All" ? "" : "/" + tp}">${TL[tp]}${c ? " (" + c + ")" : ""}</button>`;
      }).join("");
      return {
        title: "My requests", sub: "Leave, overtime, claims and corrections — one inbox, traceable IDs, every status visible.",
        actions: `<button class="btn" data-go="staff/web/request-new/Leave">${icon("plus")} New request</button>`,
        body: `
        <div class="grid cols-4">
          ${kpi("Open", n("pending"), "Awaiting approval")}
          ${kpi("Approved", n("approved"), "Last 30 days")}
          ${kpi("Returned", n("returned"), "Needs your edit")}
          ${kpi("Leave balance", DATA.me.staff.leaveBal + " d", "Annual · accrues 1.25/mo")}
        </div>
        ${card("All requests", `<div class="choice-row" style="margin-bottom:12px">${chips}</div>` + requestRows("web", filter), { icon: "inbox" })}`
      };
    },

    "request-new"(param) {
      const parts = String(param || "Leave").split("/");
      const type = ["Leave", "Overtime", "Claim", "Correction"].includes(parts[0]) ? parts[0] : "Leave";
      const sub = parts[1] || "Annual";
      const pressed = (x) => type === x ? 'aria-pressed="true"' : "";
      const me = DATA.me.staff;
      const LEAVE_TYPES = [["Annual", "Annual leave"], ["Sick", "Sick leave"], ["Personal", "Personal leave"], ["Statutory", "Statutory"]];
      const leaveSub = LEAVE_TYPES.find(x => x[0] === sub) ? sub : "Annual";
      const leaveLabel = (LEAVE_TYPES.find(x => x[0] === leaveSub) || LEAVE_TYPES[0])[1];
      const hasOT = typeof OT !== "undefined";
      const q = hasOT ? OT.quotaFor(me.div, "monthly") : { limit: 0, used: 0 };
      // deeper, active per-type sub-menus
      let formInner = "";
      if (type === "Leave") {
        formInner = `
            <div class="field"><label>Leave type</label>
              <div class="choice-row">${LEAVE_TYPES.map(([k, l]) => `<button class="choice" ${leaveSub === k ? 'aria-pressed="true"' : ""} data-go="staff/web/request-new/Leave/${k}">${l}</button>`).join("")}</div>
              <input type="hidden" id="rq-leave-type" value="${leaveLabel}">
            </div>
            <div class="grid cols-2">
              <div class="field"><label>From</label><input class="input" id="rq-from" value="Jun 18, 2026"></div>
              <div class="field"><label>To</label><input class="input" id="rq-to" value="Jun 19, 2026"></div>
            </div>
            <div class="field"><label>Days</label><input class="input" id="rq-days" value="2 days"><span class="hint">${leaveSub === "Annual" ? `Annual balance ${me.leaveBal} d → ${Math.max(0, me.leaveBal - 2)} d after this request` : leaveSub === "Sick" ? "Sick leave of 2+ days needs a medical certificate" : "Approval: L1 manager → recorded"}</span></div>`;
      } else if (type === "Overtime") {
        formInner = `
            <div class="grid cols-2">
              <div class="field"><label>Date</label><input class="input" id="rq-otdate" value="Jun 12, 2026"></div>
              <div class="field"><label>Hours</label><input class="input" id="rq-hours" value="2"><span class="hint">Daily cap ${hasOT ? OT.policy().dailyCapH : 3} h · monthly cap ${hasOT ? OT.policy().monthlyCapH : 45} h</span></div>
            </div>
            <div class="field"><label>Your division's OT quota — ${me.div}</label>${hasOT ? UI.meter(OT.pct(q), { label: `${q.used} / ${q.limit} h used · ${OT.remaining(q)} h remaining this month` }) : ""}</div>`;
      } else if (type === "Claim") {
        formInner = `
            <div class="grid cols-2">
              <div class="field"><label>Amount (₭)</label><input class="input" id="rq-amt" value="420,000"></div>
              <div class="field"><label>Receipt date</label><input class="input" id="rq-cdate" value="Jun 06, 2026"></div>
            </div>`;
      } else {
        formInner = `
            <div class="grid cols-2">
              <div class="field"><label>Date to correct</label><input class="input" id="rq-cdate" value="Jun 05, 2026"></div>
              <div class="field"><label>What happened</label><input class="input" value="Missing clock-in"></div>
            </div>`;
      }
      return {
        title: "New request", sub: "Submits into the Requests & Approvals cell — L1 manager, then L2 HR where the chain requires it.",
        crumbs: [{ label: "Requests", go: "staff/web/requests" }, { label: type }],
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div class="field"><label>Request type</label>
              <div class="choice-row">
                <button class="choice" ${pressed("Leave")} data-go="staff/web/request-new/Leave">${icon("calendar")} Leave</button>
                <button class="choice" ${pressed("Overtime")} data-go="staff/web/request-new/Overtime">${icon("clock")} Overtime</button>
                <button class="choice" ${pressed("Claim")} data-go="staff/web/request-new/Claim">${icon("receipt")} Claim</button>
                <button class="choice" ${pressed("Correction")} data-go="staff/web/request-new/Correction">${icon("edit")} Correction</button>
                <button class="choice" data-go="staff/web/sched-swaps">${icon("swap")} Shift swap</button>
              </div>
            </div>
            ${formInner}
            <div class="field"><label>Reason / note</label><textarea class="input" id="rq-note" placeholder="A short note for your approver…"></textarea></div>
            <div class="field"><label>Attachment</label><button class="btn ghost sm">${icon("plus")} Add file or receipt photo</button></div>
            <div style="display:flex;gap:9px;justify-content:flex-end">
              <button class="btn ghost" data-go="staff/web/requests">${t("common.cancel")}</button>
              <button class="btn" data-act="submit-request:${type}">${icon("send")} ${t("common.submit")} request</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Approval chain", steps([{ t: "You", s: "Submit" }, { t: "Khamla S.", s: "L1 · Manager" }, ...(type === "Claim" && DATA.has("l2") ? [{ t: "HR / Finance", s: "L2 · Settle" }] : [{ t: "HR", s: "Record & sync" }])], 0) + (DATA.has("l2") ? "" : `<p class="small muted" style="margin-top:10px">${icon("lock", "lk")} Single-step on Essential — multi-step chains (L1 → L2) arrive at ${DATA.unlockLabel("l2")}.</p>`), { icon: "layers" })}
            ${card("Good to know", `<p class="small muted">${type === "Leave" ? "Pick a leave type above — your manager sees the team conflict calendar before approving; approved leave syncs to payroll." : type === "Overtime" ? "Set the hours — OT is checked against your division's live quota and the daily / monthly caps before it reaches payroll." : type === "Claim" ? "Claims are validated by your manager, then settled by HR / Finance through payroll or finance export." : "Corrections adjust the attendance ledger — the change is audit-logged and pay re-derives."}</p>`, { icon: "sparkle" })}
          </div>
        </div>`
      };
    },

    "request-detail"(id) {
      const r = DATA.requests.find(x => x.id === id) || DATA.requests[0];
      const stepIdx = r.status === "approved" ? 3 : r.status === "returned" ? 1 : (r.stage.startsWith("L2") ? 2 : 1);
      return {
        title: r.detail, sub: `Submitted ${r.submitted} · shared ID traces this item across every persona lens.`,
        crumbs: [{ label: "Requests", go: "staff/web/requests" }, { label: r.id }],
        actions: `${idtag(r.id)} ${statusBadge(r)}`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Where it is", steps([
          { t: "Submitted", s: r.submitted }, { t: "Manager · L1", s: "Khamla S." },
          ...(r.type === "Claim" && DATA.has("l2") ? [{ t: "HR / Finance · L2", s: "Settle via payroll" }] : [{ t: "HR", s: "Record & sync" }]),
          { t: "Done", s: "Ledger updated" }
        ], stepIdx), { icon: "layers" })}
            ${card("Details", table([{ h: "Field" }, { h: "Value" }], [
          { cells: ["Type", r.type] }, { cells: ["Dates", r.dates] },
          { cells: ["Note", r.note] }, { cells: ["Stage", r.stage] },
          { cells: ["SLA", r.sla] }
        ]), { icon: "file" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Actions", `<div style="display:flex;flex-direction:column;gap:8px">
              ${r.status === "pending" ? `<button class="btn ghost">${icon("x")} Cancel request</button>` : ""}
              ${r.status === "returned" ? `<button class="btn" data-go="staff/web/request-new/${r.type}">${icon("edit")} Edit & resubmit</button>` : ""}
              <button class="btn ghost" data-act="export:reqhistory">${icon("download")} Export history</button>
            </div>`, { icon: "settings" })}
            ${card("One ledger, many lenses", `<p class="small muted">Your manager sees ${idtag(r.id)} in the L1 queue; HR sees it in cross-module approvals; the CEO only ever sees it inside aggregates. Approve it in the Manager persona and watch this page update.</p>`, { icon: "refresh" })}
          </div>
        </div>`
      };
    },

    payslips() {
      const mine = DATA.myPayslips(); // v2.3.2.db — slips of the ACTING user only
      const p = mine[0];
      if (!p) return {
        title: "Payslips", sub: "Self-serve slips with tax and social security breakdown — published by each pay run.",
        actions: userPicker(),
        body: `
        ${card("", empty("banknote", "No payslips yet for " + DATA.me.staff.name.split(" ")[0], "The first pay run after hire publishes here — payroll reads the db_people row this user just got."))}
        ${card("How slips arrive", `<p class="small muted">Pay run ${idtag("PR-2026-06")} (HR → Payroll) generates one serialized slip per active employee at disbursement. New hires join the next cutoff automatically — their master record is already in db_people.</p>`, { icon: "sparkle" })}
        ${etdCard("web")}`
      };
      return {
        title: "Payslips", sub: "Self-serve slips with tax and social security breakdown — published by each pay run.",
        actions: userPicker(),
        body: `
        <div class="grid cols-3">
          <div class="card tinted span-2">
            <div class="card-head"><span class="t">${icon("banknote")} Latest — ${p.period}</span>${badge("ok")}</div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap">
              <div><div class="eyebrow">Net pay</div>
              <div class="num" style="font-family:var(--display);font-size:38px;font-weight:550;letter-spacing:-.03em">${kip(p.net)}</div>
              <div class="small muted">Paid ${p.paid} · BCEL ··4821</div></div>
              <div style="display:flex;gap:8px"><button class="btn" data-go="staff/web/payslip/${p.id}">${icon("eye")} View</button>
              <button class="btn ghost" data-act="export:payslip">${icon("download")} PDF</button></div>
            </div>
          </div>
          ${card("Year to date", rowlist([
          rowitem({ icon: "banknote", title: "Net paid 2026", sub: "Jan – May", side: `<b class="num">₭ 23.9M</b>` }),
          rowitem({ icon: "shield", title: "PIT withheld", sub: "Personal income tax", side: `<b class="num">₭ 2.21M</b>` }),
          rowitem({ icon: "heart", title: "Social security", sub: "Employee 5.5%", side: `<b class="num">₭ 1.47M</b>` })
        ]), { icon: "pulse" })}
        </div>
        ${etdCard("web")}
        ${card("History", table(
          [{ h: "Period" }, { h: "ID" }, { h: "Gross", r: 1 }, { h: "Net", r: 1 }, { h: "", r: 1 }],
          mine.map(s => ({
            go: `staff/web/payslip/${s.id}`,
            cells: [s.period, idtag(s.id), `<span class="num">${kip(s.gross)}</span>`, `<b class="num">${kip(s.net)}</b>`, icon("chevR")]
          }))), { icon: "history" })}`
      };
    },

    payslip(id) {
      const p = DATA.payslips.find(x => x.id === id) || DATA.payslips[0];
      return {
        title: "Payslip — " + p.period, sub: "One ledger line per pay code · statutory items computed by the localizable rules pack.",
        crumbs: [{ label: "Payslips", go: "staff/web/payslips" }, { label: p.id }],
        actions: `<button class="btn ghost" data-act="export:payslip">${icon("download")} PDF</button><button class="btn ghost" data-act="export:tax">${icon("file")} Tax statement</button>`,
        body: payslipDetailBody(id, "web")
      };
    },

    /* ---------- v2.4.5 G4 — Staff advance request (earned-wage access) ---------- */
    advance() {
      const m = DATA.me.staff;
      if (typeof PAY === "undefined" || !PAY.advanceCap) return { title: "Request an advance", sub: "Earned-wage access.", body: card("", empty("banknote", "Advances unavailable", "The payroll engine isn't loaded.")) };
      const cap = PAY.advanceCap(m.id), e = PAY.earnedToDate(m.id);
      const mine = (PAY.advances ? PAY.advances() : []).filter(a => a.emp === m.id);
      return {
        title: "Request an advance", sub: "Earned-wage access — draw up to half of what you've already earned this cycle, repaid from your next pay.",
        crumbs: [{ label: "Payslips", go: "staff/web/payslips" }, { label: "Advance" }],
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("Available now", `
              <div style="margin-bottom:10px"><div class="eyebrow">Up to</div>
                <div class="num" style="font-family:var(--display);font-size:34px;font-weight:550;letter-spacing:-.03em">${UI.kip(cap)}</div>
                <div class="small muted">50% of ${UI.kip(e.net)} earned-to-date</div></div>
              ${UI.meter(e.pct, { label: "Earned " + e.pct + "% of the cycle" })}
              <div class="field" style="margin-top:14px;max-width:280px"><label>Amount (₭)</label><input class="input" id="adv-amt" type="number" inputmode="numeric" placeholder="${cap}" max="${cap}"></div>
              <p class="small muted">Leave blank to request the full available amount. It goes to HR for approval, then nets against your next pay run.</p>
              <div style="margin-top:10px"><button class="btn" data-act="adv-request">${icon("banknote")} Request advance</button></div>`, { icon: "banknote" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Your advances", mine.length ? rowlist(mine.map(a => rowitem({ icon: "banknote", title: UI.kip(a.amount), sub: a.date + " · cap " + UI.kip(a.cap), side: badge(a.status) }))) : `<p class="small muted">No advances yet.</p>`, { icon: "history" })}
            ${card("How it works", `<p class="small muted">Capped at 50% of your earned-to-date net. HR approves it in the unified inbox; on the next pay-run close it's recovered automatically from your net pay.</p>`, { icon: "sparkle" })}
          </div>
        </div>`
      };
    },

    documents() {
      return {
        title: "Documents", sub: "Your vault — personal documents with expiry alerts, policies to acknowledge, and self-serve requests.",
        body: `
        <div class="grid cols-2">
          ${card("My documents", (DATA.myDocs().filter(d => d.kind !== "Policy").length
          ? rowlist(DATA.myDocs().filter(d => d.kind !== "Policy").map(d => rowitem({
            icon: "file", title: d.name, sub: `${d.kind} · expires ${d.expiry}`, side: badge(d.status)
          })))
          : empty("folder", "No documents on file yet", "HR uploads contracts & IDs at onboarding — request one below.")), { icon: "folder" })}
          ${card("Policies to acknowledge", rowlist([
          rowitem({ icon: "shield", title: "Code of conduct v4", sub: "Published Jun 02 · due Jun 20", side: `<button class="btn xs" data-act="wf-ack-policy">Acknowledge</button>` }),
          rowitem({ icon: "shield", title: "Safety handbook v7", sub: "Acknowledged May 12", side: badge("ok") })
        ]), { icon: "check" })}
        </div>
        ${card("Request a document", `
          <p class="small muted" style="margin-bottom:12px">Generated from System-Admin templates with serial number + e-signature (flow J · DOC-####). Self-service where policy allows.</p>
          <div class="choice-row">
            <button class="choice" data-act="gen-doc:staff-salary">${icon("banknote")} Salary certificate</button>
            <button class="choice" data-act="gen-doc:staff-employment">${icon("check")} Employment verification</button>
            <button class="choice" data-act="gen-doc:staff-attendance">${icon("calendar")} Attendance record</button>
          </div>`, { icon: "send" })}`
      };
    },

    /* ---------- v2.3.2.db — my slice of the split stores ---------- */
    mydata() {
      const m = DATA.me.staff;
      return {
        title: "My data", sub: "Exactly which stores hold your records — your own slice, addable & deletable where policy allows. Scope enforced by the kernel.",
        actions: `<button class="btn ghost" data-act="export:mydata">${icon("download")} Export my data</button>`,
        body: `
        <div class="grid cols-3">
          <div class="span-2" style="display:flex;flex-direction:column;gap:16px">
            ${card("My requests — db_workflow (delete = withdraw while pending)", DBV.tableEditor("db_workflow", "requests", { filter: r => r.who === m.name, canAdd: false }) + `<div style="margin-top:10px"><button class="btn sm soft" data-go="staff/web/request-new/Leave">${icon("plus")} New request (through the cell API)</button></div>`, { icon: "inbox" })}
            ${DATA.has("vault")
              ? card("My documents — db_docs (metadata; files live in L-CU)", DBV.tableEditor("db_docs", "documents", { filter: d => d.emp === m.id }), { icon: "folder" })
              : card("My documents — db_docs", `<div class="rowitem row-locked"><span class="ric n">${icon("lock")}</span><div class="rmain"><div class="rt">Documents Vault store is not provisioned on Essential</div><div class="rs">Provisioned lazily — flags decide which stores exist (§02)</div></div><div class="rside">${UI.lockTag(DATA.unlockLabel("vault"))}</div></div>`, { icon: "folder" })}
            ${card("My punches — db_time (corrections go through the TC flow, not edits)", DBV.tableEditor("db_time", "punches", { filter: p => p.emp === m.id, canAdd: false, canDel: false }), { icon: "clock" })}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${card("Where my data lives", DBV.storeGrid(null, ["db_people", "db_time", "db_workflow", "db_payroll", "db_docs"]), { icon: "layers" })}
            ${card("Isolation, by design", `<p class="small muted">Your rows live in <b>${DB.TENANT}</b>'s own physical stores — one small database per tenant × store. Offboarding is an export + delete of actual files; cross-tenant exposure is structurally impossible, not policy-prevented.</p>`, { icon: "shield" })}
          </div>
        </div>`
      };
    },

    /* ---------- v2.3.2.db — my reports (runs + file storage) ---------- */
    reports() {
      return {
        title: "My reports", sub: "Statements over your own rows only — each section keeps its last 3 runs; click a run to view (read-only) or download. Older runs move to file storage.",
        actions: `${userPicker()}<button class="btn ghost" data-go="staff/web/report-files">${icon("folder")} File storage</button>`,
        body: REP.library("staff", "staff/web")
      };
    },
    "report-run"(param) {
      const p = REP.runPage(param, "staff", "staff/web");
      return {
        title: p.title, sub: p.sub,
        crumbs: [{ label: "My reports", go: "staff/web/reports" }, { label: p.run ? p.run.id : "run" }],
        actions: p.run ? `${idtag(p.run.id)} ${p.run.archived ? `<span class="badge plain">archived</span>` : `<span class="badge ok plain">recent</span>`}` : "",
        body: p.body
      };
    },
    "report-files"() {
      const f = REP.filesPage("staff", "staff/web");
      return {
        title: "Report file storage", sub: "Runs older than the last 3 live here — one folder per report, view-only with download links.",
        crumbs: [{ label: "My reports", go: "staff/web/reports" }, { label: "File storage" }],
        body: f.kpis + f.folders
      };
    },

    me() {
      const m = DATA.me.staff;
      return {
        title: "My profile", sub: "Own-slice edits — sensitive changes route through an approval, everything is audit-logged.",
        actions: `<button class="btn soft" data-act="wf-profile-request">${icon("edit")} Request change</button>`,
        body: `
        <div class="grid cols-3">
          <div class="card span-2">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">${avatar(m.name, 1)}
              <div><div style="font-weight:800;font-size:16px">${m.name}</div>
              <div class="small muted">${m.role} · ${idtag(m.id)}</div></div></div>
            ${table([{ h: "Field" }, { h: "Value" }], [
          { cells: ["Division", m.div + (m.team !== "—" ? " · " + m.team : "")] },
          { cells: ["Site", m.site] },
          { cells: ["Employment", `Full-time · since ${m.since}${m.status === "probation" ? ` · <span class="badge warn plain">probation</span>` : ""}`] },
          { cells: ["Phone", "+856 20 ·· ·· 482"] },
          { cells: ["Bank", "BCEL ····4821"] },
          { cells: ["Emergency contact", "Vanh P. · +856 20 ·· ·· 110"] }
        ])}
          </div>
          <div style="display:flex;flex-direction:column;gap:16px">
            ${userPickerCard()}
            ${card("Language", `<div class="choice-row"><button class="choice" aria-pressed="true">English</button><button class="choice" data-act="lang-lo">ລາວ</button></div><p class="small muted" style="margin-top:10px">Bilingual UI is a platform feature — the Lao pack is staged for the build phase.</p>`, { icon: "globe" })}
            ${card("My access", `<p class="small muted">Persona <b style="color:var(--acc-d)">Staff · ESS</b> — create &amp; edit own data, submit requests. Scope enforced by the kernel on every call.</p>`, { icon: "lock" })}
            ${etdCard("web")}
          </div>
        </div>
        <div style="height:16px"></div>
        ${card("Profile — General · Personal · Job", `<div class="grid cols-3">${PROFILE.sections().map(s => `<div><div class="strong small" style="margin-bottom:6px">${icon(s.icon)} ${s.label}</div>${table([{ h: "Field" }, { h: "Value", r: 1 }], s.fields.map(([k, lbl]) => ({ cells: [`<span class="small muted">${lbl}</span>`, `<span>${PROFILE.value(PROFILE.emp(m.id) || m, k, s.sealed)}</span>`] })))}</div>`).join("")}</div><p class="small muted" style="margin-top:8px">Read-only · the same profile your manager sees. Sealed fields (DOB · National ID) are masked.</p>`, { icon: "user" })}
        <div style="height:16px"></div>
        ${card("Time off", `<div class="grid cols-3" style="gap:10px;margin-bottom:12px">${LEAVECAL.balances().map(([tp, ent, used]) => `<div style="text-align:center;padding:10px;border:1px solid var(--line);border-radius:12px"><div class="num" style="font-size:20px;font-weight:700">${ent - used}</div><span class="small muted">${tp} left · ${used}/${ent}</span></div>`).join("")}</div>${table([{ h: "Upcoming holiday" }, { h: "Date" }, { h: "Kind", r: 1 }], LEAVECAL.holidays().slice(0, 4).map(h => ({ cells: [h.name, `<span class="small">${h.date}</span>`, `<span class="badge ${h.kind === "public" ? "acc" : "plain"} plain">${h.kind}</span>`] })))}<div style="margin-top:10px"><button class="btn sm" data-act="toast:Open Requests → New request → Leave to file time off (holidays are blocked on the picker)">${icon("sun")} Request time off</button></div>`, { icon: "sun" })}`
      };
    }
  };

  /* ---------- MOBILE tabs + drills ---------- */
  const mobile = {
    home() {
      return {
        title: "My day", body: `
        ${clockCard()}
        <div class="grid cols-2">
          ${kpi("Leave", DATA.me.staff.leaveBal + " d", "balance")}
          ${kpi("Requests", String(DATA.mine().filter(r => r.status === "pending").length), "open")}
        </div>
        ${card("Alerts", alertsList("mobile"), { icon: "bell" })}
        ${card("My requests", requestRows("mobile"), { icon: "inbox" })}
        ${card(t("common.quickActions"), `<div class="choice-row">
          <button class="choice" data-go="staff/mobile/request-new/Leave">${icon("calendar")} Leave</button>
          <button class="choice" data-go="staff/mobile/request-new/Claim">${icon("receipt")} Claim</button>
          <button class="choice" data-go="${DATA.myPayslips()[0] ? "staff/mobile/payslip/" + DATA.myPayslips()[0].id : "staff/mobile/me"}">${icon("banknote")} Payslip</button>
        </div>`, { icon: "sparkle" })}`
      };
    },
    time() {
      return {
        title: "Time", body: `
        ${clockCard()}
        ${card("June 2026", heatcal({ until: 10, levels: { 5: "bad" } }), { icon: "calendar" })}
        ${card("Recent", rowlist([
          rowitem({ icon: "check", title: "Jun 09 · 08:28 – 17:32", sub: "8.1 h · on time", side: badge("ok") }),
          rowitem({ icon: "alert", title: "Jun 05 · missing in", sub: "Fix via correction", side: `<button class="btn xs soft" data-go="staff/mobile/request-new/Correction">Fix</button>` }),
          rowitem({ icon: "check", title: "Jun 04 · 08:29 – 19:40", sub: "10.2 h · OT +2h", side: `<span class="badge acc">OT</span>` })
        ]), { icon: "history" })}`
      };
    },
    requests() {
      return {
        title: "Requests", body: `
        <button class="btn" style="width:100%" data-go="staff/mobile/request-new/Leave">${icon("plus")} New request</button>
        ${card("Mine", requestRows("mobile"), { icon: "inbox" })}`
      };
    },
    me() {
      const m = DATA.me.staff;
      return {
        title: "Me", body: `
        ${card("", `<div style="display:flex;align-items:center;gap:13px">${avatar(m.name, 1)}<div><div style="font-weight:800">${m.name}</div><div class="small muted">${m.role}</div></div></div>`)}
        ${card("Switch user — db_people", userPicker() + `<p class="small muted" style="margin-top:8px">New hires are selectable immediately.</p>`, { icon: "user" })}
        ${card("Payslips", (DATA.myPayslips().length
          ? rowlist(DATA.myPayslips().map(p => rowitem({ icon: "banknote", title: p.period, sub: "Net " + kip(p.net), side: icon("chevR"), go: `staff/mobile/payslip/${p.id}` })))
          : empty("banknote", "No payslips yet", "Published by the next pay run")), { icon: "banknote" })}
        ${etdCard("mobile")}
        ${card("Documents", (DATA.myDocs().length
          ? rowlist(DATA.myDocs().slice(0, 3).map(d => rowitem({ icon: "file", title: d.name, sub: d.kind + " · " + d.expiry, side: badge(d.status) })))
          : empty("folder", "No documents yet", "HR uploads at onboarding")), { icon: "folder" })}
        ${card("Language", `<div class="choice-row"><button class="choice" aria-pressed="true">EN</button><button class="choice" data-act="lang-lo">ລາວ</button></div>`, { icon: "globe" })}`
      };
    },
    "request-detail"(id) {
      const r = DATA.requests.find(x => x.id === id) || DATA.requests[0];
      const stepIdx = r.status === "approved" ? 3 : r.status === "returned" ? 1 : (r.stage.startsWith("L2") ? 2 : 1);
      return {
        title: r.id, back: "staff/mobile/requests", body: `
        ${card("", `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">${idtag(r.id)}${statusBadge(r)}</div>
          <h3 style="font-size:16px;margin:10px 0 2px">${r.detail}</h3><div class="small muted">${r.dates}</div>`)}
        ${card("Progress", steps([{ t: "Submitted" }, { t: "L1 · Manager" }, { t: r.type === "Claim" && DATA.has("l2") ? "L2 · HR" : "HR record" }, { t: "Done" }], stepIdx), { icon: "layers" })}
        ${card("Note", `<p class="small">${r.note}</p>`, { icon: "file" })}`
      };
    },
    "request-new"(param) {
      const type = ["Leave", "Overtime", "Claim", "Correction"].includes(param) ? param : "Leave";
      const me = DATA.me.staff, hasOT = typeof OT !== "undefined";
      let inner = "";
      if (type === "Leave") inner = `
          <div class="field"><label>Leave type</label><select class="input" id="rq-leave-type"><option>Annual leave</option><option>Sick leave</option><option>Personal leave</option><option>Statutory</option></select></div>
          <div class="field"><label>Dates</label><input class="input" id="rq-from" value="Jun 18 – 19"></div>
          <input type="hidden" id="rq-days" value="2 days">`;
      else if (type === "Overtime") inner = `
          <div class="field"><label>Date</label><input class="input" id="rq-otdate" value="Jun 12, 2026"></div>
          <div class="field"><label>Hours</label><input class="input" id="rq-hours" value="2"></div>
          ${hasOT ? `<div class="field">${UI.meter(OT.pct(OT.quotaFor(me.div, "monthly")), { label: `${me.div} OT · ${OT.remaining(OT.quotaFor(me.div, "monthly"))} h left` })}</div>` : ""}`;
      else if (type === "Claim") inner = `<div class="field"><label>Amount (₭)</label><input class="input" id="rq-amt" value="420,000"></div>`;
      else inner = `<div class="field"><label>Date to correct</label><input class="input" id="rq-cdate" value="Jun 05, 2026"></div>`;
      return {
        title: "New " + type.toLowerCase(), back: "staff/mobile/requests", body: `
        ${card("", `
          <div class="field"><label>Type</label><div class="choice-row">
            ${["Leave", "Overtime", "Claim", "Correction"].map(x => `<button class="choice" ${x === type ? 'aria-pressed="true"' : ""} data-go="staff/mobile/request-new/${x}">${x}</button>`).join("")}
          </div></div>
          ${inner}
          <div class="field"><label>Note</label><textarea class="input" id="rq-note" placeholder="Short note…"></textarea></div>
          <button class="btn" style="width:100%" data-act="submit-request:${type}">${icon("send")} Submit</button>`)}
        ${card("Chain", steps([{ t: "You" }, { t: "Manager" }, { t: type === "Claim" && DATA.has("l2") ? "HR/Fin" : "HR" }], 0), { icon: "layers" })}`
      };
    },
    payslip(id) {
      return { title: "Payslip", back: "staff/mobile/me", body: payslipDetailBody(id, "mobile") };
    },
    advance() {
      const m = DATA.me.staff;
      if (typeof PAY === "undefined" || !PAY.advanceCap) return { title: "Advance", back: "staff/mobile/me", body: card("", empty("banknote", "Advances unavailable", "Payroll engine not loaded.")) };
      const cap = PAY.advanceCap(m.id), e = PAY.earnedToDate(m.id);
      const mine = (PAY.advances ? PAY.advances() : []).filter(a => a.emp === m.id);
      return {
        title: "Advance", back: "staff/mobile/me", body: `
        ${card("Available now", `<div class="num" style="font-family:var(--display);font-size:30px;font-weight:550;letter-spacing:-.03em">${UI.kip(cap)}</div><div class="small muted" style="margin-bottom:10px">50% of ${UI.kip(e.net)} earned-to-date</div>${UI.meter(e.pct, { label: e.pct + "% of cycle" })}<div class="field" style="margin-top:12px"><label>Amount (₭)</label><input class="input" id="adv-amt-m" type="number" inputmode="numeric" placeholder="${cap}" max="${cap}"></div><div style="margin-top:10px"><button class="btn" data-act="adv-request">${icon("banknote")} Request</button></div>`, { icon: "banknote" })}
        ${mine.length ? card("Your advances", rowlist(mine.map(a => rowitem({ icon: "banknote", title: UI.kip(a.amount), sub: a.date, side: badge(a.status) }))), { icon: "history" }) : ""}`
      };
    }
  };

  /* ---------- v2.4.0.db.auth — My security (every persona gets it) ---------- */
  web.security = () => ({
    title: "My security", sub: "Your account behind the portal — change your password, see your sessions, revoke anything you don't recognize.",
    body: AUTHV.mySecurity("staff")
  });

  /* ---------- v2.4.4 — My schedule + shift-swap (delegated to SCHEDVIEWS) ----------
     Staff calendar is read-only, scope = their own EMP id (handled inside the
     builder via DATA.me.staff). Shift-swap is reachable from My schedule and the
     Requests area. */
  web["sched-me"] = (param) => SCHEDVIEWS.myschedule({ device: "web", param });
  web["sched-swaps"] = () => SCHEDVIEWS.swaps({ persona: "staff", device: "web", canEdit: false });
  mobile["sched-me"] = (param) => SCHEDVIEWS.myschedule({ device: "mobile", param, back: "staff/mobile/home" });
  mobile["sched-swaps"] = () => SCHEDVIEWS.swaps({ persona: "staff", device: "mobile", canEdit: false, back: "staff/mobile/requests" });

  window.PERSONAS = window.PERSONAS || {};
  PERSONAS.staff = {
    key: "staff", label: t("personas.staff"), icon: "user",
    appName: "Adeptio Me", roleLine: "Employee Self-Service",
    domain: "app.adeptio.hr/me",
    nav: [
      { group: "Work", items: [
        { id: "home", icon: "home", label: t("staff.home") },
        { id: "time", icon: "clock", label: t("staff.time") },
        { id: "sched-me", icon: "calendar", label: "My schedule" },
        { id: "requests", icon: "inbox", label: t("staff.requests"), count: () => DATA.mine().filter(r => r.status === "pending").length }
      ]},
      { group: "Pay & docs", items: [
        { id: "payslips", icon: "banknote", label: t("staff.payslips") },
        { id: "advance", icon: "banknote", label: "Advance" },
        { id: "documents", icon: "folder", label: t("staff.documents"), lock: "vault" },
        { id: "reports", icon: "chart", label: "My reports" }
      ]},
      { group: "Account", items: [
        { id: "me", icon: "user", label: t("staff.me") },
        { id: "security", icon: "shield", label: "My security" },
        { id: "mydata", icon: "layers", label: "My data" }
      ] }
    ],
    parent: { "request-new": "requests", "request-detail": "requests", "payslip": "payslips", "advance": "payslips", "report-run": "reports", "report-files": "reports", "sched-swaps": "requests" },
    tabs: [
      { id: "home", icon: "home", label: "Home" },
      { id: "time", icon: "clock", label: "Time" },
      { id: "requests", icon: "inbox", label: "Requests" },
      { id: "me", icon: "user", label: "Me" }
    ],
    tabParent: { "request-detail": "requests", "request-new": "requests", "payslip": "me", "advance": "me", "sched-me": "time", "sched-swaps": "requests" },
    web, mobile
  };
})();
