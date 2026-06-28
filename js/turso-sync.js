/* ============================================================
   ADEPTIO · v2.4.1.edge.auth — Turso hybrid sync (offline-first)
   Blueprint v2.3.2 §02/§05 made real: localStorage remains the
   working cache (instant UI, works offline / file://), Turso is
   the durable cloud copy. One database, table groups prefixed per
   store (people_employees, time_punches, …) so per-store restore
   keeps its blast radius.

   v2.4.1 CUSTODY FLIP (B1): db_identity is server-authoritative —
   the edge Worker owns its credentials in this same database, so
   the browser NEVER pushes or pulls db_identity (guarded in
   enqueue / flush / pull). Only operational stores ride this token.

   Sync model (demo-grade, honest about it):
   - every DB.persist(id) enqueues the store in a localStorage
     outbox → debounced push replaces that store's table group
     wholesale inside one transaction (tables are small)
   - on load: compare sync_meta.updated_at (remote) vs the local
     envelope t per store → last-writer-wins at store granularity;
     newer remote stores hydrate in and the UI re-renders
   - offline / no config → everything degrades to local-only
     behavior exactly; outbox drains when the network returns
   ============================================================ */
window.TURSO = (function () {
  "use strict";
  const CFG = window.TURSO_CONFIG || {};
  const NS = "adeptio.v241.turso.";
  const enabled = !!(CFG.url && CFG.token);
  // custody flip (v2.4.1): credential stores never ride the browser token.
  const serverAuthoritative = (id) => id === "db_identity";

  /* ---------- naming: store → table group ---------- */
  const grp = id => id.replace(/^d[bw]_/, "");          // db_people → people, dw_reports → reports
  const tname = (id, t) => grp(id) + "_" + t;           // people_employees, leave_leave_types, …

  /* ---------- libsql HTTP pipeline ---------- */
  const baseUrl = String(CFG.url || "").replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
  async function pipeline(stmts) {
    const res = await fetch(baseUrl + "/v2/pipeline", {
      method: "POST",
      headers: { "Authorization": "Bearer " + CFG.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: stmts.map(s => ({ type: "execute", stmt: (typeof s === "string") ? { sql: s } : s }))
                       .concat([{ type: "close" }])
      })
    });
    if (!res.ok) throw new Error("Turso HTTP " + res.status);
    const out = await res.json();
    return (out.results || []).map(r => {
      if (r.type === "error") throw new Error((r.error && r.error.message) || "statement failed");
      return r.response && r.response.result ? r.response.result : null;
    });
  }
  const cells = result => (result && result.rows ? result.rows.map(row => row.map(c => (c && c.value !== undefined ? c.value : null))) : []);
  const arg = v => (v === null || v === undefined) ? { type: "null", value: null }
    : (typeof v === "number") ? { type: Number.isInteger(v) ? "integer" : "float", value: String(v) }
    : { type: "text", value: String(v) };

  /* ---------- schema: 10 table groups + sync_meta ---------- */
  function schemaStmts() {
    const out = ["CREATE TABLE IF NOT EXISTS sync_meta (store TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, seed_v INTEGER, device TEXT)"];
    DB.CATALOG.forEach(c => c.tables.forEach(t =>
      out.push("CREATE TABLE IF NOT EXISTS " + tname(c.id, t) + " (pos INTEGER NOT NULL, pk TEXT, json TEXT NOT NULL)")));
    return out;
  }
  async function ensureSchema() {
    const sig = "v1:" + DB.CATALOG.map(c => c.id + ":" + c.tables.join(",")).join("|");
    try { if (localStorage.getItem(NS + "schema") === sig) return; } catch (e) { /* fall through */ }
    await pipeline(schemaStmts());
    try { localStorage.setItem(NS + "schema", sig); } catch (e) { /* fine */ }
  }

  /* ---------- outbox (survives reloads → offline writes drain later) ---------- */
  function obGet() { try { return JSON.parse(localStorage.getItem(NS + "outbox") || "[]"); } catch (e) { return []; } }
  function obSave(a) { try { localStorage.setItem(NS + "outbox", JSON.stringify(a)); } catch (e) { /* fine */ } }
  let flushTimer = null, flushing = false;

  function enqueue(storeId) {
    if (!enabled) return;
    if (serverAuthoritative(storeId)) return; // custody flip — identity never leaves the device via this token
    const ob = obGet();
    if (ob.indexOf(storeId) < 0) { ob.push(storeId); obSave(ob); }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { flush(); }, 1200);
  }

  /* push one store: replace its table group wholesale in one transaction.
     v2.4.0.db.auth — sensitive custody: live sessions & tokens NEVER leave
     the device; the cloud copy of db_identity holds accounts + policies only. */
  const custodySkip = (cat, tb) => !!(cat && cat.sensitive && (tb === "sessions" || tb === "tokens"));
  function pushStmts(storeId, t) {
    const cat = DB.CATALOG.find(c => c.id === storeId);
    const tables = DB.raw(storeId) || {};
    const stmts = ["BEGIN"];
    cat.tables.forEach(tb => {
      const tn = tname(storeId, tb);
      stmts.push("DELETE FROM " + tn);
      const rows = custodySkip(cat, tb) ? [] : (Array.isArray(tables[tb]) ? tables[tb] : []);
      for (let i = 0; i < rows.length; i += 40) {           // chunked multi-row inserts
        const chunk = rows.slice(i, i + 40);
        const sql = "INSERT INTO " + tn + " (pos, pk, json) VALUES " + chunk.map(() => "(?,?,?)").join(",");
        const args = [];
        chunk.forEach((r, j) => { args.push(arg(i + j), arg(r && (r.id || r.code || r.name) || null), arg(JSON.stringify(r))); });
        stmts.push({ sql, args });
      }
    });
    stmts.push({
      sql: "INSERT INTO sync_meta (store, updated_at, seed_v, device) VALUES (?,?,?,?) " +
           "ON CONFLICT(store) DO UPDATE SET updated_at=excluded.updated_at, seed_v=excluded.seed_v, device=excluded.device",
      args: [arg(storeId), arg(t), arg((DB.localMeta(storeId) || {}).v || 0), arg(device())]
    });
    stmts.push("COMMIT");
    return stmts;
  }

  async function flush() {
    if (!enabled || flushing) return;
    const ids = obGet();
    if (!ids.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setStatus("offline", ids.length + " store(s) queued"); return; }
    flushing = true; setStatus("syncing", "pushing " + ids.length + " store(s)");
    try {
      await ensureSchema();
      for (const id of ids) {
        if (serverAuthoritative(id)) { obSave(obGet().filter(x => x !== id)); continue; } // never push identity
        const meta = DB.localMeta(id);
        await pipeline(pushStmts(id, (meta && meta.t) || Date.now()));
        obSave(obGet().filter(x => x !== id));              // re-dirtied during flight stays queued
      }
      setStatus("synced", "last push " + new Date().toLocaleTimeString());
      // audit the push as a fact — but only when real stores moved, otherwise the
      // audit fact itself would re-dirty db_audit and the loop would never settle
      if (ids.some(id => id !== "db_audit")) {
        try { DB.audit("system", "cloud.sync_pushed", ids.join(", ") + " → Turso", "sync"); } catch (e) { /* optional */ }
      }
    } catch (e) {
      setStatus("error", String(e.message || e));
    } finally { flushing = false; }
  }

  /* ---------- pull on load: store-granular last-writer-wins ---------- */
  async function pull() {
    await ensureSchema();
    const metaRes = await pipeline(["SELECT store, updated_at, seed_v FROM sync_meta"]);
    const remote = {};
    cells(metaRes[0]).forEach(r => { remote[r[0]] = { t: Number(r[1]) || 0, v: Number(r[2]) || 0 }; });
    const dirty = obGet();
    const toPull = [], toPush = [];
    DB.CATALOG.forEach(c => {
      if (serverAuthoritative(c.id)) return; // identity is the Worker's — the browser never hydrates it
      const loc = DB.localMeta(c.id) || { t: 0, v: 0 };
      const rem = remote[c.id];
      if (!rem) { toPush.push(c.id); return; }              // never seen in cloud → push
      if (dirty.indexOf(c.id) >= 0) return;                  // local writes pending → push wins
      if (rem.v !== loc.v) { toPush.push(c.id); return; }    // seed-version mismatch → local wins
      if (rem.t > loc.t) toPull.push(c.id);                  // remote newer → hydrate
      else if (loc.t > rem.t) toPush.push(c.id);             // local newer → push
    });
    let hydrated = 0;
    for (const id of toPull) {
      const cat = DB.CATALOG.find(c => c.id === id);
      const res = await pipeline(cat.tables.map(tb => "SELECT json FROM " + tname(id, tb) + " ORDER BY pos"));
      const tables = {};
      cat.tables.forEach((tb, i) => { tables[tb] = cells(res[i]).map(r => { try { return JSON.parse(r[0]); } catch (e) { return null; } }).filter(Boolean); });
      if (cat.sensitive) { // custody: a pull recreates access state, never live logins
        const live = DB.raw(id) || {};
        tables.sessions = live.sessions || [];
        tables.tokens = live.tokens || [];
      }
      if (DB.hydrate(id, tables, remote[id].t)) hydrated++;
    }
    if (toPush.length) { const ob = obGet(); toPush.forEach(id => { if (ob.indexOf(id) < 0) ob.push(id); }); obSave(ob); flush(); }
    if (hydrated && window.DATA && DATA.pulse) DATA.pulse();
    setStatus("synced", hydrated ? hydrated + " store(s) pulled from cloud" : "cloud and cache in step");
    return { pulled: toPull, pushed: toPush };
  }

  /* ---------- device tag + status badge ---------- */
  function device() {
    try {
      let d = localStorage.getItem(NS + "device");
      if (!d) { d = "dev-" + Math.random().toString(36).slice(2, 8); localStorage.setItem(NS + "device", d); }
      return d;
    } catch (e) { return "dev-anon"; }
  }
  let state = { status: enabled ? "boot" : "off", detail: "" };
  function setStatus(status, detail) {
    state = { status, detail: detail || "" };
    try { document.dispatchEvent(new CustomEvent("turso:status", { detail: state })); } catch (e) { /* node */ }
    paint();
  }
  function paint() {
    if (typeof document === "undefined" || !enabled) return;
    let el = document.getElementById("turso-badge");
    if (!el) {
      el = document.createElement("button");
      el.id = "turso-badge";
      el.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9999;font:600 11px/1 system-ui;padding:7px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.12);box-shadow:0 2px 10px rgba(0,0,0,.10);cursor:pointer;background:#fff;color:#444";
      el.onclick = () => { flush(); pull().catch(e => setStatus("error", String(e.message || e))); };
      const mount = () => document.body && document.body.appendChild(el);
      document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);
    }
    const M = {
      boot:    ["#999", "☁ connecting…"],
      syncing: ["#b8860b", "☁ syncing…"],
      synced:  ["#2e7d32", "☁ Turso · synced"],
      offline: ["#b8860b", "☁ offline · queued"],
      error:   ["#c62828", "☁ sync error"]
    };
    const m = M[state.status] || M.boot;
    el.style.color = m[0]; el.textContent = m[1]; el.title = state.detail || "";
  }

  /* ---------- boot ---------- */
  if (enabled && typeof document !== "undefined") {
    setStatus("boot", "contacting Turso");
    setTimeout(() => { pull().catch(e => setStatus("error", String(e.message || e))); }, 300);
    setInterval(() => { if (obGet().length) flush(); }, 30000);   // drain outbox even after errors
    window.addEventListener("online", () => flush());
  }

  return { enabled, enqueue, flush, pull, status: () => state };
})();
