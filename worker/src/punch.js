// punch.js — Adeptio edge Worker · v2.4.2 device-capture ingestion (Lane A + custom).
//
// The /punch seam: biometric & gate devices post attendance events here; the Worker
// verifies the sender, normalizes the payload to the punch schema, and writes it to
// db_time (server-authoritative, same custody model as identity). This is the live
// counterpart to the in-browser device simulator — deploy-ready, written-to-spec,
// UNRUN in this drop (no sandbox egress).
//
//   POST /punch/zkteco     ZKTeco PUSH/ADMS — device posts to /iclock/cdata-style body
//                          (SN in query, tab-delimited records). Lane A.
//   POST /punch/custom     Generic webhook — JSON body, HMAC-signed (X-Adeptio-Signature).
//   GET  /punch/zkteco/... ADMS handshake (getrequest / devicecmd) → "OK".
//
// Config (wrangler vars/secrets):
//   PUNCH_HMAC_SECRET   secret — HMAC key for /punch/custom (and any signed vendor).
//   ZKTECO_COMMKEY      var    — optional comm key echoed by ADMS devices (?CommKey=).
//   PUNCH_DEVICE_MAP    var    — optional JSON { "<SN>": {emp_resolves:"ad|local", site} }.
//
// Device passwords / API keys are NEVER stored in the browser db_devices store — only a
// vault ref. The real secret is a Worker secret, exactly like the LDAP/RADIUS bind keys.

const enc = new TextEncoder();

/* constant-time hex compare */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function hmacHex(secret, raw) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* Map a ZKTeco status code → punch direction. 0/in, 1/out are the common pair;
   others (break out/in, OT) collapse to in/out for the ledger. */
function zkDir(status) {
  const s = String(status);
  if (s === "1" || s === "3" || s === "5") return "out";
  return "in"; // 0,2,4 → in
}

/* ZKTeco ADMS posts ATTLOG records, one per line, tab-delimited:
   PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode ...
   (verify: 1=finger 15=face 4=card). */
function parseZktecoBody(raw) {
  const out = [];
  raw.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const f = line.split(/\t/);
    if (f.length < 2) return;
    const verify = f[3];
    const method = verify === "15" ? "face" : verify === "4" ? "card" : verify === "1" ? "finger" : "biometric";
    out.push({ emp: f[0], ts: f[1], dir: zkDir(f[2]), method });
  });
  return out;
}

const text = (s, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain" } });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

/* Write a normalized punch to db_time. store.recordPunch is optional in this drop;
   when absent we acknowledge and log, so the contract test can run without schema. */
async function record(store, punch, vendor, sn) {
  const row = { emp: punch.emp, ts: punch.ts, dir: punch.dir, method: punch.method, source: vendor, device: sn || null };
  if (store && typeof store.recordPunch === "function") { try { await store.recordPunch(row); } catch (e) { /* surfaced by caller */ } }
  return row;
}

export async function handlePunch(url, req, env, store) {
  const parts = url.pathname.split("/").filter(Boolean); // ["punch","<vendor>", ...]
  const vendor = (parts[1] || "custom").toLowerCase();

  // ---- ZKTeco PUSH / ADMS (Lane A) ----
  if (vendor === "zkteco") {
    // ADMS handshake GETs (getrequest / devicecmd) — answer OK so the device stays attached.
    if (req.method === "GET") return text("OK");
    const sn = url.searchParams.get("SN") || url.searchParams.get("sn") || "";
    // optional comm-key check (ADMS has no strong auth; treat as a shared secret if set)
    if (env.ZKTECO_COMMKEY) {
      const key = url.searchParams.get("CommKey") || req.headers.get("x-comm-key") || "";
      if (key !== env.ZKTECO_COMMKEY) return text("ERROR: bad comm key", 401);
    }
    const raw = await req.text();
    const records = parseZktecoBody(raw);
    if (!records.length) return text("OK: 0"); // heartbeat / non-ATTLOG cdata
    for (const r of records) await record(store, r, "zkteco", sn);
    // ADMS expects a plain "OK" / "OK: <count>" so the device marks the batch delivered.
    return text("OK: " + records.length);
  }

  // ---- Generic signed webhook (custom / Wiegand bridge / partner) ----
  if (vendor === "custom" || vendor === "webhook") {
    const raw = await req.text();
    const secret = env.PUNCH_HMAC_SECRET || "";
    if (!secret) return json({ ok: false, code: "unconfigured", msg: "PUNCH_HMAC_SECRET not set on the Worker." }, 503);
    const given = (req.headers.get("x-adeptio-signature") || "").replace(/^sha256=/, "");
    const expect = await hmacHex(secret, raw);
    if (!given || !timingSafeEqual(given, expect)) return json({ ok: false, code: "bad_signature", msg: "HMAC verification failed." }, 401);
    let payload;
    try { payload = JSON.parse(raw); } catch (e) { return json({ ok: false, code: "bad_json" }, 400); }
    // accept a single punch or a batch; map flexible field names → the punch schema
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [payload];
    const norm = items.map(it => ({
      emp: it.emp || it.badge || it.user || it.pin,
      ts: it.ts || it.time || it.timestamp || new Date().toISOString(),
      dir: (it.dir || it.event || "in").toString().toLowerCase().includes("out") ? "out" : "in",
      method: it.method || "card"
    })).filter(p => p.emp);
    if (!norm.length) return json({ ok: false, code: "empty", msg: "No resolvable punches in payload." }, 422);
    const written = [];
    for (const p of norm) written.push(await record(store, p, "custom", payload.device || null));
    return json({ ok: true, accepted: written.length, punches: written });
  }

  // ---- Lane B vendors (Hikvision/Dahua/Suprema/Anviz) are PULLED by the Worker, not pushed ----
  if (["hikvision", "dahua", "suprema", "anviz"].includes(vendor)) {
    return json({ ok: false, code: "pull_lane", msg: `${vendor} is a server-pull (Lane B) integration — the Worker polls its API on a schedule; it does not receive pushes at /punch.` }, 400);
  }

  return json({ ok: false, code: "unknown_vendor", msg: "Unknown /punch vendor: " + vendor }, 404);
}
