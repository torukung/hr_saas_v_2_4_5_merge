/* ============================================================
   ADEPTIO · v2.4.1.edge.auth — the Provisioning sub-cell (B5)
   File import + directory delta-sync, writing db_identity's
   import_jobs / sync_runs tables. One writer convention: account
   creation/link/mode goes through the Identity cell (AUTH.*),
   never around it; this cell orchestrates the batch + the queue.

   B5 promises:
   - CSV / Excel(→CSV) import: dry-run preview, dupe-by-email,
     credential mode per batch, an import report + a notice mail.
   - Read-only LDAP/AD delta sync: create · link · suspend proposals
     in a REVIEW queue (attributes never credentials); conflicts
     (address ↔ owner clash) are held, never auto-applied.
   Facts: import.batch · sync.run · sync.conflict · sync.applied.
   No DOM here — node-runnable for tools/auth-smoke.js.
   ============================================================ */
window.PROV = (function () {
  const T = (tb) => DB.list("db_identity", tb);
  const save = () => DB.persist("db_identity");
  const fact = (who, act, obj) => DB.audit(who, act, obj, "provision");
  const stamp = () => DB.stamp();
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- CSV / TSV parser (no deps; quoted fields + "" escapes) ---------- */
  function parse(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim() !== "");
    if (!lines.length) return { headers: [], rows: [] };
    const delim = (lines[0].indexOf("\t") >= 0 && lines[0].indexOf(",") < 0) ? "\t" : ",";
    const splitLine = (line) => {
      const out = []; let cur = "", q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
        else { if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ""; } else cur += c; }
      }
      out.push(cur); return out.map(s => s.trim());
    };
    const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i]); const o = {};
      headers.forEach((h, j) => o[h] = cells[j] !== undefined ? cells[j] : "");
      rows.push(o);
    }
    return { headers, rows };
  }
  const normalize = (r) => ({
    email: (r.email || r.mail || r.upn || "").trim().toLowerCase(),
    name: (r.name || r.fullname || ((r.firstname || "") + " " + (r.lastname || "")).trim()).trim(),
    emp: (r.emp || r.empid || r.employeeid || r.id || "").trim().toUpperCase(),
    scope: (r.scope || r.role || "staff").trim().toLowerCase(),
    mode: (r.mode || r.credential || "").trim().toLowerCase()
  });

  /* ---------- import · dry-run (no writes) ---------- */
  function dryRun(text, opts) {
    opts = opts || {};
    const batchMode = ["local", "ldap", "radius"].includes(opts.mode) ? opts.mode : "local";
    const { headers, rows } = parse(text);
    const seen = {};
    const items = rows.map((raw, i) => {
      const r = normalize(raw);
      const mode = ["local", "ldap", "radius"].includes(r.mode) ? r.mode : batchMode;
      let action = "create", note = "new account", level = "ok";
      if (!EMAIL.test(r.email)) { action = "error"; level = "bad"; note = "invalid or missing e-mail"; }
      else if (seen[r.email]) { action = "skip"; level = "warn"; note = "duplicate row in this file"; }
      else {
        const existing = AUTH.account(r.email);
        const empOwner = r.emp && AUTH.byEmp(r.emp);
        if (existing) { action = "link"; level = "warn"; note = "account exists — update role / mode"; }
        else if (empOwner && empOwner.email !== r.email) { action = "conflict"; level = "bad"; note = "EMP " + r.emp + " already holds " + empOwner.email; }
      }
      seen[r.email] = true;
      return Object.assign({ i, action, note, level }, r, { mode });
    });
    const tally = items.reduce((m, x) => { m[x.action] = (m[x.action] || 0) + 1; return m; }, {});
    return { headers, items, tally, mode: batchMode };
  }

  /* ---------- import · commit ---------- */
  function commitImport(text, opts, who) {
    opts = opts || {};
    const dr = dryRun(text, opts);
    const ts = stamp();
    let created = 0, linked = 0, errors = 0, dupes = 0, capped = 0;
    // v2.4.5 G8 — open-tier seat cap: re-check the LIVE seat count before EACH create so accounts created
    // earlier in this batch also count against the cap (no-op unless maxUsers is set). Binds across batches.
    dr.items.forEach(x => {
      if (x.action === "error" || x.action === "conflict") { errors++; return; }
      if (x.action === "skip") { dupes++; return; }
      if (x.action === "create") {
        let overCap = false;
        try { if (window.LICENSE && LICENSE.seatGuard) overCap = !LICENSE.seatGuard(1).ok; } catch (e) {}
        if (overCap) { capped++; return; }   // seat cap reached (live count) — defer this create
        if (x.mode === "local") {
          AUTH.invite({ emp: x.emp || null, name: x.name || x.email, email: x.email, scope: x.scope, who: who || "import" });
        } else {
          const scopes = x.scope === "manager" ? ["manager", "staff"] : x.scope === "hr" ? ["hr", "staff"] : [x.scope || "staff"];
          T("accounts").unshift({ email: x.email, name: x.name || x.email, emp: x.emp || null, scopes, status: "active", provider: x.mode, hash: null, fails: 0, lockedUntil: 0, lastLogin: null, created: ts });
          if (!AUTH.dirUser(x.email)) AUTH.dirAdd({ email: x.email, name: x.name, emp: x.emp, type: x.mode, role: x.scope }, who);
          save();
        }
        created++;
      } else if (x.action === "link") {
        AUTH.setMode(x.email, x.mode, { reason: "file import" }, who); linked++;
      }
    });
    const job = { id: nextId("IMP"), ts, who: who || "import", source: opts.source || "pasted.csv", rows: dr.items.length, created, linked, dupes, errors, capped, mode: dr.mode, state: "done", note: created + " created · " + linked + " linked · " + dupes + " dupe · " + errors + " error(s)" + (capped ? " · " + capped + " held (seat cap)" : "") };
    T("import_jobs").unshift(job); save();
    fact(who || "Vilayvanh C.", "import.batch", job.id + " · " + job.source + " · +" + created + " / link " + linked + " / err " + errors);
    AUTH.mail("sync_notice", "hr@phoungern.la", "HR", { kind: "import", created, linked, suspended: 0, conflicts: errors, link: "#/hr/web/import" }, who);
    if (window.DATA) DATA.pulse();
    return job;
  }

  /* ---------- directory delta-sync · diff → review queue ---------- */
  function diff(providerId) {
    const prov = AUTH.provider(providerId); if (!prov) return null;
    const dir = AUTH.directory().filter(d => d.type === prov.type);
    const queue = [];
    dir.forEach(d => {
      const acc = AUTH.account(d.email);
      const empOwner = d.emp && AUTH.byEmp(d.emp);
      const empClash = empOwner && empOwner.email !== d.email;
      const ownerClash = acc && d.emp && acc.emp && acc.emp !== d.emp;
      if (empClash || ownerClash) { queue.push({ action: "conflict", email: d.email, name: d.name, emp: d.emp, note: ownerClash ? d.email + " maps to a different employee" : "EMP " + d.emp + " already holds " + empOwner.email, level: "bad", decision: "skip" }); return; }
      if (!acc) { if (d.enabled) queue.push({ action: "create", email: d.email, name: d.name, emp: d.emp, mode: prov.type, role: d.role, note: "new in directory", level: "ok", decision: "approve" }); return; }
      if (!d.enabled && acc.status !== "disabled") { queue.push({ action: "suspend", email: d.email, name: d.name, emp: d.emp, note: "disabled in directory", level: "warn", decision: "approve" }); return; }
      if ((acc.provider || "local") === "local") { queue.push({ action: "link", email: d.email, name: d.name, emp: d.emp, mode: prov.type, note: "local account — link to the directory", level: "warn", decision: "approve" }); return; }
    });
    // accounts already bound to THIS directory that have vanished from it → propose suspend
    AUTH.accounts().filter(a => a.provider === prov.type && a.status === "active").forEach(a => {
      if (!AUTH.dirUser(a.email)) queue.push({ action: "suspend", email: a.email, name: a.name, emp: a.emp, note: "no longer present in the directory", level: "warn", decision: "approve" });
    });
    return { prov, queue };
  }
  function runSync(providerId, who) {
    const d = diff(providerId); if (!d) return null;
    const ts = stamp();
    // clear previous: any un-applied review run is superseded so only the freshest result stands
    T("sync_runs").forEach(r => { if (r.state === "review") { r.state = "superseded"; r.queue = []; } });
    const conflicts = d.queue.filter(x => x.action === "conflict").length;
    const run = { id: nextId("SYNC"), ts, who: who || "Thip N.", provider: providerId, scanned: AUTH.directory().filter(x => x.type === d.prov.type).length, created: 0, linked: 0, suspended: 0, conflicts, state: d.queue.length ? "review" : "done", queue: d.queue, note: d.queue.length ? d.queue.length + " proposal(s) — review queue" : "no changes since the last run" };
    T("sync_runs").unshift(run);
    if (d.prov) d.prov.lastSync = ts;
    save();
    fact(who || "Thip N.", "sync.run", run.id + " · " + providerId + " · " + d.queue.length + " proposal(s)");
    if (conflicts) fact(who || "Thip N.", "sync.conflict", run.id + " · " + conflicts + " address/owner clash(es) held for review");
    if (window.DATA) DATA.pulse();
    return run;
  }
  function decide(runId, idx, decision) {
    const run = T("sync_runs").find(r => r.id === runId);
    if (!run || !run.queue[idx]) return false;
    run.queue[idx].decision = decision === "approve" ? "approve" : "skip"; save();
    return true;
  }
  function applySync(runId, who) {
    const run = T("sync_runs").find(r => r.id === runId); if (!run) return null;
    let created = 0, linked = 0, suspended = 0;
    run.queue.forEach(x => {
      if (x.decision !== "approve") return;
      if (x.action === "create") {
        if (!AUTH.account(x.email)) {
          const scopes = x.role === "manager" ? ["manager", "staff"] : x.role === "hr" ? ["hr", "staff"] : [x.role || "staff"];
          T("accounts").unshift({ email: x.email, name: x.name, emp: x.emp || null, scopes, status: "active", provider: x.mode, hash: null, fails: 0, lockedUntil: 0, lastLogin: null, created: stamp() });
          created++;
        }
      } else if (x.action === "link") { AUTH.setMode(x.email, x.mode, { reason: "directory sync" }, who); linked++; }
      else if (x.action === "suspend") { const a = AUTH.account(x.email); if (a && a.status !== "disabled") { a.status = "disabled"; suspended++; } }
    });
    run.created = created; run.linked = linked; run.suspended = suspended; run.state = "done";
    save();
    fact(who || "Thip N.", "sync.applied", run.id + " · +" + created + " / link " + linked + " / suspend " + suspended);
    AUTH.mail("sync_notice", "sysadmin@phoungern.la", "Thip", { kind: "sync", created, linked, suspended, conflicts: run.conflicts, link: "#/sysadmin/web/sync" }, who);
    if (window.DATA) DATA.pulse();
    return run;
  }

  /* ---------- individual lookup — query one person, see status, bind them in ---------- */
  function statusOf(d) {
    const acc = AUTH.account(d.email);
    if (!d.enabled) return { status: "disabled in the directory", action: acc && acc.status !== "disabled" ? "suspend" : "none", level: "warn", acc };
    if (!acc) return { status: "in directory · no portal account yet", action: "create", level: "ok", acc: null };
    if (acc.status === "disabled") return { status: "portal access switched off", action: "none", level: "bad", acc };
    if ((acc.provider || "local") === "local") return { status: "local account — not linked to the directory", action: "link", level: "warn", acc };
    return { status: "bound to " + (acc.provider === "ldap" ? "LDAP/AD" : "RADIUS"), action: "bound", level: "ok", acc };
  }
  function search(query) {
    const qq = String(query || "").trim().toLowerCase();
    if (!qq) return [];
    const hit = (s) => String(s || "").toLowerCase().includes(qq);
    const dirs = AUTH.directory().filter(d => hit(d.email) || hit(d.name) || hit(d.sam) || hit(d.emp));
    const out = dirs.map(d => { const s = statusOf(d); return { source: "directory", email: d.email, name: d.name, emp: d.emp, type: d.type, group: d.group, enabled: d.enabled, status: s.status, action: s.action, level: s.level, mode: s.acc ? (s.acc.provider || "local") : null }; });
    // portal accounts that match but aren't in this directory (so the admin sees existing users too)
    AUTH.accounts().filter(a => (hit(a.email) || hit(a.name) || hit(a.emp)) && !dirs.some(d => d.email === a.email))
      .forEach(a => out.push({ source: "account", email: a.email, name: a.name, emp: a.emp, type: a.provider || "local", group: "—", enabled: a.status !== "disabled", status: "portal account (" + (a.provider || "local") + ") · not in this directory", action: "none", level: "", mode: a.provider || "local" }));
    return out;
  }
  // bind ONE directory user in: create the account (new) or link an existing local account
  function bindDirectoryUser(email, who) {
    const d = AUTH.dirUser(email);
    if (!d) return { ok: false, msg: "Not in the directory simulator." };
    const acc = AUTH.account(email);
    if (acc && (acc.provider || "local") !== "local") return { ok: true, noop: true, action: "already bound" };
    if (acc) { const r = AUTH.setMode(email, d.type, { reason: "individual bind" }, who); return r.ok ? { ok: true, action: "linked" } : r; }
    const scopes = d.role === "manager" ? ["manager", "staff"] : d.role === "hr" ? ["hr", "staff"] : [d.role || "staff"];
    T("accounts").unshift({ email, name: d.name, emp: d.emp || null, scopes, status: "active", provider: d.type, hash: null, fails: 0, lockedUntil: 0, lastLogin: null, created: stamp() });
    save();
    fact(who || "Thip N.", "auth.directory_bound", email + " · created " + d.type + " account from lookup");
    if (window.DATA) DATA.pulse();
    return { ok: true, action: "created" };
  }

  function nextId(prefix) {
    const tb = prefix === "IMP" ? "import_jobs" : "sync_runs";
    const n = T(tb).reduce((m, r) => Math.max(m, Number(String(r.id).replace(/\D/g, "")) || 0), 1000);
    return prefix + "-" + (n + 1);
  }
  const imports = () => T("import_jobs");
  const syncs = () => T("sync_runs");
  const syncRun = (id) => T("sync_runs").find(r => r.id === id);
  // a realistic sample for the wizard: 1 dupe (existing), 1 conflict-free local, 1 ldap, 1 bad row
  const sampleCSV = () =>
    "email,name,emp,scope,mode\n" +
    "noy@phoungern.la,Noy Keomany,EMP-0188,staff,local\n" +
    "bounmy@phoungern.la,Bounmy Latsavong,EMP-0205,staff,local\n" +
    "anousone@phoungern.la,Anousone Rattanavong,EMP-0134,manager,ldap\n" +
    "staff@phoungern.la,Souksavanh (existing),EMP-0214,staff,local\n" +
    "broken-row-no-email,Missing Email,EMP-0000,staff,local";

  return { parse, dryRun, commitImport, diff, runSync, decide, applySync, search, bindDirectoryUser, imports, syncs, syncRun, sampleCSV };
})();
