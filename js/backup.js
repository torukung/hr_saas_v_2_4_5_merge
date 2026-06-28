/* ============================================================
   ADEPTIO · v2.4.5 — full-split BACKUP / RESTORE  (window.BACKUP)
   Wraps the existing DB backup ladder (which snapshots real table
   data for every store) into the admin model the host needs:
     · a DAILY auto backup → a new dated "folder" each day
     · a MANUAL force backup any time
     · RESTORE by picking a set from the list (cloud-ready), OR by
       uploading a backup file from the admin (importFile)
     · EXPORT a set to a downloadable JSON so it can live in the cloud
   Local now; the same JSON shape is what the Cloudflare R2/D1 sync
   will push/pull — no cloud calls here. db_identity stays custody-
   excluded on restore (sessions/tokens never come back). Node-safe.
   ============================================================ */
window.BACKUP = (function () {
  const allIds = () => { try { return DB.CATALOG.map(c => c.id); } catch (e) { return []; } };
  const p2 = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); };
  const hhmm = () => { const d = new Date(); return p2(d.getHours()) + ":" + p2(d.getMinutes()); };
  const all = () => { try { return DB.backups.all(); } catch (e) { return []; } };

  // a full-split snapshot of EVERY store, tagged with a dated folder in the label
  function fullBackup(kind, who) {
    const folder = today();
    const label = (kind === "daily" ? "Daily · " : "Force · ") + folder + (kind === "daily" ? "" : " " + hhmm());
    try { return DB.backups.now(allIds(), kind, label, who); } catch (e) { return null; }
  }
  const forceNow = (who) => fullBackup("manual-force", who);
  // one daily set per folder/day (idempotent)
  function runDaily(who) {
    const existing = all().find(b => b.kind === "daily" && (b.label || "").indexOf(today()) >= 0);
    if (existing) return { ok: false, skipped: true, bk: existing };
    return { ok: true, bk: fullBackup("daily", who) };
  }
  // group the snapshot list into dated folders (newest first)
  function folders() {
    const map = {};
    all().forEach(b => { const m = (b.label || "").match(/(\d{4}-\d\d-\d\d)/); const f = m ? m[1] : (b.ts || "earlier"); (map[f] = map[f] || []).push(b); });
    return Object.keys(map).sort().reverse().map(f => ({ folder: f, items: map[f] }));
  }
  function restore(bkId, who) { try { const ids = DB.backups.restore(bkId, null, who); return { ok: !!ids, ids: ids || [] }; } catch (e) { return { ok: false }; } }

  // EXPORT a set to a portable JSON (download / cloud)
  function exportSet(bkId) {
    const bk = all().find(b => b.id === bkId); if (!bk) return null;
    return JSON.stringify({ adeptio_backup: "2.4.5", id: bk.id, ts: bk.ts, kind: bk.kind, label: bk.label, stores: bk.stores, data: bk.data });
  }
  // IMPORT (admin upload) — validate, then write each store's tables (db_identity custody-excluded)
  function importFile(json, who) {
    let obj; try { obj = (typeof json === "string") ? JSON.parse(json) : json; } catch (e) { return { ok: false, err: "Not valid JSON — pick a backup file." }; }
    if (!obj || obj.adeptio_backup === undefined || !obj.data) return { ok: false, err: "Not an Adeptio backup file." };
    let n = 0, skipped = [];
    Object.keys(obj.data).forEach(id => {
      if (id === "db_identity") { skipped.push(id); return; } // custody: never restore credentials from an upload
      try { const raw = DB.raw && DB.raw(id); if (raw) { const snap = obj.data[id]; Object.keys(snap).forEach(t => { raw[t] = JSON.parse(JSON.stringify(snap[t])); }); if (DB.persist) DB.persist(id); n++; } } catch (e) {}
    });
    try { if (window.DB && DB.audit) DB.audit(who || "Thip N.", "backup.imported_file", (obj.id || "upload") + " · " + n + " stores restored" + (skipped.length ? " (identity excluded)" : ""), "upload"); } catch (e) {}
    try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {}
    return { ok: true, n, skipped, id: obj.id };
  }
  return { allIds, today, fullBackup, forceNow, runDaily, all, folders, restore, exportSet, importFile };
})();
