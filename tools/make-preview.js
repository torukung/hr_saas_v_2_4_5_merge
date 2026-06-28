/* make-preview.js — render the v2.4.1 edge screens to a standalone HTML using the REAL
   tokens.css + app.css, so the design can be eyeballed against the 2.4.0 look without a
   running app. Boots the cells (node), exercises a flow to populate state, captures the
   AUTHV builders, and writes preview-edge.html.
   Run: node tools/make-preview.js . */
const fs = require("fs"), path = require("path");
const ROOT = process.argv[2] || ".";
global.window = global;
const code = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
for (const f of ["js/i18n.js", "js/ui.js", "js/db.js", "js/api-config.js", "js/auth.js", "js/data.js", "js/provision.js", "js/devices.js",
  "js/screens/authviews.js", "js/screens/dbviews.js", "js/screens/reports.js",
  "js/screens/staff.js", "js/screens/manager.js", "js/screens/hr.js", "js/screens/ceo.js", "js/screens/sysadmin.js"]) eval(code(f));

DATA.state.tier = "professional";
// populate some state so the screens look alive
AUTH.setMode("staff2@phoungern.la", "ldap", { reason: "demo" }, "preview"); // an account in directory mode
AUTHV.prov.csv = PROV.sampleCSV();
AUTHV.prov.dry = PROV.dryRun(AUTHV.prov.csv, { mode: "local" });
PROV.runSync("PROV-AD", "preview"); // a review queue to show
AUTHV.prov.q = "EMP-02";
AUTHV.prov.results = PROV.search("EMP-02"); // individual lookup, populated

const screen = (persona, title, sub, bodyHTML) => `
  <section data-persona="${persona}" class="prev-screen">
    <div class="workspace">
      <div class="workspace-inner">
        <div class="screen-head"><div><h1>${title}</h1><p class="screen-sub">${sub}</p></div></div>
        ${bodyHTML}
      </div>
    </div>
  </section>`;
// render a real screen function by id (v2.4.2 device screens + the synced persona views)
const S = (persona, fn, arg) => { const o = PERSONAS[persona].web[fn](arg); return screen(persona, o.title, o.sub, o.body); };

const tokens = code("css/tokens.css");
const app = code("css/app.css");

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adeptio v2.4.2.edge.auth — BioMetric & Gate screen preview</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+Lao:wght@400;600;700&display=swap" rel="stylesheet">
<style>${tokens}
${app}
/* preview chrome only */
body{ background:var(--canvas); color:var(--ink); font-family:var(--font); margin:0; }
.prev-banner{ position:sticky; top:0; z-index:10; background:var(--brand-deep); color:#fff; padding:11px 22px; font:600 13px/1.4 var(--font); }
.prev-banner b{ font-weight:800; } .prev-banner span{ opacity:.8; font-weight:400; }
.prev-screen{ max-width:1180px; margin:0 auto; padding:8px 22px 30px; }
.prev-screen + .prev-screen{ border-top:8px solid var(--line-2); }
.prev-label{ max-width:1180px; margin:22px auto 0; padding:0 22px; font:700 12px/1 var(--mono); color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
.workspace-inner{ padding-top:6px; }
</style></head>
<body>
<div class="prev-banner"><b>Adeptio v2.4.2.edge.auth — BioMetric &amp; Gate Integration</b> &nbsp;·&nbsp; <span>static screen preview (real tokens.css + app.css) — Atelier Pastel parity check. Live demo: open index.html.</span></div>

<div class="prev-label">Sys Admin · Device monitor — connectivity + 5-min clock-in/out series (NEW)</div>
${S("sysadmin", "devmonitor")}

<div class="prev-label">Sys Admin · BioMetrics — fleet + vendor catalogue (NEW)</div>
${S("sysadmin", "biometrics")}

<div class="prev-label">Sys Admin · Add device — ZKTeco required parameters (NEW)</div>
${S("sysadmin", "device-new", "zkteco")}

<div class="prev-label">Sys Admin · Device config — DEV-ZK01 + AD/RADIUS bind (NEW)</div>
${S("sysadmin", "device", "DEV-ZK01")}

<div class="prev-label">Sys Admin · Gates &amp; access — readers → controllers → locks (NEW)</div>
${S("sysadmin", "gates")}

<div class="prev-label">HR · Clock-in/out — capture groups + methodology (NEW)</div>
${S("hr", "clocking")}

<div class="prev-label">HR · Capture group — methodology picker + roster (NEW)</div>
${S("hr", "group", "GRP-PROD")}

<div class="prev-label">HR · Time &amp; Attendance — capture sources now live</div>
${S("hr", "time")}

<div class="prev-label">Manager · Overview — capture &amp; devices card + roster source</div>
${S("manager", "overview")}

<div class="prev-label">CEO · Board — attendance capture coverage + device fleet</div>
${S("ceo", "board")}

<div class="prev-label">Sys Admin · Directory providers (B3/B4)</div>
${screen("sysadmin", "Directory providers", "LDAP/AD + RADIUS connection panel and the directory simulator.", AUTHV.providerPanel())}

<div class="prev-label">Sys Admin · Directory sync (B5)</div>
${screen("sysadmin", "Directory sync", "Read-only delta sync — create · link · suspend proposals in a review queue.", AUTHV.syncDashboard("PROV-AD"))}

<div class="prev-label">HR · Import accounts (B5)</div>
${screen("hr", "Import accounts", "Bring people in from a CSV / Excel export — dry-run, then commit.", AUTHV.importWizard())}

<div class="prev-label">HR · Person → Access card with the credential-mode switch (B2)</div>
${screen("hr", "Access — portal option", "Per-person sign-in method: local · LDAP/AD · RADIUS, switchable both ways.", AUTHV.personAccessCard(DATA.employees.find(e => e.id === "EMP-0231")))}

<div class="prev-label">Sys Admin · Identity console (edge identity card + un-greyed sign-in methods)</div>
${screen("sysadmin", "Identity console", "Accounts, the edge-identity controls, and the built LDAP/AD · RADIUS rows.", AUTHV.identityBody("all"))}

</body></html>`;

const out = path.join(ROOT, "tools", "preview-v242.html");
fs.writeFileSync(out, html);
console.log("wrote " + out + " (" + Math.round(html.length / 1024) + " KB)");
