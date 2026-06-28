/* render the v2.4.4 fine-tune screens (calendar + inline week + shift control)
   to a standalone HTML using the REAL tokens.css + app.css + schedule.css. */
const fs=require("fs"),path=require("path");const ROOT=process.argv[2]||".";global.window=global;
const code=f=>fs.readFileSync(path.join(ROOT,f),"utf8");
["js/i18n.js","js/ui.js","js/db.js","js/api-config.js","js/auth.js","js/data.js","js/provision.js","js/devices.js","js/overtime.js","js/schedule.js","js/calendar-core.js","js/payroll.js","js/screens/authviews.js","js/screens/dbviews.js","js/screens/reports.js","js/screens/schedule.js"].forEach(f=>eval(code(f)));
for(const f of ["staff","manager","hr","ceo","sysadmin"])eval(code("js/screens/"+f+".js"));
const screen=(p,o,label)=>`<div class="prev-label">${label}</div>
<section data-persona="${p}" class="prev-screen"><div class="workspace"><div class="content"><div class="workspace-inner">
<div class="screen-head"><div><h1>${o.title}</h1><p class="screen-sub">${o.sub||""}</p></div><div class="screen-actions">${o.actions||""}</div></div>
${o.body}</div></div></div></section>`;
const tokens=code("css/tokens.css"),app=code("css/app.css"),sched=code("css/schedule.css");
const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>v2.4.4 fine-tune — visual QA</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+Lao:wght@400;600;700&display=swap" rel="stylesheet">
<style>${tokens}
${app}
${sched}
body{background:var(--canvas);color:var(--ink);font-family:var(--font);margin:0;}
.prev-banner{position:sticky;top:0;z-index:10;background:var(--brand-deep);color:#fff;padding:11px 22px;font:600 13px/1.4 var(--font);}
.prev-screen{max-width:1180px;margin:0 auto;padding:8px 22px 30px;}
.content{container-type:inline-size;container-name:content;}
.prev-label{max-width:1180px;margin:22px auto 0;padding:10px 22px 0;font:700 12px/1 var(--mono);color:var(--brand-deep);text-transform:uppercase;letter-spacing:.08em;border-top:8px solid var(--line-2);}
.workspace-inner{padding-top:6px;}
.screen-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
.screen-head h1{font:600 22px/1.1 var(--display);margin:0;color:var(--ink);}
.screen-sub{font-size:13px;color:var(--muted);margin:4px 0 0;max-width:70ch;}
.screen-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
</style></head><body data-persona="hr">
<div class="prev-banner"><b>Adeptio v2.4.4 — Bio &amp; Gate &amp; OT &amp; Shift · fine-tune visual QA</b> &nbsp;·&nbsp; Tasks 1–4 (real tokens.css + app.css + schedule.css)</div>
${screen("hr",PERSONAS.hr.web["sched-cal"]("month"),"Task 1 + 3 · Calendar (month) — Change log on the green line + Roster separation")}
${screen("hr",PERSONAS.hr.web["sched-cal"]("month.2026-06-08"),"Task 2 · Calendar — click W24 → inline week expand (open in place)")}
${screen("hr",PERSONAS.hr.web["sched-control"](),"Task 4 · Shift control — split summary on the green line (period + group/division/people)")}
</body></html>`;
fs.writeFileSync(path.join(ROOT,"tools/preview-tune.html"),html);
console.log("wrote tools/preview-tune.html ("+(html.length/1024).toFixed(0)+" KB)");
