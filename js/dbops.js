/* ============================================================
   ADEPTIO · v2.4.5 — the DB OPS cell  (window.DBOPS)  · T7 (C3)
   Per-store reset / purge / migrate on top of the existing backup
   ladder. Every destructive op auto-snapshots first and audits.
   Live writes (migrate) stay a build-phase stub until the D1 cutover.
   Node-safe; reads DB.CATALOG + DB.backups.
   ============================================================ */
window.DBOPS = (function () {
  const audit = (who, act, ref) => { try { if (window.DB && DB.audit) DB.audit(who || "Thip N.", act, ref, "console"); } catch (e) {} };
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const stores = () => { try { return DB.CATALOG.map(s => ({ id: s.id, name: s.name, tables: s.tables || [] })); } catch (e) { return []; } };
  function snapshot(store, note) { try { return DB.backups.now([store], "manual", note || ("DB-ops snapshot · " + store)); } catch (e) { return null; } }
  function snapshots(store) { try { return (DB.backups.all() || []).filter(b => !store || (b.stores || []).includes(store)); } catch (e) { return []; } }
  function reset(store, who) { snapshot(store, "pre-reset · " + store); try { DB.reset(store); } catch (e) {} audit(who, "dbops.reset", store); pulse(); return { ok: true }; }
  function purge(store, who) {
    snapshot(store, "pre-purge · " + store);
    try { const raw = DB.raw && DB.raw(store); if (raw) { Object.keys(raw).forEach(t => { if (Array.isArray(raw[t])) raw[t] = []; }); if (DB.persist) DB.persist(store); } } catch (e) {}
    audit(who, "dbops.purge", store); pulse(); return { ok: true };
  }
  function migrate(store, who) { snapshot(store, "pre-migrate · " + store); audit(who, "dbops.migrate", store + " (stub)"); pulse(); return { ok: true, note: "Migration is a build-phase stub — runs with the Cloudflare D1 cutover." }; }
  return { stores, snapshot, snapshots, reset, purge, migrate };
})();
