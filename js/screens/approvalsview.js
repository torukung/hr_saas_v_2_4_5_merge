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
  return { bucketsCard };
})();
