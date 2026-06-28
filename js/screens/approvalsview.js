/* ============================================================
   ADEPTIO · v2.4.5 — shared APPROVALS inbox view  (window.APPROVALSVIEW) · T1
   The unified, bucketed inbox card both Manager and HR drop in at the top of
   their Approvals screen. Reads APPROVALS.buckets() (shift · overtime · leave ·
   others) and reuses the existing approve:/return: actions, so nothing in the
   decision path changes. Protective-check rows show a "flagged" marker (never
   blocked). PURE strings — node-safe (smoke renders it).
   ============================================================ */
window.APPROVALSVIEW = (function () {
  const U = window.UI;
  const icon = (n) => U.icon(n), esc = (s) => U.esc(String(s == null ? "" : s));
  const idtag = (s) => (U.idtag ? U.idtag(s) : `<span class="mono small">${esc(s)}</span>`);
  const badge = (s) => U.badge(s);

  function row(r, canEdit) {
    const flagged = (r.grade === "flag");
    const side = canEdit
      ? `<span style="display:inline-flex;gap:6px"><button class="btn xs ok" data-act="approve:${r.id}">${icon("check")} Approve</button><button class="btn xs danger" data-act="return:${r.id}">${icon("x")} Return</button></span>`
      : badge(r.status);
    return U.rowitem({
      icon: flagged ? "alert" : "inbox",
      title: `${idtag(r.id)} ${esc(r.who || "")} <span class="badge plain">${esc(r.type)}</span>${flagged ? ` <span class="badge warn plain">flagged</span>` : ""}`,
      sub: esc(r.detail || ""),
      side
    });
  }

  // the bucketed inbox as a CARD (injected at the top of each persona's Approvals screen)
  function bucketsCard(o) {
    o = o || {};
    const canEdit = o.canEdit !== false;
    const AP = window.APPROVALS;
    if (!AP) return "";
    const bk = AP.buckets(), order = AP.CAT_ORDER, labels = AP.CAT_LABEL, total = AP.pending();
    const sections = order.filter(c => bk[c] && bk[c].length).map(c =>
      `<div class="strong" style="margin:12px 0 6px">${esc(labels[c] || c)} <span class="num muted">· ${bk[c].length}</span></div>${U.rowlist(bk[c].map(r => row(r, canEdit)))}`
    ).join("");
    const body = `<p class="small muted" style="margin-bottom:6px">One queue, grouped <b>on shift → overtime → leave → others</b>. Protective checks (OT cap · geofence · punch) <b>flag</b> a row for review — they never block.</p>${total ? sections : `<p class="small muted">Inbox clear — nothing waiting.</p>`}`;
    return U.card(`Unified inbox · ${total} waiting`, body, { icon: "inbox" });
  }

  // the bucket → header-icon map (shift·overtime·leave·others)
  const SEC_ICON = { shift: "calendar", overtime: "clock", leave: "sun", others: "inbox" };

  // the standalone unified inbox SCREEN body — the first-class decision surface that
  // REPLACES the old per-tab queue. Renders APPROVALS.buckets() as grouped sections and
  // reuses the same approve:/return: actions (app.js → DATA.approve/ret, the engine path
  // APPROVALS.decide() also lands on). Returns { title, sub, body } so each persona screen
  // composes its KPI band above inbox.body. scopeIds (optional) filters rows to the ids a
  // persona may decide (Manager = L1 queue); omit for the full unified queue (HR). Node-safe.
  function inboxScreen(o) {
    o = o || {};
    const canEdit = o.canEdit !== false;
    const title = "Unified inbox";
    const sub = "One queue, grouped on shift → overtime → leave → others. Protective checks (OT cap · geofence · punch) flag a row for review — they never block.";
    const AP = window.APPROVALS;
    if (!AP) return { title, sub, body: U.card(title, U.empty("inbox", "Inbox unavailable", "The approvals engine isn't loaded."), { icon: "inbox" }) };

    const order = AP.CAT_ORDER, labels = AP.CAT_LABEL;
    let bk = AP.buckets();
    if (Array.isArray(o.scopeIds)) {                 // §3.6 scope fix — keep only ids this persona may decide
      const allow = new Set(o.scopeIds), f = {};
      order.forEach(c => f[c] = (bk[c] || []).filter(r => allow.has(r.id)));
      bk = f;
    }
    const live = order.filter(c => bk[c] && bk[c].length);
    const total = live.reduce((n, c) => n + bk[c].length, 0);
    const flagged = order.reduce((n, c) => n + (bk[c] || []).filter(r => r.grade === "flag").length, 0);

    if (!total) return { title, sub, body: U.card(title, U.empty("calcheck", "Inbox clear", "Nothing waiting across shift, overtime, leave or others."), { icon: "inbox" }) };

    const chips = live.map(c => `<span class="inbox-jchip"><i class="ij-dot cat-${c}"></i>${esc(labels[c] || c)}<b class="num">${bk[c].length}</b></span>`).join("");
    const bar = `<div class="inbox-bar">
      <div class="inbox-barL"><span class="inbox-total num">${total}</span><span class="inbox-totlbl">waiting</span>${flagged ? `<span class="inbox-flagcount">${icon("alert")} ${flagged} flagged</span>` : ""}</div>
      <div class="inbox-jump">${chips}</div>
    </div>`;
    const sections = live.map(c => {
      const rows = bk[c], nflag = rows.filter(r => r.grade === "flag").length;
      return `<section class="inbox-sec" aria-label="${esc(labels[c] || c)}">
        <header class="inbox-sechead">
          <span class="inbox-secicon">${icon(SEC_ICON[c] || "inbox")}</span>
          <span class="inbox-seclabel">${esc(labels[c] || c)}</span>
          <span class="inbox-count num">${rows.length}</span>
          ${nflag ? `<span class="inbox-secflag">${nflag} flagged</span>` : ""}
        </header>
        ${U.rowlist(rows.map(r => row(r, canEdit)))}
      </section>`;
    }).join("");
    return { title, sub, body: `<div class="inbox-stage">${bar}${sections}</div>` };
  }

  return { bucketsCard, inboxScreen };
})();
