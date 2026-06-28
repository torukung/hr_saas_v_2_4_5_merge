/* ============================================================
   ADEPTIO · v2.4.5 Merged — Cloudflare D1 replication (local-first)
   localStorage stays the working store (js/db.js · instant UI,
   works offline / file://); this module REPLICATES every operational
   store to Cloudflare D1 every ~30s by calling the deployed Worker
   (worker/src/v245.js · GET/PUT /api/sync[/:store]).

   Local-first, not hybrid-authoritative:
   - every DB.persist(id) enqueues the store in a localStorage outbox;
     the 30s interval PUTs each dirty store wholesale to D1
     (PUT /api/sync/:store  body { tables, v }).
   - on boot (and on the badge click) a pull compares remote.updated
     vs the local envelope t per store → last-writer-wins at store
     granularity; strictly-newer remote stores hydrate in (DB.hydrate,
     which does NOT re-enqueue → no echo loop) and the UI re-renders.
   - no config (empty API_CONFIG.base) → everything degrades to
     local-only exactly: enabled=false, no network, no interval, no badge.

   CUSTODY FLIP (B1): db_identity is server-authoritative — the edge
   Worker owns its credentials; the browser NEVER pushes or pulls
   db_identity (guarded in enqueue / flush / pull). The Worker also
   403s it on GET/PUT. Only the operational stores ride this sync.

   NODE-SAFE: every browser global (document, fetch, setInterval,
   navigator, window events, CustomEvent) is behind a typeof guard;
   nothing auto-fetches or schedules a timer at eval time unless
   enabled && typeof document!=='undefined'. tools/sync-smoke.js evals
   this file in bare node and drives flush()/pull() by hand.
   ============================================================ */
window.SYNC = (function () {
  "use strict";
  const CFG = (typeof window !== "undefined" && window.API_CONFIG) || {};
  const base = String(CFG.base || "").replace(/\/+$/, "");   // trailing slash stripped
  const enabled = !!base;                                    // empty base → local-only
  const SYNC_MS = (CFG.syncSeconds || 30) * 1000;
  const NS = "adeptio.v245.sync.";
  // custody flip — credential store never leaves the device via this path.
  const skip = (id) => id === "db_identity";

  /* ---------- outbox (survives reloads → offline writes drain later) ---------- */
  function obGet() { try { return JSON.parse(localStorage.getItem(NS + "outbox") || "[]"); } catch (e) { return []; } }
  function obSave(a) { try { localStorage.setItem(NS + "outbox", JSON.stringify(a)); } catch (e) { /* fine */ } }
  let flushing = false;

  function enqueue(id) {
    if (!enabled || skip(id)) return;          // local-only or custody → never queue
    const ob = obGet();
    if (ob.indexOf(id) < 0) { ob.push(id); obSave(ob); }   // dedup; the 30s interval pushes
  }

  /* ---------- push: PUT each dirty store wholesale to D1 ---------- */
  async function flush() {
    if (!enabled || flushing) return;
    const ids = obGet();
    if (!ids.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline", ids.length + " store(s) queued");
      return;
    }
    flushing = true;
    setStatus("syncing", "pushing " + ids.length + " store(s)");
    const pushed = [];
    try {
      for (const id of ids) {
        if (skip(id)) { obSave(obGet().filter(x => x !== id)); continue; }  // never push identity
        const meta = DB.localMeta(id) || {};
        const res = await fetch(base + "/api/sync/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tables: DB.raw(id), v: meta.v || 12 })
        });
        if (res && res.ok) {
          obSave(obGet().filter(x => x !== id));   // re-dirtied during flight stays queued
          pushed.push(id);
        }
      }
      setStatus("synced", "last push " + new Date().toLocaleTimeString());
      // audit the push as a fact — but ONLY when a non-audit store moved, otherwise the
      // audit write itself re-dirties db_audit and the loop would never settle.
      if (pushed.some(id => id !== "db_audit")) {
        try { DB.audit("system", "cloud.sync_pushed", pushed.join(", ") + " → D1", "sync"); } catch (e) { /* optional */ }
      }
    } catch (e) {
      setStatus("error", String(e && e.message || e));
    } finally { flushing = false; }
    return { pushed };
  }

  /* ---------- pull on load: store-granular last-writer-wins ---------- */
  async function pull() {
    if (!enabled) return { pulled: [] };
    let hydrated = 0;
    const pulled = [];
    try {
      const res = await fetch(base + "/api/sync");
      const out = (res && res.json) ? await res.json() : null;
      const stores = (out && out.stores) || [];
      const dirty = obGet();
      for (const remote of stores) {
        const id = remote && remote.store;
        if (!id || skip(id)) continue;                       // identity is the Worker's
        let parsed = remote.tables;
        try { parsed = (typeof parsed === "string") ? JSON.parse(parsed) : parsed; } catch (e) { continue; }
        if (!parsed) continue;
        const loc = DB.localMeta(id) || { t: 0 };
        if (dirty.indexOf(id) >= 0) { continue; }            // local writes pending → local wins (already queued to push)
        if (Number(remote.updated) > (loc.t || 0)) {
          if (DB.hydrate(id, parsed, Number(remote.updated))) { hydrated++; pulled.push(id); }   // hydrate does NOT enqueue → no echo
        }
      }
      if (hydrated && typeof window !== "undefined" && window.DATA && DATA.pulse) DATA.pulse();
      setStatus("synced", hydrated ? hydrated + " store(s) pulled from cloud" : "cloud and cache in step");
    } catch (e) {
      setStatus("error", String(e && e.message || e));
    }
    return { pulled };
  }

  /* ---------- status badge (browser only) ---------- */
  let state = { status: enabled ? "boot" : "off", detail: "" };
  function setStatus(status, detail) {
    state = { status, detail: detail || "" };
    if (typeof document !== "undefined") {
      try { document.dispatchEvent(new CustomEvent("sync:status", { detail: state })); } catch (e) { /* node */ }
    }
    paint();
  }
  function paint() {
    if (typeof document === "undefined" || !enabled) return;
    let el;
    try { el = document.getElementById("d1-badge"); } catch (e) { return; }
    if (!el) {
      try {
        el = document.createElement("button");
        el.id = "d1-badge";
        el.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9999;font:600 11px/1 system-ui;padding:7px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.12);box-shadow:0 2px 10px rgba(0,0,0,.10);cursor:pointer;background:#fff;color:#444";
        el.onclick = () => { flush().then(() => pull()).catch(e => setStatus("error", String(e && e.message || e))); };
        const mount = () => document.body && document.body.appendChild(el);
        document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);
      } catch (e) { return; }
    }
    const M = {
      boot:    ["#999", "☁ D1 · connecting…"],
      syncing: ["#b8860b", "☁ D1 · syncing"],
      synced:  ["#2e7d32", "☁ D1 · synced"],
      offline: ["#b8860b", "☁ D1 · offline"],
      error:   ["#c62828", "☁ D1 · error"]
    };
    const m = M[state.status] || M.boot;
    el.style.color = m[0]; el.textContent = m[1]; el.title = state.detail || "";
  }

  /* ---------- boot (browser + configured only) ---------- */
  if (enabled && typeof document !== "undefined") {
    setStatus("boot", "contacting D1 Worker");
    setTimeout(() => { pull().catch(e => setStatus("error", String(e && e.message || e))); }, 300);
    setInterval(() => { if (obGet().length) flush(); }, SYNC_MS);   // replicate every ~30s
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", () => flush());
    }
  }

  return { enabled, enqueue, flush, pull, status: () => state };
})();
