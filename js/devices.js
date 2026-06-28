/* ============================================================
   ADEPTIO · v2.4.2.edge.auth — the DEVICES cell
   Biometric & gate integration over store 12 (db_devices).
   ------------------------------------------------------------
   One seam, three lanes (Hardware Brief, 24 Jun 2026):
     A · device-push   — ZKTeco PUSH/ADMS posts to /punch
     B · server-pull   — Hikvision ISAPI · Dahua HTTP · Suprema/Anviz cloud
     C · file/on-device — HIP CSV import · Sunmi PWA on the terminal
   Punches always land in db_time (one truth); this cell owns the
   registry + rolling telemetry, and the capture GROUPS that bind
   staff → a clock-in/out methodology. Connection facts only —
   device passwords / API keys are vault refs, never stored.
   Node-safe: guards window.* so tools/*.js (jsdom/node) run.
   ============================================================ */
window.DEVICES = (function () {
  const has = (f) => (window.DATA && DATA.has) ? DATA.has(f) : true;
  const pulse = () => { try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} };
  const audit = (who, act, obj, ip) => { try { if (window.DB && DB.audit) DB.audit(who, act, obj, ip || "console"); } catch (e) {} };
  const list = (t) => { try { return DB.list("db_devices", t) || []; } catch (e) { return []; } };

  /* ---------- the vendor catalogue — required params per brand ----------
     tier: which tier un-greys the connector (Pro biometrics · Ent gates/cloud/custom).
     lane: A push · B pull · C file/on-device · custom webhook.
     fields[].vault = secret held as a vault ref, never persisted in the store.
     ad: does an optional AD/RADIUS identity bind apply to this connector? */
  const VENDORS = [
    {
      id: "zkteco", name: "ZKTeco", tier: "biometrics", lane: "A", conf: "HIGH",
      proto: "PUSH / ADMS (device→server)", icon: "grid", ad: true,
      models: "K40 · MB460 · SpeedFace-V series",
      blurb: "Cheapest credible biometric and sold by nearly every CCTV/IT shop in Laos. Its PUSH/ADMS protocol posts punches straight to a URL you control — a clean match for the /punch seam. Integrate first.",
      fields: [
        { k: "sn", label: "Device serial (SN)", ph: "ZK6817A2390041", req: true, hint: "The device identifies itself by serial on every push." },
        { k: "commkey", label: "Comm key", ph: "••••••", type: "secret", vault: true, req: true, hint: "PUSH auth key — held as a vault ref." },
        { k: "pushurl", label: "Server push URL", type: "readonly", val: "https://edge.adeptio.hr/punch/zkteco", hint: "Set this on the device. It posts to /iclock/cdata here." },
        { k: "tz", label: "Timezone", type: "select", opts: ["Asia/Vientiane (+07)", "Asia/Bangkok (+07)", "UTC"], req: true },
        { k: "heartbeat", label: "Heartbeat (sec)", type: "number", val: 30 },
        { k: "txnint", label: "Transaction interval (sec)", type: "number", val: 10 }
      ]
    },
    {
      id: "hikvision", name: "Hikvision", tier: "biometrics", lane: "B", conf: "HIGH",
      proto: "ISAPI (HTTP REST) · HikCentral OpenAPI", icon: "eye", ad: true,
      models: "MinMoe DS-K1T341 / K1T671 face T&A",
      blurb: "The most-installed CCTV/access brand in Vientiane (via MOTAI). Face/access terminals expose ISAPI over HTTP. The spec is distributor-gated — plan a partner ask through MOTAI / Sysmatik.",
      fields: [
        { k: "host", label: "Host / IP", ph: "10.0.12.31", req: true },
        { k: "port", label: "Port", type: "number", val: 80 },
        { k: "user", label: "Username", ph: "admin", req: true },
        { k: "pass", label: "Password", type: "secret", vault: true, req: true },
        { k: "https", label: "Use HTTPS", type: "toggle", val: false },
        { k: "isapi", label: "ISAPI base path", ph: "/ISAPI", val: "/ISAPI" },
        { k: "cloud", label: "HikCentral / Hik-Connect OpenAPI", type: "cloud", tier: "deviceCloud", note: "Cloud OpenAPI (AppKey + AppSecret) for sites you can't reach on the LAN — Enterprise." }
      ]
    },
    {
      id: "dahua", name: "Dahua", tier: "biometrics", lane: "B", conf: "MED",
      proto: "HTTP API / SDK", icon: "eye", ad: true,
      models: "ASI series face / fingerprint terminals",
      blurb: "The consistent #2 — the default alternative whenever a buyer is quoting Hikvision. Mirrors the Hikvision HTTP adapter, so add it once that pattern is stable.",
      fields: [
        { k: "host", label: "Host / IP", ph: "10.0.22.10", req: true },
        { k: "port", label: "Port", type: "number", val: 80 },
        { k: "user", label: "Username", ph: "admin", req: true },
        { k: "pass", label: "Password", type: "secret", vault: true, req: true },
        { k: "https", label: "Use HTTPS", type: "toggle", val: false }
      ]
    },
    {
      id: "sunmi", name: "Sunmi", tier: "biometrics", lane: "C", conf: "HIGH",
      proto: "On-device PWA (no protocol)", icon: "phone", ad: false,
      models: "P2 / D-series Android terminals",
      blurb: "Android terminals that run the Adeptio PWA natively on the device — a 'no-protocol' route. The built-in camera does the selfie, the built-in scanner reads cards. Pairs to a site with an enrollment token.",
      fields: [
        { k: "token", label: "Enrollment token", type: "secret", vault: true, req: true, hint: "Pairs this terminal to the tenant + site." },
        { k: "site", label: "Paired site", type: "select", opts: ["Vientiane Plant 1", "Vientiane Plant 2", "Annex office"], req: true },
        { k: "scanner", label: "Scanner mode", type: "select", opts: ["Camera — face + selfie", "1D / 2D barcode", "NFC card"] },
        { k: "kioskpin", label: "Kiosk unlock PIN", type: "secret", vault: true }
      ]
    },
    {
      id: "hip", name: "HIP", tier: "biometrics", lane: "C", conf: "MED",
      proto: "CSV / Excel import (closed device)", icon: "files", ad: false,
      models: "CMI688 · Ci-series fingerprint",
      blurb: "A Thai brand familiar to Lao buyers, bundled with its own closed 'HIP Time' PC software. Don't build a live adapter — ingest its Excel/CSV export through the file-import + review-queue path you already have.",
      fields: [
        { k: "profile", label: "Import profile", type: "select", opts: ["HIP Time (default columns)", "Custom column map…"], req: true, hint: "Maps the export columns → employee · timestamp · direction." },
        { k: "source", label: "File source", type: "select", opts: ["Manual upload", "SFTP drop", "Watched folder"] },
        { k: "schedule", label: "Ingest schedule", type: "select", opts: ["Manual", "Hourly", "Daily 06:40"] }
      ]
    },
    {
      id: "suprema", name: "Suprema", tier: "gates", lane: "B", conf: "MED",
      proto: "BioStar 2 API / Device Gateway (G-SDK)", icon: "shield", ad: true, premium: true,
      models: "BioStation 2 / 3 · FaceStation",
      blurb: "Premium algorithms chosen by banks, embassies and larger enterprises — lower local volume. Integrates through the BioStar 2 cloud/server API. Enterprise tier.",
      fields: [
        { k: "apiurl", label: "BioStar 2 API base URL", ph: "https://biostar.local/api", req: true },
        { k: "clientid", label: "Client ID", ph: "adeptio", req: true },
        { k: "secret", label: "API secret", type: "secret", vault: true, req: true },
        { k: "cert", label: "Client certificate (mTLS)", type: "secret", vault: true, hint: "Optional — for device-gateway gRPC." }
      ]
    },
    {
      id: "anviz", name: "Anviz", tier: "gates", lane: "B", conf: "MED",
      proto: "CrossChex Cloud API", icon: "shield", ad: true, premium: true,
      models: "W2 · FacePass series",
      blurb: "Premium / niche locally, sold into larger enterprises wanting cloud management. Integrates via the CrossChex Cloud API. Enterprise tier.",
      fields: [
        { k: "region", label: "Cloud region", type: "select", opts: ["Asia-Pacific (Singapore)", "Global"], req: true },
        { k: "appid", label: "App ID", ph: "anviz-app", req: true },
        { k: "appsecret", label: "App secret", type: "secret", vault: true, req: true }
      ]
    },
    {
      id: "custom", name: "Custom device", tier: "customDevice", lane: "custom", conf: "—",
      proto: "Generic webhook → /punch", icon: "plug", ad: true, open: true,
      models: "Any reader / controller / bridge",
      blurb: "Open seam for anything not on the list — a Wiegand→HTTP bridge, an OEM turnstile, a partner integration. Point it at /punch with an HMAC signature and map its payload to the punch schema. Enterprise tier.",
      fields: [
        { k: "endpoint", label: "Ingestion endpoint", type: "readonly", val: "https://edge.adeptio.hr/punch/custom", hint: "POST punches here, signed." },
        { k: "hmac", label: "HMAC signing secret", type: "secret", vault: true, req: true, hint: "The Worker verifies every payload with this." },
        { k: "header", label: "Auth header (optional)", ph: "X-Adeptio-Key: …" },
        { k: "fieldmap", label: "Field map (JSON)", type: "area", ph: '{ "emp":"badge", "ts":"time", "dir":"event" }', hint: "Map the device payload → { emp, ts, dir, method }." },
        { k: "allowip", label: "Allowed source IPs", ph: "10.0.12.0/24" }
      ]
    }
  ];
  const vendorById = (id) => VENDORS.find(v => v.id === id) || VENDORS[0];
  const vendorByName = (n) => VENDORS.find(v => v.name.toLowerCase() === String(n).toLowerCase());

  /* ---------- clock-in/out methodologies (HR group picker) ---------- */
  const METHODS = [
    { id: "biometric", label: "Biometric (face / finger)", icon: "user",  blurb: "Match at a wall terminal — fastest, hardest to spoof." },
    { id: "card",      label: "Card / RFID",               icon: "grid",  blurb: "Tap a badge at a reader; pairs naturally with gates." },
    { id: "gate",      label: "Gate / access",             icon: "lock",  blurb: "The punch also opens a turnstile, door or barrier." },
    { id: "mobile",    label: "Mobile (GPS + selfie)",     icon: "phone", blurb: "Phone punch with geofence + selfie — the never-block fallback." },
    { id: "web",       label: "Web clock",                 icon: "globe", blurb: "Desk staff clock from the browser." },
    { id: "pin",       label: "Device PIN",                icon: "key",   blurb: "PIN at a shared terminal — lowest assurance." }
  ];
  const methodById = (id) => METHODS.find(m => m.id === id) || { id, label: id, icon: "grid" };
  const methodLabel = (id) => methodById(id).label;

  /* ---------- status helpers ---------- */
  const STATUS = {
    online:   { tone: "ok",   label: "Online",   color: "var(--ok)" },
    degraded: { tone: "warn", label: "Degraded", color: "var(--warn)" },
    offline:  { tone: "bad",  label: "Offline",  color: "var(--bad)" },
    import:   { tone: "acc",  label: "Import",   color: "var(--acc)" }
  };
  const statusTone = (s) => (STATUS[s] || { tone: "" }).tone;
  const statusColor = (s) => (STATUS[s] || { color: "var(--muted)" }).color;
  const statusLabel = (s) => (STATUS[s] || { label: s }).label;

  function statusCounts() {
    const d = list("devices");
    const c = { online: 0, degraded: 0, offline: 0, import: 0, total: d.length };
    d.forEach(x => { c[x.status] = (c[x.status] || 0) + 1; });
    return c;
  }
  // uptime: online = full credit, degraded = half, offline/import = none (of the reachable fleet)
  function uptime() {
    const c = statusCounts(), reach = c.total - c.import;
    if (reach <= 0) return 100;
    return Math.round(((c.online + c.degraded * 0.5) / reach) * 1000) / 10;
  }

  /* ---------- capture mix — today's punches by source ---------- */
  function sourceTag(d) {
    if (d.kind === "kiosk") return "mobile";
    if (d.kind === "gate-reader" || (d.methods && d.methods[0] === "card")) return "card";
    return "biometric";
  }
  function captureMix() {
    const d = list("devices"); const m = { biometric: 0, card: 0, mobile: 0, web: 18 /* web-clock today */ };
    d.forEach(x => { m[sourceTag(x)] += (x.today || 0); });
    const total = m.biometric + m.card + m.mobile + m.web || 1;
    return [
      { id: "biometric", label: "Biometric", v: m.biometric, pct: Math.round(m.biometric / total * 100) },
      { id: "card",      label: "Card / gate", v: m.card,    pct: Math.round(m.card / total * 100) },
      { id: "mobile",    label: "Mobile",    v: m.mobile,    pct: Math.round(m.mobile / total * 100) },
      { id: "web",       label: "Web",       v: m.web,       pct: Math.round(m.web / total * 100) }
    ];
  }
  const punchesToday = () => list("devices").reduce((n, d) => n + (d.today || 0), 0) + 18;

  /* ---------- 5-minute clock-in/out series (the dashboard graph) ----------
     Deterministic morning-rush histogram, 07:20 → 09:15 in 5-min frames.
     in = arrivals (bell around 08:25); out = the trickle of early outs.
     Fixed formula (no Date.now) so the smoke test stays stable. */
  function clockSeries5m() {
    const n = 24, peak = 13; // bucket index of the rush
    const data = [];
    let start = 7 * 60 + 20; // minutes from midnight
    for (let i = 0; i < n; i++) {
      const mins = start + i * 5;
      const hh = Math.floor(mins / 60), mm = mins % 60;
      const g = Math.exp(-Math.pow(i - peak, 2) / 18);          // gaussian rush
      const inv = Math.round(g * 44) + ((i * 7) % 4);            // arrivals
      const outv = Math.max(0, Math.round(Math.exp(-Math.pow(i - 2, 2) / 6) * 5) + ((i * 3) % 2)); // a few early outs
      const tick = (mm % 30 === 0);                              // label only :00 / :30
      data.push({ l: tick ? `${hh}:${String(mm).padStart(2, "0")}` : "", v: inv, outv, raw: `${hh}:${String(mm).padStart(2, "0")}` });
    }
    const total = data.reduce((s, d) => s + d.v, 0);
    const peakBucket = data.reduce((a, b) => b.v > a.v ? b : a, data[0]);
    return { data, total, peak: peakBucket };
  }

  /* ---------- reads ---------- */
  const devices = () => list("devices");
  const gates = () => list("gates");
  const groups = () => list("groups");
  const events = () => list("events");
  const deviceById = (id) => list("devices").find(d => d.id === id);
  const gateById = (id) => list("gates").find(g => g.id === id);
  const groupById = (id) => list("groups").find(g => g.id === id);
  const groupOf = (emp) => list("groups").find(g => (g.members || []).includes(emp));
  function methodOf(emp) { const g = groupOf(emp); return g ? methodById(g.primary) : methodById("mobile"); }
  function deviceCount(vendorName) { return list("devices").filter(d => d.vendor === vendorName).length; }

  /* ---------- mutations ---------- */
  function nextId(arr, prefix) {
    const max = arr.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, "")) || 0), 0);
    return prefix + "-" + String(max + 1).padStart(2, "0");
  }
  function logEvent(dev, kind, msg, tone) {
    const ev = list("events");
    ev.unshift({ id: "EVT-" + Date.now().toString().slice(-4), ts: DB.now ? DB.now() + ":00" : "now", dev, kind, msg, tone: tone || "" });
    if (ev.length > 40) ev.length = 40;
    DB.persist("db_devices");
  }
  function addDevice(f) {
    const v = vendorById(f.vendor);
    const arr = list("devices");
    const id = nextId(arr, "DEV");
    const isImport = v.lane === "C" && v.id === "hip";
    const row = {
      id, vendor: v.name, model: f.model || v.models.split(" · ")[0], kind: v.id === "sunmi" ? "kiosk" : v.id === "custom" ? "gate-reader" : isImport ? "import" : "biometric",
      lane: v.lane, proto: v.proto, methods: f.methods || (v.id === "custom" ? ["card"] : v.id === "sunmi" ? ["selfie", "geo"] : ["face", "card"]),
      site: f.site || "Vientiane Plant 1", zone: f.zone || "New location", status: isImport ? "import" : "online",
      lat: isImport ? null : 50, today: 0, enrolled: 0, fw: "—", ip: f.ip || "—", sn: f.sn || "—",
      auth: f.ad ? "AD-bound" : "local", last: "just now", since: "Jun 2026"
    };
    DB.add("db_devices", "devices", row, "Thip N.");
    logEvent(id, "config", `Registered ${v.name} ${row.model} · ${v.proto}`, "ok");
    audit("Thip N.", "device.registered", id + " · " + v.name, "console");
    pulse();
    return id;
  }
  function removeDevice(id) {
    const d = deviceById(id);
    DB.del("db_devices", "devices", "id", id, "Thip N.");
    audit("Thip N.", "device.removed", id + (d ? " · " + d.vendor : ""), "console");
    pulse();
  }
  function setStatus(id, status) {
    const d = deviceById(id); if (!d) return;
    d.status = status; d.last = "just now"; if (status === "online") d.lat = 45;
    DB.persist("db_devices");
    logEvent(id, status === "online" ? "heartbeat" : "error", status === "online" ? "Reconnected · heartbeat ok" : "Marked " + status, statusTone(status));
    audit("Thip N.", "device." + (status === "online" ? "reconnected" : "status"), id + " → " + status, "console");
    pulse();
  }
  function testConnection(id) {
    const d = deviceById(id); if (!d) return { ok: false, msg: "not found" };
    const ok = d.status !== "offline";
    if (ok) { d.last = "just now"; if (d.status === "degraded") { d.status = "online"; d.lat = 48; } DB.persist("db_devices"); }
    logEvent(id, ok ? "heartbeat" : "error", ok ? "Test connection ok · " + (d.lat || "—") + " ms" : "Test failed — host unreachable", ok ? "ok" : "bad");
    audit("Thip N.", "device.tested", id + " · " + (ok ? "ok" : "fail"), "console");
    pulse();
    return { ok, msg: ok ? "Connection ok — heartbeat received" : "Unreachable — check host / power" };
  }
  function reconnect(id) { setStatus(id, "online"); }
  function toggleBind(id) {
    const d = deviceById(id); if (!d) return;
    d.auth = d.auth === "AD-bound" ? "local" : "AD-bound";
    DB.persist("db_devices");
    audit("Thip N.", "device.identity_bind", id + " → " + d.auth, "console");
    pulse();
  }
  function setGateState(id, state) {
    const g = gateById(id); if (!g) return;
    g.state = state;
    DB.persist("db_devices");
    logEvent(g.reader || id, "config", `${g.name} → ${state}`, state === "secured" ? "ok" : state === "held" ? "warn" : "bad");
    audit("Thip N.", "gate." + state, id + " · " + g.name, "console");
    pulse();
  }

  /* ---------- groups (HR clock-in/out methodology) ---------- */
  function addGroup(f) {
    const arr = list("groups");
    const id = nextId(arr, "GRP").replace("GRP-0", "GRP-N");
    DB.add("db_devices", "groups", {
      id, name: f.name || "New group", members: f.members || [], primary: f.primary || "mobile",
      allow: f.allow || [f.primary || "mobile"], geofence: f.geofence != null ? f.geofence : 30, devices: f.devices || [], note: f.note || ""
    }, "Vilayvanh C.");
    audit("Vilayvanh C.", "capture_group.created", id + " · " + (f.name || ""), "10.0.4.12");
    pulse();
    return id;
  }
  function setPrimary(gid, method) {
    const g = groupById(gid); if (!g) return;
    g.primary = method; if (!(g.allow || []).includes(method)) g.allow = (g.allow || []).concat(method);
    DB.persist("db_devices");
    audit("Vilayvanh C.", "capture_group.method", gid + " → " + method, "10.0.4.12");
    pulse();
  }
  function toggleAllow(gid, method) {
    const g = groupById(gid); if (!g) return;
    g.allow = g.allow || [];
    if (g.allow.includes(method)) { if (g.primary !== method) g.allow = g.allow.filter(m => m !== method); }
    else g.allow.push(method);
    DB.persist("db_devices");
    pulse();
  }
  function assignStaff(gid, emp) {
    const g = groupById(gid); if (!g || !emp) return;
    // a person belongs to one capture group — move them
    list("groups").forEach(x => { if (x.id !== gid) x.members = (x.members || []).filter(m => m !== emp); });
    g.members = g.members || []; if (!g.members.includes(emp)) g.members.push(emp);
    DB.persist("db_devices");
    audit("Vilayvanh C.", "capture_group.assigned", emp + " → " + gid, "10.0.4.12");
    pulse();
  }
  function removeMember(gid, emp) {
    const g = groupById(gid); if (!g) return;
    g.members = (g.members || []).filter(m => m !== emp);
    DB.persist("db_devices");
    pulse();
  }
  const assignedCount = () => { const s = new Set(); list("groups").forEach(g => (g.members || []).forEach(m => s.add(m))); return s.size; };

  return {
    VENDORS, METHODS, STATUS,
    vendors: () => VENDORS, methods: () => METHODS,
    vendorById, vendorByName, methodById, methodLabel,
    devices, gates, groups, events,
    deviceById, gateById, groupById, groupOf, methodOf, deviceCount,
    statusCounts, uptime, captureMix, punchesToday, clockSeries5m,
    statusTone, statusColor, statusLabel,
    addDevice, removeDevice, setStatus, testConnection, reconnect, toggleBind, setGateState,
    addGroup, setPrimary, toggleAllow, assignStaff, removeMember, assignedCount,
    has: (f) => has(f)
  };
})();
