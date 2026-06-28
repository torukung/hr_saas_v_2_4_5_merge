/* ============================================================
   ADEPTIO · v2.3.2.db — shared DB-management views
   Reusable fragments for every persona's data section plus the
   System-Admin Database Studio & Backup Center. All rows are
   sample data — addable and deletable so the split-store model
   is easy to understand by touching it.
   ============================================================ */
window.DBV = (function () {
  const { icon, kpi, card, badge, idtag, rowitem, rowlist, empty } = UI;
  const tbl = UI.table;

  /* ---------- column helpers ---------- */
  function colsOf(store, table) {
    const first = DB.list(store, table)[0];
    if (!first) return [];
    return Object.keys(first).filter(k => { const v = first[k]; return typeof v !== "object" || v === null; }).slice(0, 7);
  }
  function keyOf(store, table) {
    const f = DB.list(store, table)[0] || {};
    return ["id", "code", "store", "name", "emp", "ts"].find(k => k in f) || Object.keys(f)[0] || "id";
  }
  const cell = (v) => v === undefined || v === null ? "—" : Array.isArray(v) ? `<span class="small muted">[${v.length} items]</span>` : /^\d+(\.\d+)?$/.test(String(v)) ? `<span class="num">${UI.esc(String(v))}</span>` : UI.esc(String(v));

  /* ---------- table editor — add & delete sample rows ---------- */
  function tableEditor(store, table, opts = {}) {
    const m = DB.meta(store);
    let rowsArr = DB.list(store, table);
    if (opts.filter) rowsArr = rowsArr.filter(opts.filter);
    const cols = colsOf(store, table);
    const keyF = keyOf(store, table);
    const immutable = !!m.append, derived = !!m.derived;
    const canDel = !immutable && !derived && opts.canDel !== false;
    const canAdd = !immutable && !derived && opts.canAdd !== false;

    const head = cols.map(c => ({ h: c })).concat(canDel ? [{ h: "", r: 1 }] : []);
    const body = rowsArr.length ? tbl(head, rowsArr.map(r => ({
      cells: cols.map(c => cell(r[c])).concat(canDel
        ? [`<button class="btn xs danger ghost-d" data-act="db-del:${store}:${table}:${keyF}:${UI.esc(String(r[keyF]))}" aria-label="Delete row ${UI.esc(String(r[keyF]))}">${icon("x")}</button>`] : [])
    }))) : empty("layers", "No rows", "Add a sample row below — or reseed the store.");

    const form = canAdd ? `
      <div class="dbform" id="dbf-${store}-${table}">
        ${cols.map(c => `<input class="input sm" data-f="${c}" placeholder="${c}${c === keyF ? " · auto" : ""}" aria-label="${c}">`).join("")}
        <button class="btn sm" data-act="db-add:${store}:${table}">${icon("plus")} Add row</button>
      </div>
      <span class="hint">Sample data — rows are deletable & addable. Every change persists to <span class="mono">${m.physical}</span> and lands on db_audit.</span>` : "";

    const note = immutable ? `<p class="small muted" style="margin-top:10px">${icon("lock", "lk")} Append-only — the ledger never edits or deletes. New facts arrive from the event bus only.</p>`
      : derived ? `<p class="small muted" style="margin-top:10px">${icon("refresh", "lk")} Derived view — never written directly. Rebuilt from the event ledger (B3 replay).</p>` : "";

    return body + note + form;
  }

  /* ---------- store cards grid ---------- */
  function storeGrid(go, ids) {
    const list = ids ? DB.CATALOG.filter(c => ids.includes(c.id)) : DB.CATALOG;
    return `<div class="dbgrid">` + list.map(c => {
      const m = DB.meta(c.id), pol = DB.policy(c.id);
      const off = !m.provisioned;
      return `<article class="card stcard ${off ? "off" : ""}" ${go && !off ? `data-go="${go}/${c.id}" role="button" tabindex="0"` : off ? `data-act="${UI.lockMsg(c.name + " store", DATA.unlockLabel(c.gate))}"` : ""}>
        <div class="st-top">${icon(c.icon)}<span class="mono small">${m.physical}</span><span style="flex:1"></span>${off ? UI.lockTag(DATA.unlockLabel(c.gate)) : badge(c.derived ? "readonly" : "active")}</div>
        <h3 class="st-name">${c.name} <span class="mono small muted">${c.id}</span></h3>
        <div class="small muted">${c.layer} · ${c.profile} · one writer: ${c.writer}</div>
        <div class="st-stats"><span><b class="num">${off ? "○" : m.rows}</b> rows</span><span><b class="num">${off ? "—" : m.sizeKB}</b> KB</span><span class="small muted">backup · ${pol && pol.enabled ? pol.freq : c.derived ? "rebuild" : "off"}</span></div>
      </article>`;
    }).join("") + `</div>`;
  }

  /* ---------- tenant × store provisioning grid (Blueprint §02) ---------- */
  function provisionGrid() {
    const tenants = [
      { id: DB.TENANT, label: "phoungern (this demo)", live: true },
      { id: "bolikhan", label: "bolikhan", live: false },
      { id: "vte-coffee", label: "vte-coffee", live: false }
    ];
    const head = [{ h: "tenant" }].concat(DB.CATALOG.filter(c => !c.global).map(c => ({ h: c.id.replace(/^d[bw]_/, ""), r: 1 })));
    const rows = tenants.map(tn => ({
      cells: [`<span class="mono small ${tn.live ? "strong" : "muted"}">${tn.id}</span>`].concat(
        DB.CATALOG.filter(c => !c.global).map(c => {
          const on = tn.live ? DB.provisioned(c.id) : (c.id !== "db_docs" && c.id !== "dw_reports" ? true : c.id === "dw_reports");
          return `<span title="${tn.id}-${c.id.replace(/^d[bw]_/, "")}" style="font-size:13px;color:${on ? "var(--ok)" : "var(--muted-2)"}">${on ? "●" : "○"}</span>`;
        }))
    }));
    return tbl(head, rows) + `<p class="small muted" style="margin-top:10px">● provisioned · ○ not yet (tier or flag) — one small database per <b>tenant × store</b>; <span class="mono">db_platform</span> is the single global exception. Blast radius of any failure: 1 module × 1 tenant.</p>`;
  }

  /* ---------- backup ladder explainer ---------- */
  function ladder() {
    return rowlist([
      rowitem({ icon: "pulse", title: "B1 · Continuous — provider PITR", sub: "Backup at every commit · restore any single DB to any moment (here: every write persists instantly)", side: `<span class="badge ok plain">RPO ≈ 0</span>` }),
      rowitem({ icon: "download", title: "B2 · Nightly — our exports", sub: "Scheduled job walks the registry, dumps every active DB to object storage we control (the snapshots below)", side: `<span class="badge plain">RPO ≤ 24 h</span>` }),
      rowitem({ icon: "refresh", title: "B3 · Replay — the event ledger", sub: "Facts in db_audit replay any store forward · rebuilds dw_reports from nothing", side: `<span class="badge acc plain">closes the gap</span>` })
    ]);
  }

  /* ---------- backup center (Now · Scheduled · Selectable · Per-module) ---------- */
  function backupCenter(goPrefix) {
    const bks = DB.backups.all();
    const pols = DB.list("db_platform", "backup_policies");
    const kindBadge = (k) => k === "scheduled" ? `<span class="badge plain">scheduled</span>` : k === "pre-run" ? `<span class="badge warn plain">pre-run branch</span>` : k === "drill" ? `<span class="badge acc plain">drill</span>` : `<span class="badge ok plain">manual</span>`;

    const select = `
      <div class="bk-pick">
        ${DB.CATALOG.map(c => {
          const off = !DB.provisioned(c.id);
          return `<label class="bk-chip ${off ? "off" : ""}"><input type="checkbox" class="bk-sel" value="${c.id}" ${off ? "disabled" : "checked"}>
            <span>${icon(c.icon)} ${c.id}</span></label>`;
        }).join("")}
      </div>
      <div class="dbform" style="margin-top:12px">
        <input class="input sm" id="bk-label" placeholder="Label (optional) — e.g. before payroll migration" style="flex:2;min-width:220px">
        <button class="btn" data-act="backup-now">${icon("download")} Back up now</button>
        <button class="btn ghost" data-act="db-export">${icon("file")} Export selected (JSON)</button>
      </div>
      <span class="hint">Selectable per store — uncheck what you don't need. Snapshot lands in the custodial area (L-CU) below; export downloads a portable JSON (the "plain SQLite file" of this demo — readable anywhere, vendor-independent).</span>`;

    const schedule = tbl(
      [{ h: "Store" }, { h: "On" }, { h: "Frequency" }, { h: "Custody" }, { h: "Extra protection" }, { h: "Last run", r: 1 }],
      pols.map(p => {
        const c = DB.CATALOG.find(x => x.id === p.store) || {};
        const off = !DB.provisioned(p.store);
        const freqs = ["off", "hourly", "6-hourly", "nightly", "daily-worm", "weekly", "monthly"];
        return { cells: [
          `<span class="strong">${icon(c.icon || "grid")} ${p.store}</span><div class="small muted">${c.name || ""}</div>`,
          `<input type="checkbox" class="sc-on" data-store="${p.store}" ${p.enabled && !off ? "checked" : ""} ${off ? "disabled" : ""} aria-label="Enable schedule for ${p.store}">`,
          off ? `<span class="small muted">store not provisioned</span>` : `<select class="input sm sc-freq" data-store="${p.store}" aria-label="Frequency for ${p.store}">${freqs.map(f => `<option ${f === p.freq ? "selected" : ""}>${f}</option>`).join("")}</select>`,
          `<span class="small muted">${p.custody}</span>`,
          `<span class="small">${p.prerun ? "branch before every pay run · " : ""}${p.store === "db_audit" ? "WORM (object-lock) · " : ""}${p.note || "retention " + p.retention}</span>`,
          p.last ? `<span class="small mono">${new Date(p.last).toTimeString().slice(0, 5)}</span>` : `<span class="small muted">due next tick</span>`
        ] };
      })) + `<p class="small muted" style="margin-top:10px">Cross-customizable per module — each store keeps its own frequency, custody and retention. The scheduler walks this registry (a due store is exported on the next 1-minute tick; overdue stores catch up on load).</p>`;

    const history = bks.length ? tbl(
      [{ h: "Snapshot" }, { h: "When" }, { h: "Kind" }, { h: "Stores", r: 1 }, { h: "Rows", r: 1 }, { h: "Size", r: 1 }, { h: "", r: 1 }],
      bks.map(b => ({ cells: [
        `${idtag(b.id)}<div class="small muted">${UI.esc(b.label || "")}</div>`,
        `<span class="small mono">${b.ts}</span>`, kindBadge(b.kind),
        `<span class="num" title="${b.stores.join(", ")}">${b.stores.length}</span>`,
        `<span class="num">${b.rows}</span>`, `<span class="num">${b.sizeKB} KB</span>`,
        `<span style="display:inline-flex;gap:6px">
          <button class="btn xs soft" data-act="backup-restore:${b.id}" title="Restore the stores in this snapshot">${icon("refresh")} Restore</button>
          <button class="btn xs ghost" data-act="backup-dl:${b.id}" title="Download JSON">${icon("download")}</button>
          <button class="btn xs ghost" data-act="backup-del:${b.id}" title="Expire snapshot">${icon("x")}</button>
        </span>`
      ] }))) : empty("download", "No snapshots yet", "Back up now above — or wait for the scheduler's next tick.");

    const drills = DB.list("db_platform", "drills");
    const drillCard = rowlist(drills.slice(0, 4).map(d => rowitem({
      icon: d.result === "pass" ? "check" : "alert", neutral: d.result !== "pass",
      title: d.id + " · " + d.target, sub: d.ts + " · " + d.checks,
      side: d.result === "pass" ? badge("ok") : badge("failed")
    }))) + `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="btn sm soft" data-act="drill">${icon("shield")} Run restore drill</button>
      <button class="btn sm ghost" data-act="dw-rebuild">${icon("refresh")} Rebuild dw_reports (B3 replay)</button>
    </div><p class="small muted" style="margin-top:10px">P5 — restore is a habit, not a hope. The drill branches a random store, restores it to scratch and compares integrity, row counts and checksums; the result is audit-logged.</p>`;

    return { select, schedule, history, drillCard };
  }

  /* ---------- demo reset panel — sectional, per store (Admin only) ---------- */
  function resetPanel() {
    const rows = DB.CATALOG.map(c => {
      const off = !DB.provisioned(c.id);
      return rowitem({
        icon: c.icon, neutral: off,
        title: `${c.id} <span class="small muted">· ${c.name}</span>`,
        sub: off ? "not provisioned on this tier — reseeds anyway (data waits behind the flag)" : `${DB.rows(c.id)} rows · ${DB.sizeKB(c.id)} KB · resets to factory sample data`,
        side: `<button class="btn xs soft" data-act="db-reset:${c.id}" aria-label="Reset ${c.id}">${icon("refresh")} Reset</button>`
      });
    });
    return rowlist(rows) + `
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn soft" data-act="db-reset:all">${icon("refresh")} Reset all stores</button>
        <button class="btn danger" data-act="db-factory">${icon("alert")} Factory reset — stores + snapshots</button>
      </div>
      <p class="small muted" style="margin-top:10px">Demo controls. <b>Reset</b> reseeds one store only — blast radius stays 1 module × 1 tenant, other stores keep your changes. <b>Reset all</b> reseeds every store but keeps the snapshot history. <b>Factory reset</b> also clears the custodial backup area (L-CU) and re-arms the schedules — a clean slate for the next walkthrough. Every reset is audit-logged.</p>`;
  }

  /* ---------- one-store detail (drill page body) ---------- */
  function storeDetail(storeId) {
    const m = DB.meta(storeId);
    const r = DB.regRow(storeId), p = DB.policy(storeId);
    const lastBk = DB.backups.all().find(b => b.stores.includes(storeId));
    const regCard = `<div class="mono small reg">tenant: ${DB.TENANT}   store: ${storeId}   status: ${r ? r.status : "active"}
physical: ${m.physical}   group: ${r ? r.group : "apac-core"}   region: ${r ? r.region : "aws-ap-southeast-1"}
schema_parent: ${r ? r.schema : "—"}
credential: ${r ? r.credential : "—"}   # single writer — R1 by key
encryption: ${r ? r.encryption : "at-rest"}   pitr_window: ${r ? r.pitr : "30 d"}
exports: ${p ? p.freq : "nightly"} → r2://adeptio-backups/${DB.TENANT}/${storeId.replace(/^d[bw]_/, "")}/</div>`;
    const tables = m.tables.map(tn => card(storeId + " · " + tn, tableEditor(storeId, tn), { icon: "list" })).join("");
    return { m, p, lastBk, regCard, tables };
  }

  return { tableEditor, storeGrid, provisionGrid, ladder, backupCenter, storeDetail, resetPanel, colsOf, keyOf };
})();
