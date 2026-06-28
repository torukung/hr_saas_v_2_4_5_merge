/* ============================================================
   ADEPTIO · app shell — router, launcher, shells, actions
   Route shape:  #/{persona}/{device}/{screen}[/{param}]
   e.g. #/hr/web/payroll-run/PR-2026-06 · #/staff/mobile/home
   ============================================================ */
(function () {
  const { icon, badge, avatar } = UI;
  const app = () => document.getElementById("app");

  const PERSONA_META = {
    staff:    { vars: ["--staff", "--staff-d", "--staff-bg", "--staff-ln"], who: "STAFF · ESS", h: "The Employee", tag: "Self-service — does the day-to-day", pts: ["Clock in / out — app, GPS, web", "Request leave · OT · claims", "Payslips & tax / SSO breakdown", "Profile & documents"] },
    manager:  { vars: ["--mgr", "--mgr-d", "--mgr-bg", "--mgr-ln"], who: "MANAGER · MSS", h: "The Team Lead", tag: "Oversees a team — first approver", pts: ["Approve / return requests (L1)", "Team roster, shifts & calendar", "Live attendance board", "Coaching on policy exceptions"] },
    hr:       { vars: ["--hr", "--hr-d", "--hr-bg", "--hr-ln"], who: "HR · PEOPLE OPS", h: "The HR Operator", tag: "Runs people, pay & communications", pts: ["Master data & org structure", "Payroll runs · tax · SSO", "Compose & send communications", "Final approvals (L2) & reports"] },
    ceo:      { vars: ["--ceo", "--ceo-d", "--ceo-bg", "--ceo-ln"], who: "CEO · SHAREHOLDER", h: "The Executive", tag: "Strategic oversight — read-only", pts: ["Headcount & labor cost", "Payroll burn vs budget", "Attrition & division compare", "Compliance / risk posture"] },
    sysadmin: { vars: ["--sys", "--sys-d", "--sys-bg", "--sys-ln"], who: "SYSTEM ADMIN", h: "The Platform Owner", tag: "Owns content, channels & security", pts: ["Content templates — CMS", "Channels & gateways", "Roles, permissions & SSO", "Audit log & residency"] }
  };
  const ORDER = ["staff", "manager", "hr", "ceo", "sysadmin"];

  /* ---------- tier gating (v2.3.1.essential) ---------- */
  const personaLocked = (k) => (k === "ceo" && !DATA.has("ceo")) || (k === "sysadmin" && !DATA.has("sysadmin"));
  // flag that locks a screen, resolved through its owning nav/tab item
  function screenLock(P, dev, screen) {
    const owner = dev === "web" ? ((P.parent && P.parent[screen]) || screen) : ((P.tabParent && P.tabParent[screen]) || screen);
    const items = dev === "web" ? P.nav.flatMap(g => g.items) : P.tabs;
    const it = items.find(i => i.id === owner);
    return it && it.lock && !DATA.has(it.lock) ? it.lock : null;
  }
  function firstUnlocked(P, dev) {
    const items = dev === "web" ? P.nav.flatMap(g => g.items) : P.tabs;
    const it = items.find(i => !(i.lock && !DATA.has(i.lock)));
    return (it || items[0]).id;
  }

  /* ---------- routing — v2.4.1.edge.auth: the portal is the front door ---------- */
  function landingRoute(ses) {
    const prim = AUTH.primaryScope(ses.scopes);
    return { view: "app", persona: prim, device: "web", screen: firstUnlocked(PERSONAS[prim], "web") };
  }
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    // pre-session views — activation & reset links from the outbox work without a session
    if (/^activate\//.test(h)) return { view: "activate", token: h.split("/")[1] };
    if (/^reset\//.test(h)) return { view: "reset", token: h.split("/")[1] };
    if (/^setpw\//.test(h)) return { view: "setpw", token: h.split("/")[1] }; // dir → local set-password
    if (h === "login") return (AUTH.portalOn() && AUTH.session()) ? landingRoute(AUTH.session()) : { view: "login" };
    // the persona page stays the landing — the wall only rises when a persona is entered
    if (!h || h === "launcher") return { view: "launcher" };
    if (AUTH.portalOn() && !AUTH.session()) {
      const p0 = h.split("/")[0];
      if (PERSONAS[p0]) AUTHV.state.focus = p0; // highlight that persona's frame
      return { view: "login" };
    }
    const [persona, device, screen, ...rest] = h.split("/");
    if (!PERSONAS[persona]) return { view: "launcher" };
    const P = PERSONAS[persona];
    const dev = device === "mobile" ? "mobile" : "web";
    if (personaLocked(persona)) {
      return { view: "launcher", blocked: `${P.label} persona unlocks at Professional (≤250) — locked on Essential. Use the tier toggle to preview.` };
    }
    // scope rule — username decides the landing; out-of-scope personas bounce home
    const ses = AUTH.portalOn() ? AUTH.session() : null;
    if (ses && !ses.scopes.includes(persona)) {
      const lr = landingRoute(ses);
      lr.device = dev;
      lr.screen = firstUnlocked(PERSONAS[lr.persona], dev);
      lr.blocked = `Signed in as ${ses.email} — that account has no ${P.label} scope. Sign out to switch accounts (or use a demo chip).`;
      return lr;
    }
    let scr = (P[dev][screen] ? screen : firstUnlocked(P, dev));
    let blocked;
    const lk = screenLock(P, dev, scr);
    if (lk) {
      blocked = `That area unlocks at ${DATA.unlockLabel(lk)} — locked on Essential.`;
      scr = firstUnlocked(P, dev);
    }
    return { view: "app", persona, device: dev, screen: scr, blocked, param: rest.length ? decodeURIComponent(rest.join("/")) : undefined };
  }
  function go(path) { location.hash = "#/" + path; }
  window.go = go;

  /* ---------- toast ---------- */
  let toastWrap;
  window.toast = function (msg, tone) {
    if (!toastWrap) { toastWrap = document.createElement("div"); toastWrap.className = "toast-wrap"; document.body.appendChild(toastWrap); }
    const el = document.createElement("div");
    el.className = "toast" + (tone ? " " + tone : "");
    el.innerHTML = `${icon(tone === "warn" ? "alert" : "check")}<span>${msg}</span>`;
    toastWrap.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 350); }, 3400);
  };

  /* ---------- topbar ---------- */
  function topbar(r) {
    const onApp = r.view === "app";
    const cur = onApp ? r.persona : null;
    const ess = DATA.tier() === "essential";
    const ses = AUTH.portalOn() ? AUTH.session() : null; // chips double as the scope switcher
    const chips = ORDER.map(k => {
      const m = PERSONA_META[k];
      const locked = personaLocked(k);
      const noScope = !locked && ses && !ses.scopes.includes(k);
      const action = locked
        ? `data-act="${UI.lockMsg(PERSONAS[k].label + " persona", "Professional · ≤250")}"`
        : noScope
          ? `data-act="toast:Signed in as ${ses.email} — no ${PERSONAS[k].label} scope. Sign out to switch accounts."`
          : `data-go="${k}/${onApp ? r.device : "web"}/${k === cur && onApp ? r.screen : defaultScreen(k, onApp ? r.device : "web")}"`;
      return `<button class="pchip ${locked || noScope ? "locked" : ""}" style="--pc:var(${m.vars[0]});--pd:var(${m.vars[1]});--pl:var(${m.vars[3]})"
        aria-pressed="${cur === k}" ${action} title="${locked ? "Unlocks at Professional ≤250" : noScope ? "Outside this account's scopes" : PERSONAS[k].roleLine}">
        ${locked || noScope ? icon("lock", "lk") : '<span class="dot"></span>'}<span class="pl">${PERSONAS[k].label}</span></button>`;
    }).join("");
    const me = onApp ? DATA.me[r.persona] : null;
    const acctUI = ses
      ? `<button class="avatar-btn session" data-go="${(onApp && ses.scopes.includes(r.persona) ? r.persona : AUTH.primaryScope(ses.scopes))}/web/security" title="${ses.email} · My security">${avatar(ses.name)}</button>
         <button class="seg-logout" data-act="auth-logout" title="Sign out (${ses.email})">${icon("logout")}</button>`
      : AUTH.portalOn()
        ? `<button class="seg-login" data-go="login" title="Open the sign-in page">${icon("key")} Sign in</button>`
        : `<button class="seg-login off" data-act="portal-mode:on" title="auth_portal is off — every persona opens without sign-in. Click to arm the portal.">${icon("key")} Portal off</button>${me ? `<button class="avatar-btn" title="${me.name} · ${me.role}">${avatar(me.name)}</button>` : ""}`;
    return `<header class="topbar">
      <button class="logo" data-go="launcher" aria-label="Adeptio home">
        <span class="logo-mark">A</span>
        <span><span class="logo-word">Adeptio</span><br><span class="logo-sub">${t("app.suite")}</span></span>
      </button>
      <span class="ver">v2.4.5${ess ? " · essential" : " · pro"}${AUTH.portalOn() ? " · portal" : ""}${AUTH.authMode() === "remote" ? " · edge" : ""}</span>
      <nav class="persona-switch" aria-label="Persona">${chips}</nav>
      <span class="spacer"></span>
      <div class="seg tier" role="group" aria-label="License tier" title="R4 — flags, not forks: one codebase, tier-gated">
        <button aria-pressed="${ess}" data-act="set-tier:essential">Essential ≤50</button>
        <button aria-pressed="${!ess}" data-act="set-tier:professional">Pro ≤250</button>
      </div>
      ${onApp ? `<div class="seg" role="group" aria-label="Device">
        <button aria-pressed="${r.device === "web"}" data-go="${r.persona}/web/${webEquiv(r)}">${icon("globe")} ${t("nav.web")}</button>
        <button aria-pressed="${r.device === "mobile"}" data-go="${r.persona}/mobile/${mobileEquiv(r)}">${icon("phone")} ${t("nav.mobile")}</button>
      </div>` : ""}
      <div class="seg lang" role="group" aria-label="Language">
        <button aria-pressed="true">EN</button>
        <button class="soon" aria-pressed="false" title="Lao language pack staged for the build phase — the portal & auth mails ship bilingual already" data-act="lang-lo">ລາວ</button>
      </div>
      ${acctUI}
    </header>`;
  }
  function defaultScreen(p, dev) { return firstUnlocked(PERSONAS[p], dev); }
  // map current screen across devices, falling back to tab/nav parents then default
  function mobileEquiv(r) {
    const P = PERSONAS[r.persona];
    if (P.mobile[r.screen]) return r.screen + (r.param ? "/" + r.param : "");
    const tp = P.tabParent && P.tabParent[r.screen];
    if (tp && P.mobile[tp]) return tp;
    return P.tabs[0].id;
  }
  function webEquiv(r) {
    const P = PERSONAS[r.persona];
    if (P.web[r.screen]) return r.screen + (r.param ? "/" + r.param : "");
    const wp = { home: P.nav[0].items[0].id, queue: "approvals", alerts: P.nav[0].items[0].id, me: P.web.me ? "me" : P.nav[0].items[0].id, board: "board" }[r.screen];
    return (wp && P.web[wp]) ? wp : P.nav[0].items[0].id;
  }

  /* ---------- launcher ---------- */
  function launcher() {
    const cards = ORDER.map(k => {
      const m = PERSONA_META[k], P = PERSONAS[k];
      const locked = personaLocked(k);
      const enter = locked
        ? `<div class="enter"><button data-act="set-tier-go:${k}">${icon("key")} Unlock — preview at Pro</button></div>`
        : `<div class="enter">
            <button data-go="${k}/web/${defaultScreen(k, "web")}">${icon("globe")} Web</button>
            <button class="ghosted" data-go="${k}/mobile/${defaultScreen(k, "mobile")}" aria-label="${P.label} mobile">${icon("phone")}</button>
          </div>`;
      return `<article class="hub-card ${locked ? "locked" : ""}" ${locked ? `data-act="${UI.lockMsg(P.label + " persona", "Professional · ≤250")}"` : `data-go="${k}/web/${defaultScreen(k, "web")}"`} style="--pc:var(${m.vars[0]});--pd:var(${m.vars[1]});--pb:var(${m.vars[2]});--pl:var(${m.vars[3]})">
        ${locked ? `<span class="hub-lock">${icon("lock")} Pro ≤250</span>` : ""}
        <span class="swatch">${icon(P.icon)}</span>
        <span class="who">${m.who}</span>
        <h3>${m.h}</h3>
        <p class="tag">${locked ? (k === "sysadmin" ? "HR doubles on Essential — separate persona at Pro" : "Unlocks at Professional — Insight board") : m.tag}</p>
        <ul>${m.pts.map(p => `<li>${p}</li>`).join("")}</ul>
        ${enter}
      </article>`;
    }).join("");
    return `${topbar({ view: "launcher" })}
    <main class="launcher screen-fade">
      <div class="hero">
        <span class="eyebrow">Adeptio Adaptive HR · blueprint v2.5 (one platform · one track) → platform UI v2.4.5 (Bio · Gate · OT)</span>
        <h1>One platform. One door.<br><em>Local, LDAP, or RADIUS.</em></h1>
        <p class="lede">The v2.3.2 split data layer with its <strong>front door</strong> — and now an <strong>edge identity</strong> behind it. Each person proves themselves by <strong>local password, company LDAP/AD, or RADIUS</strong>, switchable both ways; HR bulk-imports from a file and the directory delta-syncs joiners and leavers through a review queue. Credentials are <strong>server-authoritative</strong> on the edge Worker (LDAPS/RadSec via <span class="mono">connect()</span>, Argon2id, httpOnly sessions) — the browser never holds a hash. Flip <span class="mono">auth_mode</span> to demo it all in-browser on a directory simulator. Lockout, self-reset, fail-closed + break-glass, sessions &amp; revoke ship with the door.</p>
      </div>
      <div class="hub-grid">${cards}</div>
      ${AUTHV.landingSection()}
      <div class="launch-meta">
        <span><b>${DATA.tier() === "essential" ? "Essential ≤50" : "Professional ≤250"}</b> tier flag</span>
        <span data-act="portal-mode:${AUTH.portalOn() ? "off" : "on"}" class="meta-act" role="button" tabindex="0" title="Click to switch the front door"><b>auth_portal</b> ${AUTH.portalOn() ? "on — switch off" : "off — switch on"}</span>
        <span data-act="edge-mode:${AUTH.authMode() === "remote" ? "local" : "remote"}" class="meta-act" role="button" tabindex="0" title="Click to switch the identity authority"><b>auth_mode</b> ${AUTH.authMode() === "remote" ? "edge — to simulator" : "simulator — to edge"}</span>
        <span><b>${AUTH.stats().active}/${AUTH.stats().accounts}</b> accounts active</span>
        <span><b>5</b> personas</span><span><b>13</b> live data stores</span>
        <span><b>${DB.backups.all().length}</b> snapshots in L-CU</span><span><b>B1·B2·B3</b> backup ladder</span>
        <span><b>50 · 100 · 250 · 600</b> seat tiers</span><span class="mono">persisted · ${DB.TENANT}-*</span>
      </div>
    </main>
    <footer class="footer-note">${icon("lock")} UI/UX preview for the dev team — structure &amp; flows per Blueprint v2.5 · no real data, no backend · © 2026 Adeptio.</footer>`;
  }

  /* ---------- web shell ---------- */
  /* the inner of the web workspace (crumbs + screen-head + body) — extracted so a soft
     re-render (e.g. opening/closing an inline week) can swap ONLY this, leaving the shell,
     rail and window scroll position untouched → no entrance replay, no jump to top. */
  function webInner(r, P, def) {
    const crumbs = def.crumbs
      ? `<nav class="crumbs" aria-label="Breadcrumb">
          <a data-go="${r.persona}/web/${defaultScreen(r.persona, "web")}">${P.label}</a>
          ${def.crumbs.map(c => `${icon("chevR")}${c.go ? `<a data-go="${c.go}">${c.label}</a>` : `<span class="here">${c.label}</span>`}`).join("")}
        </nav>`
      : `<nav class="crumbs" aria-label="Breadcrumb"><span class="mono" style="font-size:10.5px">${P.domain}</span></nav>`;
    return `${crumbs}
      <div class="screen-head">
        <div><h1>${def.title}</h1>${def.sub ? `<p class="sub">${def.sub}</p>` : ""}</div>
        ${def.actions ? `<div class="actions">${def.actions}</div>` : ""}
      </div>
      ${def.body}`;
  }

  function webShell(r) {
    const P = PERSONAS[r.persona];
    const def = P.web[r.screen](r.param);
    const activeNav = (P.parent && P.parent[r.screen]) || r.screen;
    const hidden = (window.FLAGS && FLAGS.hiddenScreens) ? FLAGS.hiddenScreens(r.persona) : new Set(); // v2.4.5 T0 — flag-off ⇒ hide the menu (data kept)
    const navHtml = P.nav.map(g => {
      const items = g.items.filter(it => !hidden.has(it.id));
      if (!items.length) return ""; // a group emptied by feature flags drops out entirely
      return `
      <div class="group eyebrow">${g.group}</div>
      ${items.map(it => {
      const locked = it.lock && !DATA.has(it.lock);
      if (locked) return `<button class="nav-item locked" data-act="${UI.lockMsg(it.label, DATA.unlockLabel(it.lock))}" title="Unlocks at ${DATA.unlockLabel(it.lock)}">
          ${icon(it.icon)}<span class="lbl">${it.label}</span>${icon("lock", "lk")}</button>`;
      const cnt = typeof it.count === "function" ? it.count() : it.count;
      return `<button class="nav-item" aria-current="${activeNav === it.id}" data-go="${r.persona}/web/${it.id}">
          ${icon(it.icon)}<span class="lbl">${it.label}</span>${cnt ? `<span class="count">${cnt}</span>` : ""}</button>`;
    }).join("")}`;
    }).join("");

    return `${topbar(r)}
    <div class="shell">
      <aside class="rail" aria-label="${P.label} navigation">
        <div class="rail-head"><span class="pin">${icon(P.icon)}</span><div><div class="t">${P.appName}</div><div class="s">${P.roleLine}</div></div></div>
        ${navHtml}
        <div class="rail-foot">
          <div class="tier-chip"><span class="led"></span><span>${DATA.tier() === "essential" ? "Essential · ≤50 seats" : "Professional · ≤250 seats"}</span></div>
          <div class="note">${DATA.company.name}${DATA.tier() === "essential" ? " · pilot site" : ""} · ${DATA.org().headcount} staff<br>${DATA.tier() === "essential" ? `${icon("lock", "lk")} greyed = next tier · R4 flags, not forks` : "Sealed cells · split stores · §04–05"}</div>
        </div>
      </aside>
      <main class="workspace" id="ws">
        <div class="workspace-inner screen-fade">${webInner(r, P, def)}</div>
      </main>
    </div>`;
  }

  /* ---------- mobile shell ---------- */
  function mobileShell(r) {
    const P = PERSONAS[r.persona];
    const def = P.mobile[r.screen](r.param);
    const activeTab = (P.tabParent && P.tabParent[r.screen]) || r.screen;
    const tabs = P.tabs.map(tb => {
      const locked = tb.lock && !DATA.has(tb.lock);
      if (locked) return `<button class="tab locked" data-act="${UI.lockMsg(tb.label, DATA.unlockLabel(tb.lock))}">
        ${icon("lock")}<span>${tb.label}</span><span class="tdot"></span></button>`;
      return `<button class="tab" aria-current="${activeTab === tb.id}" data-go="${r.persona}/mobile/${tb.id}">
        ${icon(tb.icon)}<span>${tb.label}</span><span class="tdot"></span></button>`;
    }).join("");
    const me = DATA.me[r.persona];
    return `${topbar(r)}
    <div class="mobile-stage">
      <div class="phone" role="region" aria-label="${P.label} mobile app">
        <div class="phone-screen">
          <span class="island"></span>
          <div class="statusbar"><span>9:41</span><span class="icons">${icon("signal")}${icon("wifi")}${icon("battery")}</span></div>
          <div class="app-head">
            ${def.back ? `<button class="back" data-go="${def.back}" aria-label="${t("common.back")}">${icon("chevL")}</button>` : ""}
            <div style="min-width:0"><div class="ah-t">${def.title}</div><div class="ah-s">${P.appName} · ${me.name.split(" ")[0]}</div></div>
            <span style="flex:1"></span>
            <button class="bell" aria-label="Notifications">${icon("bell")}<span class="ping"></span></button>
          </div>
          <div class="app-body screen-fade" id="ab">${def.body}</div>
          <nav class="tabbar" aria-label="Tabs">${tabs}</nav>
          <div class="homebar"><i></i></div>
        </div>
      </div>
      <aside class="stage-aside">
        <div class="card"><h4>${P.label} · mobile frame</h4><p>${({
        staff: "Mobile-first ESS — one-tap clock-in hero, then requests and payslips. Tabs: Home · Time · Requests · Me.",
        manager: "Approvals-first. The queue is the home screen reflex — approve or return in two taps.",
        hr: DATA.has("l2") ? "Deliberately light: queue, alerts, profile. The full console stays on web — a v2.3 design decision." : "Deliberately light — alerts & profile. The L2 settle queue is a Growth+ feature; on Essential, managers complete approvals at L1.",
        ceo: "Four-metric snapshot, read-only. No edit controls exist anywhere in this app.",
        sysadmin: "Health & alerts only. Authoring stays on web; never shows employee records or pay."
      })[r.persona]}</p></div>
        <div class="card"><h4>Try the ledger</h4><p>${({
        staff: "Submit a request here, then switch to Manager → it appears in the L1 queue instantly.",
        manager: "Approve LV-0481, then open Staff → its status flips to Approved. One write, many lenses.",
        hr: DATA.has("l2") ? "Settle EX-0210 at L2 — it lands as a reimbursement line on pay run PR-2026-06." : "Flip the tier toggle to Pro and the L2 queue, vault and broadcast unlock in place — same codebase, one flag (R4).",
        ceo: "Numbers here are aggregates over the same rows the other lenses write — never copies.",
        sysadmin: "Any action you take lands on the audit tail — check Audit after approving anything."
      })[r.persona]}</p></div>
        <div class="card"><h4>Hand-off note</h4><p>Bottom tabs, back stack and safe-areas follow this frame 1:1 — see README → “Mobile contract”.</p></div>
      </aside>
    </div>`;
  }

  /* ---------- render ---------- */
  let lastRoute = "", lastBlocked = "";
  function render() {
    const r = route();
    const portalView = r.view === "login" || r.view === "activate" || r.view === "reset" || r.view === "setpw";
    document.body.dataset.persona = r.view === "app" ? r.persona : "";
    document.body.dataset.portal = portalView ? "1" : "";
    if (portalView) { // the front door — clean pastel stage, no shell
      app().innerHTML = r.view === "login" ? AUTHV.loginPage() : r.view === "activate" ? AUTHV.activatePage(r.token) : r.view === "setpw" ? AUTHV.setPasswordPage(r.token) : AUTHV.resetPage(r.token);
      document.title = (r.view === "login" ? "Sign in" : r.view === "activate" ? "Activate account" : r.view === "setpw" ? "Set a password" : "Reset password") + " — Adeptio Adaptive HR v2.4.5";
      AUTHV.mountPortal();
      lastRoute = location.hash;
      return;
    }
    AUTHV.unmountPortal();

    // v2.4.4 fine-tune — opening/switching/closing the inline week only changes the trailing
    // month.<weekStartISO> param. Swap ONLY the screen content in place: the shell, the rail
    // and (crucially) the window scroll position are left untouched → no blink, no jump to top.
    const softKey = (h) => String(h).replace(/(\/sched-(?:cal|manage)\/month)\.\d{4}-\d\d-\d\d/, "$1");
    const weekToggle = r.view === "app" && lastRoute !== "" && lastRoute !== location.hash
      && softKey(lastRoute) === softKey(location.hash);
    if (weekToggle) {
      const P = PERSONAS[r.persona];
      try {
        document.body.dataset.anim = "off";
        if (r.device === "mobile") {
          const ab = document.getElementById("ab");
          if (ab) { ab.innerHTML = P.mobile[r.screen](r.param).body; lastRoute = location.hash; return; }
        } else {
          const inner = document.querySelector(".workspace-inner");
          if (inner) { inner.innerHTML = webInner(r, P, P.web[r.screen](r.param)); lastRoute = location.hash; return; }
        }
      } catch (e) { /* fall through to a full render */ }
    }

    // full render — a same-route ledger pulse keeps scroll; a real navigation scrolls to top.
    // web scrolls the WINDOW (the workspace has no overflow); only mobile #ab scrolls in-pane.
    const sameRoute = lastRoute === location.hash && lastRoute !== "";
    document.body.dataset.anim = sameRoute ? "off" : "on"; // ledger re-renders repaint without replaying entrances
    const mob = document.getElementById("ab");
    const keep = sameRoute ? (mob ? mob.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0)) : 0;
    app().innerHTML = r.view === "launcher" ? launcher() : (r.device === "mobile" ? mobileShell(r) : webShell(r));
    document.title = r.view === "launcher" ? "Adeptio Adaptive HR — Platform UI v2.4.5"
      : `${PERSONAS[r.persona].label} · ${r.screen} — Adeptio`;
    const mob2 = document.getElementById("ab");
    if (sameRoute) { if (mob2) mob2.scrollTop = keep; else window.scrollTo(0, keep); }
    else window.scrollTo(0, 0);
    lastRoute = location.hash;
    if (r.blocked && lastBlocked !== location.hash + r.blocked) {
      lastBlocked = location.hash + r.blocked;
      toast(r.blocked, "warn");
    }
  }

  /* ---------- actions ---------- */
  function handleAct(act) {
    const [cmd, arg] = act.split(/:(.+)/);
    switch (cmd) {
      /* ==SEAM:ACTIONS== v2.4.5 — add handleAct case "<cell>:<cmd>" here == */
      case "adv-request": { // G4 — Staff files an earned-wage advance (→ Advance approval in the unified inbox)
        if (typeof PAY === "undefined" || !PAY.requestAdvance) { toast("Advances unavailable", "warn"); break; }
        const el = document.getElementById("adv-amt") || document.getElementById("adv-amt-m");
        const raw = el ? String(el.value).replace(/[^\d]/g, "") : "";
        const row = PAY.requestAdvance(DATA.me.staff.id, raw ? Number(raw) : undefined);
        if (!row) { toast("Could not file the advance — check your earned-to-date.", "warn"); break; }
        toast(`Advance ${row.id} · ${UI.kip(row.amount)} requested — pending HR approval`);
        DATA.pulse();
        go("staff/" + (location.hash.indexOf("/mobile/") >= 0 ? "mobile" : "web") + "/requests");
        break;
      }
      case "profile-save": { // G3 — HR saves the People-record edit form to db_people
        const form = document.getElementById("pe-form"); if (!form) { toast("Edit form not found", "warn"); break; }
        const id = form.getAttribute("data-emp"); const patch = {};
        form.querySelectorAll("[data-f]").forEach(el => { patch[el.getAttribute("data-f")] = el.value.trim(); });
        const res = DATA.editStaff(id, patch, "Vilayvanh C.");
        if (!res || !res.ok) { toast((res && res.err) || "Could not save the profile", "warn"); break; }
        toast(`${id} profile updated — ${res.changed} field(s) saved to db_people`);
        go("hr/web/profile-view");
        break;
      }
      case "flag": { // T0 — toggle a feature flag (scope by acting persona)
        const p = route().persona; const scope = p === "manager" ? "manager" : p === "hr" ? "hr" : "sys";
        const r = FLAGS.set(arg, undefined, scope);
        toast(r.ok ? `Feature “${arg}” ${FLAGS.on(arg) ? "enabled" : "paused — menu hidden, data kept"}` : r.err, r.ok ? undefined : "warn");
        if (r.ok) DATA.pulse();
        break;
      }
      case "lic": { // T0 — tier-licensing controls (ships OFF)
        const parts = String(arg).split(":");
        if (parts[0] === "toggle") { const r = LICENSE.toggle(); toast(r.ok ? `Tier licensing ${LICENSE.enabled ? "enabled" : "disabled — all features available"}` : r.err, r.ok ? undefined : "warn"); }
        else if (parts[0] === "tier") { LICENSE.setTier(parts[1]); toast("Tier → " + parts[1]); }
        else if (parts[0] === "limit") { LICENSE.setLimit(parts[1], parts[2] || ""); toast("Open-tier " + parts[1] + " → " + (parts[2] || "unlimited")); }
        DATA.pulse();
        break;
      }
      case "pay": { // T3 — payroll depth (close run · set leveling · request advance)
        const parts = String(arg).split(":");
        if (parts[0] === "close") { const r = PAY.closeRun(); toast(r.ok ? `Run closed — ${PAY.kip(r.run.cost)} posted to the cashbook` : r.err, r.ok ? undefined : "warn"); }
        else if (parts[0] === "level") { const lv = PAY.setLeveling(parts[1]); toast("Compliance → " + lv.code + " · " + lv.desc); }
        else if (parts[0] === "advance") { const row = PAY.requestAdvance(parts[1]); toast(row ? `Advance ${PAY.kip(row.amount)} requested (cap ${PAY.kip(row.cap)}) — in the approvals inbox` : "No advance available", row ? undefined : "warn"); }
        DATA.pulse();
        break;
      }
      case "dbops": { // T7 — per-store reset / purge / migrate (auto-snapshots first)
        const [op, store] = String(arg).split(":");
        if (op === "reset") { DBOPS.reset(store); toast(`${store} reset to seed — snapshot taken`); }
        else if (op === "purge") { DBOPS.purge(store); toast(`${store} purged — snapshot taken`, "warn"); }
        else if (op === "migrate") { toast(DBOPS.migrate(store).note); }
        DATA.pulse();
        break;
      }
      case "platset": { // T9 — owner-gated Platform Settings
        const parts = String(arg).split(":");
        const acting = PLATOWNER.actingEmail();
        if (!PLATOWNER.isOwner(acting)) { toast("Only a platform-owner Gmail account can change configuration", "warn"); break; }
        if (parts[0] === "lock") { PLATOWNER.setLock(!PLATOWNER.locked()); toast(`Configuration ${PLATOWNER.locked() ? "locked" : "unlocked"}`); }
        else if (parts[0] === "ch") { if (PLATOWNER.locked()) { toast("Config is locked — unlock first", "warn"); break; } MAIL.setConfig(parts[1], { configured: true, note: parts[1] + " configured (demo)" }); toast(`${parts[1].toUpperCase()} channel configured — keys held as secrets at deploy`); }
        DATA.pulse();
        break;
      }
      case "hol-add": { // T5 — add a company holiday
        const box = document.getElementById("hol-form"); if (!box) break;
        const g = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : ""; };
        const r = LEAVECAL.addHoliday(g("date"), g("name"), "company");
        toast(r ? `Holiday “${r.name}” added on ${r.date}` : "Give the holiday a date and name", r ? undefined : "warn");
        if (r) DATA.pulse();
        break;
      }
      case "bk": { // full-split backup / restore (dated folders · force · export)
        const parts = String(arg).split(":");
        if (parts[0] === "force") { const bk = BACKUP.forceNow("admin"); toast(bk ? `Full backup ${bk.id} — ${(bk.stores || []).length} stores into folder ${BACKUP.today()}` : "Backup failed", bk ? undefined : "warn"); }
        else if (parts[0] === "daily") { const r2 = BACKUP.runDaily("admin"); toast(r2.ok ? `Daily backup created — folder ${BACKUP.today()}` : "Today's daily backup already exists", r2.ok ? undefined : "warn"); }
        else if (parts[0] === "restore") { const r2 = BACKUP.restore(parts[1], "admin"); toast(r2.ok ? `Restored from ${parts[1]} — ${r2.ids.length} stores` : "Restore failed", r2.ok ? undefined : "warn"); }
        else if (parts[0] === "export") { try { const json = BACKUP.exportSet(parts[1]); if (json && typeof document !== "undefined") { const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "adeptio-backup-" + parts[1] + ".json"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast("Backup " + parts[1] + " exported (download)"); } else { toast("Backup not found", "warn"); } } catch (er) { toast("Export failed", "warn"); } }
        DATA.pulse();
        break;
      }
      case "clock": {
        DATA.clock();
        toast(DATA.state.clockedIn ? "Clocked in · GPS verified inside geofence" : "Clocked out — see you tomorrow");
        break;
      }
      case "approve": {
        DATA.approve(arg);
        const r = DATA.requests.find(x => x.id === arg);
        toast(`${arg} ${r && r.stage.startsWith("L2") ? "approved → escalated to HR / Finance (L2)" : "approved — ledger, staff view & audit updated"}`);
        break;
      }
      case "return": { DATA.ret(arg); toast(arg + " returned to staff with a note", "warn"); break; }
      case "submit-request": {
        const g = (id) => { const el = document.getElementById(id); return el ? String(el.value).trim() : ""; };
        const type = arg; let detail = "Request", extra = {};
        if (type === "Leave") {
          const sub = g("rq-leave-type") || "Annual leave", days = g("rq-days") || "2 days";
          detail = `${sub} · ${days}`;
          extra = { dates: g("rq-from") ? g("rq-from") + (g("rq-to") ? " – " + g("rq-to") : "") : "Jun 2026", note: g("rq-note") || "Submitted from UI preview." };
        } else if (type === "Overtime") {
          const hrs = g("rq-hours") || "2"; detail = `Overtime · ${hrs} hours`;
          extra = { hours: Number(hrs) || 0, dates: g("rq-otdate") || "Jun 2026", note: g("rq-note") || "Submitted from UI preview." };
        } else if (type === "Claim") {
          detail = `Expense claim · ₭ ${g("rq-amt") || "420,000"}`;
          extra = { dates: g("rq-cdate") ? "Receipt · " + g("rq-cdate") : "Receipt · Jun 06", note: g("rq-note") || "Submitted from UI preview." };
        } else if (type === "Correction") {
          detail = `Punch correction · ${g("rq-cdate") || "Jun 05"}`;
          extra = { note: g("rq-note") || "Submitted from UI preview." };
        }
        const id = DATA.submitRequest(type, detail, extra);
        toast(`${id} submitted — now in your manager's L1 queue`);
        const r = route();
        go(`${r.persona}/${r.device}/request-detail/${id}`);
        break;
      }
      case "advance-run": { DATA.advanceRun(arg); const run = DATA.payrollRuns.find(x => x.id === arg); toast(`${arg} → ${run.state}${run.state === "disbursed" ? " · bank file exported, payslips published" : ""}`); break; }
      case "send-comms": { DATA.sendComms("Division · Production", ["Email", "Push"], 142); toast("Sent to ≈142 recipients on 2 channels — delivery tracking live"); break; }
      case "lang-lo": { toast("ລາວ pack is staged — UI strings are externalized (js/i18n.js), translations land in the build phase", "warn"); break; }
      case "locked": { toast(arg, "warn"); break; }
      case "set-tier": {
        DATA.setTier(arg);
        toast(arg === "essential" ? "Tier flag → Essential (≤50) — gated features grey out with a key-lock" : "Tier flag → Professional (≤250) — CEO board, System Admin, L2, vault & more unlock");
        break;
      }
      case "set-tier-go": { // unlock-and-preview from a locked persona card
        DATA.setTier("professional");
        toast("Tier flag → Professional (≤250) — previewing " + PERSONAS[arg].label);
        go(`${arg}/web/${defaultScreen(arg, "web")}`);
        break;
      }

      /* ---------- v2.4.2 — devices (Sys Admin) ---------- */
      case "device-add": {
        const v = DEVICES.vendorById(arg);
        const box = document.getElementById(`devf-${arg}`);
        const f = { vendor: arg };
        if (box) box.querySelectorAll("[data-f]").forEach(inp => {
          const k = inp.getAttribute("data-f");
          f[k] = inp.type === "checkbox" ? inp.checked : inp.value.trim();
        });
        f.ip = f.ip || f.host;
        const id = DEVICES.addDevice(f);
        toast(`${v.name} registered as ${id} — ${v.lane === "A" ? "awaiting first push" : v.lane === "C" ? "import path ready" : "polling"} → db_devices`);
        go(`sysadmin/web/device/${id}`);
        break;
      }
      case "device-test": { const res = DEVICES.testConnection(arg); toast(res.msg, res.ok ? undefined : "warn"); break; }
      case "device-test-all": {
        let ok = 0, bad = 0; DEVICES.devices().forEach(d => { DEVICES.testConnection(d.id).ok ? ok++ : bad++; });
        toast(`Tested ${ok + bad} devices — ${ok} ok${bad ? ", " + bad + " unreachable" : ""}`, bad ? "warn" : undefined);
        break;
      }
      case "device-reconnect": { DEVICES.reconnect(arg); toast(arg + " reconnected — heartbeat ok"); break; }
      case "device-remove": {
        const d = DEVICES.deviceById(arg); DEVICES.removeDevice(arg);
        toast(`${arg}${d ? " · " + d.vendor : ""} removed — punches already in db_time are untouched`, "warn");
        go("sysadmin/web/biometrics");
        break;
      }
      case "device-bind": {
        DEVICES.toggleBind(arg); const d = DEVICES.deviceById(arg);
        toast(d && d.auth === "AD-bound" ? `${arg} bound to the directory — punches resolve to AD / RADIUS accounts` : `${arg} unbound — local device-user map`);
        break;
      }
      case "gate-control": {
        const [gid, st] = arg.split(":"); DEVICES.setGateState(gid, st);
        toast(`${gid} → ${st === "secured" ? "secured" : st === "held" ? "held open" : "flagged forced"}`, st === "secured" ? undefined : "warn");
        break;
      }

      /* ---------- v2.4.2 — capture groups & methodology (HR) ---------- */
      case "group-add": {
        const box = document.getElementById("grpf-new");
        const name = box && box.querySelector('[data-f="name"]') ? box.querySelector('[data-f="name"]').value.trim() : "";
        const primary = box && box.querySelector('[data-f="primary"]') ? box.querySelector('[data-f="primary"]').value : "mobile";
        const id = DEVICES.addGroup({ name: name || "New group", primary, allow: [primary] });
        toast(`Capture group "${name || "New group"}" created — assign staff and confirm its methodology`);
        go(`hr/web/group/${id}`);
        break;
      }
      case "group-method": { const [gid, m] = arg.split(":"); DEVICES.setPrimary(gid, m); toast(`Primary clock method → ${DEVICES.methodLabel(m)}`); break; }
      case "group-allow": {
        const [gid, m] = arg.split(":"); DEVICES.toggleAllow(gid, m);
        const on = (DEVICES.groupById(gid).allow || []).includes(m);
        toast(`${DEVICES.methodLabel(m)} ${on ? "allowed for this group" : "removed"}`);
        break;
      }
      case "group-assign": {
        const sel = document.getElementById(`grp-assign-${arg}`);
        if (sel && sel.value) { DEVICES.assignStaff(arg, sel.value); toast("Staff assigned to this capture group"); }
        else toast("Pick a staff member to add", "warn");
        break;
      }
      case "group-remove": { const [gid, emp] = arg.split(":"); DEVICES.removeMember(gid, emp); toast("Removed from group"); break; }
      /* ---------- v2.3.2.db — staff lifecycle (add · delete · assign) ---------- */
      case "staff-add": { // New hire form (hr/web/person-new)
        const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
        const name = val("st-name");
        if (!name) { toast("Give the new hire a name first", "warn"); break; }
        const res = DATA.hireStaff({ name, pos: val("st-pos"), div: val("st-div"), team: val("st-team") });
        if (res && res.blocked) { toast(res.msg, "warn"); break; }
        const id = res;
        toast(`${id} · ${name} created in db_people — selectable as a Staff user right away`);
        go("hr/web/person/" + id);
        break;
      }
      case "staff-del": { // Offboard & remove (person detail)
        DATA.offboardStaff(arg);
        toast(`${arg} offboarded — record exported & removed, headcount re-derived`, "warn");
        go("hr/web/people");
        break;
      }
      case "staff-assign": { // Reassign division/team (person detail)
        const dv = document.getElementById("as-div"), tm = document.getElementById("as-team");
        if (DATA.reassignStaff(arg, dv && dv.value, tm && tm.value)) {
          toast(`${arg} reassigned — every lens updated on the same write`);
        }
        break;
      }
      case "mgr-assign": { // Manager: pull an existing employee onto Line A
        const sel = document.getElementById("mg-assign");
        if (!sel || !sel.value) { toast("Pick a staff member to assign", "warn"); break; }
        DATA.reassignStaff(sel.value, null, "Line A", "Khamla S.");
        toast(`${sel.value} assigned to Line A — now on your roster, board and schedule`);
        break;
      }

      /* ---------- v2.4.4 — Job Schedule & shifts (Schedule cell · CALCORE) ---------- */
      case "sched-flag": { // presentational status lens (Leave/OT/Sick/Active) — toggles the pill
        const el = document.querySelector(`.sf-pill[data-act="sched-flag:${arg}"]`);
        if (el) el.setAttribute("aria-pressed", el.getAttribute("aria-pressed") !== "true");
        break;
      }
      case "sched-period-add": {
        const box = document.getElementById("sched-periodf"); if (!box) break;
        const g = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : ""; };
        const days = Array.from(box.querySelectorAll("[data-day]")).filter(c => c.checked).map(c => c.getAttribute("data-day"));
        const row = SCHEDULE.createPeriod({ name: g("name"), start: g("start"), end: g("end"), kind: g("kind"), days: days.length ? days : undefined }, "Vilayvanh C.");
        toast(`${row.id} · ${row.name} created — ${row.start}–${row.end} → db_schedule`);
        break;
      }
      case "sched-group-add": {
        const box = document.getElementById("sched-groupf"); if (!box) break;
        const g = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : ""; };
        const memSel = box.querySelector('[data-f="members"]');
        const members = memSel ? Array.from(memSel.selectedOptions).map(o => o.value) : [];
        const row = SCHEDULE.createGroup({ name: g("name"), kind: g("kind"), div: g("div"), members }, "Vilayvanh C.");
        toast(`${row.id} · ${row.name} created — ${members.length} member${members.length === 1 ? "" : "s"} → db_schedule`);
        break;
      }
      case "sched-sg-add": {
        const box = document.getElementById("sched-sgf"); if (!box) break;
        const g = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : ""; };
        const row = SCHEDULE.createShiftGroup({ label: g("label"), period: g("period"), group: g("group"), cap: g("cap") }, "Vilayvanh C.");
        toast(`${row.id} · ${row.label} bound — cap ${row.cap} → db_schedule`);
        break;
      }
      case "sched-assign": {
        const box = document.getElementById("sched-assignf"); if (!box) break;
        const g = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : ""; };
        const date = g("date"), sg = g("sg"), emp = g("emp");
        const row = SCHEDULE.assign(date, sg, emp, "Khamla S.");
        if (row) toast(`${SCHEDULE.empName(emp)} rostered → ${sg} · ${date} (planned)`);
        else toast("Already on that shift — no duplicate added", "warn");
        break;
      }
      case "sched-unassign": { // sched-unassign:{rosterId}
        const ok = SCHEDULE.unassign(arg, "Khamla S.");
        toast(ok ? `${arg} removed from the roster` : "Row not found", ok ? undefined : "warn");
        break;
      }
      case "sched-publish-month": {
        const n = SCHEDULE.publish({ from: "2026-06-01", to: "2026-06-30" }, "Khamla S.");
        toast(n ? `${n} planned shift${n === 1 ? "" : "s"} published — staff calendars updated` : "Nothing to publish — all shifts already published");
        break;
      }
      case "sched-publish": { // sched-publish:{rosterId}
        const n = SCHEDULE.publish(arg, "Khamla S.");
        toast(n ? `${arg} published` : "Already published", n ? undefined : "warn");
        break;
      }
      case "sched-div-add": {
        const box = document.getElementById("sched-divf"); if (!box) break;
        const el = box.querySelector('[data-f="name"]'); const name = el ? el.value.trim() : "";
        if (!name) { toast("Give the division a name first", "warn"); break; }
        const row = SCHEDULE.createDivision(name, "Vilayvanh C.");
        toast(row ? `Division "${name}" created — written to db_people` : `"${name}" already exists`, row ? undefined : "warn");
        break;
      }
      case "sched-swap-req": {
        const box = document.getElementById("sched-swapf"); if (!box) break;
        const g = (k) => { const el = box.querySelector(`[data-f="${k}"]`); return el ? el.value : ""; };
        const [date, sg] = (g("shift") || "|").split("|");
        const to = g("to"), reason = g("reason");
        if (!to || !date || !sg) { toast("Pick a shift and a colleague", "warn"); break; }
        const id = SCHEDULE.requestSwap(to, date, sg, reason);
        toast(id ? `${id} submitted — your manager approves, then the roster updates itself` : "Could not submit the swap", id ? undefined : "warn");
        break;
      }
      case "sched-backup-now": {
        const bk = DB.backups.now(["db_schedule"], "manual", "Schedule snapshot");
        toast(`${bk.id} — db_schedule backed up (${bk.rows} rows · ${bk.sizeKB} KB). Blast radius: 1 store.`);
        DATA.pulse();
        break;
      }
      case "sched-restore": { // sched-restore:{bkId}
        const ids = DB.backups.restore(arg, ["db_schedule"]);
        toast(ids ? `${arg} restored — db_schedule rewound; no other store touched` : "Snapshot not found", ids ? undefined : "warn");
        DATA.pulse();
        break;
      }

      /* ---------- v2.3.2.db — database management actions ---------- */
      case "db-add": { // db-add:{store}:{table} — reads inputs from #dbf-{store}-{table}
        const [store, table] = arg.split(":");
        const box = document.getElementById(`dbf-${store}-${table}`);
        if (!box) break;
        const row = {};
        const sample = DB.list(store, table)[0] || {};
        box.querySelectorAll("[data-f]").forEach(inp => {
          const f = inp.getAttribute("data-f");
          let v = inp.value.trim();
          if (typeof sample[f] === "number") v = Number(v) || 0;
          row[f] = v;
        });
        const keyF = DBV.keyOf(store, table);
        if (!row[keyF]) { // auto-id from the existing pattern (shared-ID discipline)
          const m0 = String(sample[keyF] || "").match(/^([A-Z]{2,4})-0*(\d+)/);
          row[keyF] = m0 ? `${m0[1]}-${String(Number(m0[2]) + 400 + DB.list(store, table).length).padStart(4, "0")}` : "ROW-" + Date.now().toString().slice(-5);
        }
        // sensible defaults so new rows render nicely
        Object.keys(sample).forEach(k => { if (row[k] === undefined || row[k] === "") row[k] = typeof sample[k] === "number" ? 0 : Array.isArray(sample[k]) ? [] : (k === "state" ? "present" : k === "status" ? "active" : row[k] === "" ? "—" : sample[k] === null ? null : "—"); });
        DB.add(store, table, row, "console");
        toast(`Row ${row[keyF]} added to ${store}.${table} — persisted & audit-logged`);
        DATA.pulse();
        break;
      }
      case "db-del": { // db-del:{store}:{table}:{field}:{value}
        const [store, table, field, ...rest] = arg.split(":");
        const ok = DB.del(store, table, field, rest.join(":"), "console");
        toast(ok ? `Row removed from ${store}.${table} — the other ${DB.CATALOG.length - 1} stores never noticed` : "Row not found", ok ? undefined : "warn");
        DATA.pulse();
        break;
      }
      case "db-reset": {
        if (arg === "all") { DB.reset(null, "Thip N."); toast("All stores reseeded with sample data — registry, policies and audit refreshed"); }
        else { DB.reset(arg, "console"); toast(arg + " reseeded — blast radius: this store only"); }
        DATA.pulse();
        break;
      }
      case "db-factory": { // demo: clean slate — reseed every store AND clear the custodial snapshot area
        DB.reset(null, "Thip N."); // reseed first so the clear-fact below survives on the fresh audit ledger
        const n = DB.backups.clear("Thip N.");
        toast(`Factory reset — all stores reseeded, ${n} snapshot${n === 1 ? "" : "s"} cleared, schedules re-armed. Clean slate for the next demo.`);
        DATA.pulse();
        break;
      }
      case "backup-now": { // selectable, from the Backup Center checkboxes
        const ids = Array.from(document.querySelectorAll(".bk-sel:checked")).map(x => x.value);
        const lbl = (document.getElementById("bk-label") || {}).value || "";
        if (!ids.length) { toast("Pick at least one store to back up", "warn"); break; }
        const bk = DB.backups.now(ids, "manual", lbl || undefined, "Thip N.");
        toast(`${bk.id} — ${ids.length} store${ids.length > 1 ? "s" : ""}, ${bk.sizeKB} KB → custodial storage (L-CU)`);
        DATA.pulse();
        break;
      }
      case "backup-store": { // per-module snapshot
        const bk = DB.backups.now([arg], "manual", "Module snapshot · " + arg, "console");
        toast(`${bk.id} — ${arg} snapshotted alone (${bk.sizeKB} KB) · other modules untouched`);
        DATA.pulse();
        break;
      }
      case "store-restore": { // restore just this store from the newest snapshot containing it
        const bk = DB.backups.all().find(b => b.stores.includes(arg) && b.data[arg]);
        if (!bk) { toast("No snapshot holds " + arg + " yet — take one first", "warn"); break; }
        DB.backups.restore(bk.id, [arg], "console");
        toast(`${arg} restored from ${bk.id} (${bk.ts}) — restoring one module never rewinds another`);
        DATA.pulse();
        break;
      }
      case "backup-restore": {
        const ids = DB.backups.restore(arg, null, "Thip N.");
        toast(ids ? `${arg} restored → ${ids.length} store${ids.length > 1 ? "s" : ""} rewound to the snapshot` : "Snapshot not found", ids ? undefined : "warn");
        DATA.pulse();
        break;
      }
      case "backup-del": {
        DB.backups.remove(arg, "Thip N.");
        toast(arg + " expired from custodial storage (retention)", "warn");
        DATA.pulse();
        break;
      }
      case "backup-dl": {
        const bk = DB.backups.all().find(b => b.id === arg);
        if (bk) { download(`adeptio-${DB.TENANT}-${bk.id}.json`, { ...bk, note: "Portable export — the 'plain SQLite file' of this demo. Restores anywhere, no vendor account needed (P6)." }); toast(bk.id + " downloaded — vendor-independent copy in your custody"); }
        break;
      }
      case "db-export": {
        const ids = Array.from(document.querySelectorAll(".bk-sel:checked")).map(x => x.value);
        download(`adeptio-${DB.TENANT}-export.json`, DB.exportObj(ids.length ? ids : null));
        toast(`Exported ${ids.length || DB.CATALOG.length} store${(ids.length || 2) > 1 ? "s" : ""} as JSON — our custody, our keys`);
        break;
      }
      case "drill": {
        const d = DB.drill("Thip N.");
        toast(`Restore drill ${d.id} on ${d.target} — ${d.result.toUpperCase()} · ${d.checks}`, d.result === "pass" ? undefined : "warn");
        DATA.pulse();
        break;
      }
      case "dw-rebuild": {
        const n = DB.rebuildReports("Thip N.");
        toast(`dw_reports rebuilt by replaying ${n} facts from db_audit — derived views are disposable (P4)`);
        DATA.pulse();
        break;
      }
      /* ---------- v2.3.2.db — report runs (generate · view · download · expire) ---------- */
      case "report-gen": { // query the live stores, save a run, open its view-only page
        const run = REP.generate(arg);
        if (!run) { toast("That report is tier-gated — flip the toggle to preview", "warn"); break; }
        toast(`${run.id} generated — ${run.rows.length - 1} rows queried ${run.ts} · saved to ${REP.folder(arg)}`);
        const r = route();
        go(`${r.persona}/web/report-run/${run.id}`);
        break;
      }
      case "report-dl": { // download a stored run as CSV (the file link)
        const run = DB.reports.runs().find(x => x.id === arg);
        if (!run) { toast("Run not found — it may have expired from storage", "warn"); break; }
        const csv = run.rows.map(r => r.map(v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
        downloadText(run.id + ".csv", csv, "text/csv");
        DB.audit("system", "report.downloaded", run.id + " · " + run.report + ".csv", "reports");
        toast(`${run.id}.csv — ${run.rows.length - 1} rows · snapshot of ${run.ts}`);
        break;
      }
      case "report-json": { // full stored payload (KPIs + query + rows)
        const run = DB.reports.runs().find(x => x.id === arg);
        if (!run) break;
        download(run.id + ".json", run);
        toast(`${run.id}.json downloaded — full payload`);
        break;
      }
      case "report-rm": { // expire a file from storage
        if (DB.reports.remove(arg, "Thip N.")) { toast(arg + " expired from file storage (retention)", "warn"); DATA.pulse(); }
        break;
      }
      case "audit-dl": { // append-only ledger extract (CSV)
        const ev = DB.list("db_audit", "events");
        const csv = [["time", "actor", "action", "object", "origin"]].concat(ev.map(a => [a.ts, a.who, a.act, a.obj, a.ip]))
          .map(r => r.map(v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
        downloadText("adeptio-audit-extract.csv", csv, "text/csv");
        toast(`Audit extract — ${ev.length} facts exported (CSV, WORM copy unchanged)`);
        break;
      }
      /* ---------- Group A — real file exports over the live stores (reuse download helpers) ---------- */
      case "export": {
        const meS = DATA.me.staff;
        if (arg === "mydata") {
          download(`adeptio-mydata-${meS.id}.json`, {
            platform: "Adeptio Adaptive HR · v2.3.2.db", kind: "personal data export (GDPR-style takeout)",
            exported: new Date().toISOString(), employee: DATA.employees.find(e => e.id === meS.id) || meS,
            leaveBalance: DB.list("db_leave", "balances").filter(b => b.emp === meS.id),
            payslips: DATA.myPayslips(), punches: DB.list("db_time", "punches").filter(p => p.emp === meS.id),
            requests: DATA.mine(), documents: DATA.myDocs()
          });
          toast(`Your data export — ${meS.id} · signed JSON file downloaded (GDPR-style takeout)`);
        } else if (arg === "tax") {
          const slips = DATA.myPayslips();
          downloadText(`adeptio-tax-statement-${meS.id}.csv`, toCSV([["payslip", "period", "gross", "net", "deductions (tax+SSO)", "status"]]
            .concat(slips.map(p => [p.id, p.period, p.gross, p.net, (Number(p.gross) || 0) - (Number(p.net) || 0), p.status]))), "text/csv");
          toast(`Tax statement — ${slips.length} payslip line(s) for ${meS.id} (CSV)`);
        } else if (arg === "payslip") {
          const slips = DATA.myPayslips();
          downloadText(`adeptio-payslips-${meS.id}.csv`, toCSV([["payslip", "period", "gross", "net", "paid", "status"]]
            .concat(slips.map(p => [p.id, p.period, p.gross, p.net, p.paid, p.status]))), "text/csv");
          toast(`Payslip export — ${slips.length} slip(s) for ${meS.id} (CSV; PDF render lands in the build phase)`);
        } else if (arg === "reqhistory") {
          const rs = DATA.mine();
          downloadText(`adeptio-requests-${meS.id}.csv`, toCSV([["id", "type", "detail", "dates", "status", "stage", "submitted"]]
            .concat(rs.map(r2 => [r2.id, r2.type, r2.detail, r2.dates, r2.status, r2.stage, r2.submitted]))), "text/csv");
          toast(`Request history — ${rs.length} request(s) exported (CSV)`);
        } else if (arg === "teamreport" || arg === "teamslice") {
          const tm = DATA.team;
          downloadText(`adeptio-team-lineA-${arg}.csv`, toCSV([["id", "name", "pos", "div", "team", "state", "in", "attend%", "ot(h)", "leaveBal"]]
            .concat(tm.map(e => [e.id, e.name, e.pos, e.div, e.team, e.state, e.in, e.attend, e.ot, e.leaveBal]))), "text/csv");
          toast(`${arg === "teamslice" ? "Team data extract" : "Team report"} — ${tm.length} member(s), Line A (CSV)`);
        } else if (arg === "variance") {
          const runs = DATA.payrollRuns;
          downloadText(`adeptio-payroll-variance.csv`, toCSV([["run", "period", "state", "step", "staff", "gross", "cutoff", "notes"]]
            .concat(runs.map(r2 => [r2.id, r2.period, r2.state, r2.step, r2.staff, r2.gross, r2.cutoff, r2.notes]))), "text/csv");
          toast(`Variance report — ${runs.length} pay run(s) compared (CSV)`);
        } else if (arg === "orgchart") {
          const emp = DATA.employees.slice().sort((a, b) => (a.div + a.team).localeCompare(b.div + b.team));
          downloadText(`adeptio-org-chart.csv`, toCSV([["division", "team", "id", "name", "position", "state"]]
            .concat(emp.map(e => [e.div, e.team, e.id, e.name, e.pos, e.state]))), "text/csv");
          toast(`Org chart — ${emp.length} employees across ${DATA.org().divisions.length} divisions (CSV)`);
        } else if (arg === "exceptions") {
          const ex = DB.list("db_time", "punches").filter(p => p.status !== "ok");
          downloadText(`adeptio-attendance-exceptions.csv`, toCSV([["punch", "emp", "date", "in", "out", "hours", "status"]]
            .concat(ex.map(p => [p.id, p.emp, p.date, p.in, p.out, p.hours, p.status]))), "text/csv");
          toast(`Exceptions report — ${ex.length} flagged punch(es) (CSV)`);
        } else if (arg === "boardpack") {
          const o = DATA.org();
          download(`adeptio-board-pack.json`, {
            platform: "Adeptio Adaptive HR · v2.3.2.db", kind: "executive board pack",
            exported: new Date().toISOString(), tier: DATA.tier(), headcount: o.headcount,
            presence: { present: o.present, late: o.late, absent: o.absent, onleave: o.onleave },
            divisions: o.divisions, burn: DATA.burn, attendanceTrend: DATA.attendanceTrend
          });
          toast(`Board pack — KPIs, ${o.divisions.length} divisions & trends compiled (JSON; PDF render lands in the build phase)`);
        } else { toast("Export ready"); }
        break;
      }
      /* ---------- Group D — Communication cell: real db_comms writes (messages · channels · templates) ---------- */
      case "comms-nudge": {
        commsMsg("Production Line A — 1 late · 1 absent", ["Push"], 2, "Khamla S.");
        toast("Nudge delivered to 2 staff on Push — logged to db_comms.messages");
        DATA.pulse();
        break;
      }
      case "comms-publish": {
        const n = DATA.team.length;
        commsMsg("Production Line A — week 24 schedule", ["Push"], n, "Khamla S.");
        toast(`Schedule published to ${n} staff on Push — logged to db_comms.messages`);
        DATA.pulse();
        break;
      }
      case "comms-test": { // comms-test:{channelId}
        const ch = DB.list("db_comms", "channels").find(c => c.id === arg);
        if (!ch) { toast("Channel not found", "warn"); break; }
        commsMsg("Gateway test — " + ch.name, [ch.name], 1, "Thip N.");
        toast(`Test message sent on ${ch.name} — logged to db_comms.messages`);
        DATA.pulse();
        break;
      }
      case "comms-test-all": {
        const live = DB.list("db_comms", "channels").filter(c => c.status === "live");
        live.forEach(c => commsMsg("Gateway test — " + c.name, [c.name], 1, "Thip N."));
        toast(`Test message sent on ${live.length} live gateway${live.length === 1 ? "" : "s"} — logged to db_comms.messages`);
        DATA.pulse();
        break;
      }
      case "comms-reconnect": { // comms-reconnect:{channelId} — in-place status update + persist
        const ch = DB.list("db_comms", "channels").find(c => c.id === arg);
        if (!ch) { toast("Channel not found", "warn"); break; }
        ch.status = "live"; ch.rate = "recovering";
        DB.persist("db_comms");
        DB.audit("Thip N.", "comms.channel.reconnected", ch.id + " · " + ch.name, "studio");
        toast(`${ch.name} reconnected — status → live, db_comms updated`);
        DATA.pulse();
        break;
      }
      case "comms-add-channel": {
        DB.add("db_comms", "channels", { name: "New channel · pending", id: "chan-" + Date.now().toString().slice(-5), status: "live", rate: "—", today: 0 }, "Thip N.");
        toast("Channel added to db_comms.channels — configure provider & credentials next");
        DATA.pulse();
        break;
      }
      case "comms-new-template": {
        const maxN = DB.list("db_comms", "templates").reduce((m, t2) => Math.max(m, Number(String(t2.id).replace(/\D/g, "")) || 0), 0);
        DB.add("db_comms", "templates", { id: "TPL-0" + (maxN + 1), name: "Untitled frame", kind: "Email", lang: "EN", status: "draft", v: "0.1", updated: DB.now() }, "Thip N.");
        toast("Draft template added to db_comms.templates — author then send for review");
        DATA.pulse();
        break;
      }
      /* ---------- Group B — document generation (db_docs) + template lifecycle (db_comms.templates) ---------- */
      case "gen-doc": { // gen-doc:{scenario} — each creates real db_docs row(s)
        switch (arg) {
          case "staff-salary":     { const id = DATA.generateDoc({ name: "Salary certificate", kind: "Letter", status: "requested" }); toast(`${id} requested — Salary certificate · saved to db_docs (status: requested)`); break; }
          case "staff-employment": { const id = DATA.generateDoc({ name: "Employment verification", kind: "Letter", status: "requested" }); toast(`${id} requested — Employment verification · saved to db_docs`); break; }
          case "staff-attendance": { const id = DATA.generateDoc({ name: "Leave & attendance record", kind: "Report", status: "requested" }); toast(`${id} requested — Leave & attendance record · saved to db_docs`); break; }
          case "hr-salary-manysone": { const e = DATA.employees.find(x => /Manysone/.test(x.name)); const id = DATA.generateDoc({ emp: e && e.id, name: "Salary certificate", kind: "Letter", status: "issued", who: "Vilayvanh C." }); toast(`${id} generated & e-signed — Salary certificate${e ? " · " + e.name : ""} → db_docs`); break; }
          case "hr-employment-letter": { const e = DATA.employees[0]; const id = DATA.generateDoc({ emp: e.id, name: "Employment letter", kind: "Letter", status: "issued", who: "Vilayvanh C." }); toast(`${id} generated — Employment letter · ${e.name} → db_docs`); break; }
          case "hr-bulk-salary-finance": { const fin = DATA.employees.filter(x => x.div === "Finance"); const ids = fin.map(e => DATA.generateDoc({ emp: e.id, name: "Salary certificate", kind: "Letter", status: "issued", who: "Vilayvanh C." })); toast(`${ids.length} salary certificates generated for Finance — ${ids[0]}…${ids[ids.length - 1]} → db_docs`); break; }
          case "hr-contract-renewals": { const pr = DATA.employees.filter(x => x.status === "probation").slice(0, 3); const ids = pr.map(e => DATA.generateDoc({ emp: e.id, name: "Contract renewal", kind: "Contract", status: "issued", who: "Vilayvanh C." })); toast(`${ids.length} contract renewals pre-filled — ${ids.join(", ")} → db_docs`); break; }
          case "hr-person-letter": { const rt = route(); const id = DATA.generateDoc({ emp: rt.param, name: "Employment letter (TPL-014)", kind: "Letter", status: "issued", who: "Vilayvanh C." }); toast(`${id} generated from TPL-014${rt.param ? " for " + rt.param : ""} → db_docs`); break; }
          default: toast("Document generated");
        }
        DATA.pulse();
        break;
      }
      case "comms-publish-template": { // comms-publish-template:{id} — publish in place (db_comms.templates)
        const tp = DB.list("db_comms", "templates").find(t2 => t2.id === arg);
        if (!tp) { toast("Template not found", "warn"); break; }
        tp.status = "published"; tp.updated = DB.now();
        DB.persist("db_comms");
        DB.audit("Thip N.", "template.published", tp.id + " · v" + tp.v, "studio");
        toast(`${tp.id} v${tp.v} published — locked & dated, db_comms updated`);
        DATA.pulse();
        break;
      }
      case "comms-clone-template": { // comms-clone-template:{id} — clone a published template into a custom draft
        const src = DB.list("db_comms", "templates").find(t2 => t2.id === arg);
        if (!src) { toast("Template not found", "warn"); break; }
        const maxN = DB.list("db_comms", "templates").reduce((m, t2) => Math.max(m, Number(String(t2.id).replace(/\D/g, "")) || 0), 0);
        DB.add("db_comms", "templates", { id: "TPL-0" + (maxN + 1), name: src.name + " (custom)", kind: src.kind, lang: src.lang, status: "draft", v: "0.1", updated: DB.now() }, "Thip N.");
        toast(`${src.id} cloned as a custom frame → db_comms.templates (draft)`);
        DATA.pulse(); break;
      }
      case "comms-preview-template": { // comms-preview-template:{id} — stamp a preview render
        const tp = DB.list("db_comms", "templates").find(t2 => t2.id === arg);
        if (!tp) { toast("Template not found", "warn"); break; }
        tp.lastPreview = DB.now();
        DB.persist("db_comms");
        DB.audit("Thip N.", "template.previewed", tp.id + " · sample data", "studio");
        toast(`${tp.id} preview rendered with sample data — db_comms updated`);
        DATA.pulse();
        break;
      }
      /* ---------- Group C — workflow state-changes (db_workflow · db_docs · db_audit · db_comms) ---------- */
      case "wf-ack-policy": { // acknowledge the pending policy → db_docs status update + ledger fact
        const me2 = DATA.me.staff;
        const doc = DB.list("db_docs", "documents").find(d => d.emp === me2.id && /conduct|policy/i.test(d.name + " " + d.kind) && d.status !== "acknowledged")
          || DB.list("db_docs", "documents").find(d => /conduct/i.test(d.name));
        if (!doc) { toast("No policy awaiting acknowledgement", "warn"); break; }
        doc.status = "acknowledged"; DB.persist("db_docs");
        DB.audit(me2.name, "policy.acknowledged", doc.id + " · " + doc.name, "mobile");
        toast(`${doc.name} acknowledged — db_docs updated & recorded on the audit ledger`);
        DATA.pulse(); break;
      }
      case "wf-profile-request": { // staff opens a profile change → db_workflow request
        const id = DATA.submitRequest("Profile", "Profile update — contact details");
        toast(`${id} opened — profile change request now in the HR queue (db_workflow)`);
        DATA.pulse(); break;
      }
      case "wf-profile-approve": { // HR approves a pending profile change → db_workflow
        const r2 = DB.list("db_workflow", "requests").find(x => x.status === "pending" && x.type === "Profile");
        if (r2) { DATA.approve(r2.id); toast(`${r2.id} profile change approved — db_workflow updated`); }
        else { DB.audit("Vilayvanh C.", "profile_change.approved", "PRF-0042 · bank account update", "10.0.4.12"); toast("PRF-0042 profile change approved — recorded on the audit ledger"); }
        DATA.pulse(); break;
      }
      case "wf-delegate": { // manager delegates an approval → db_workflow note update
        const r2 = DB.list("db_workflow", "requests").find(x => x.id === route().param);
        if (!r2) { toast("Open a request to delegate", "warn"); break; }
        r2.note = "Delegated to acting supervisor (Bouasone K.)"; DB.persist("db_workflow");
        DB.audit("Khamla S.", r2.type.toLowerCase() + ".delegated", r2.id, "10.0.7.31");
        toast(`${r2.id} delegated to acting supervisor — db_workflow updated`);
        DATA.pulse(); break;
      }
      case "wf-route-finance": { // HR routes a claim to finance export → db_workflow stage update
        const r2 = DB.list("db_workflow", "requests").find(x => x.id === route().param);
        if (!r2) { toast("Open a claim to route", "warn"); break; }
        r2.stage = "Finance export"; r2.note = "Routed to finance export by HR."; DB.persist("db_workflow");
        DB.audit("Vilayvanh C.", "claim.routed_finance", r2.id, "10.0.4.12");
        toast(`${r2.id} routed to finance export — db_workflow updated`);
        DATA.pulse(); break;
      }
      case "wf-coaching": { // PV coaching note → audit ledger fact
        DB.audit("Khamla S.", "coaching.note_recorded", "Keo Sayavong · no-show · PV ladder step 1", "10.0.7.31");
        toast("Coaching note recorded (PV flow) — on the append-only audit ledger");
        DATA.pulse(); break;
      }
      case "wf-ledger-adjust": {
        DB.audit("Vilayvanh C.", "payroll.ledger_adjusted", "TC-0109 · Latsamy V. · +0.4 d", "10.0.4.12");
        toast("Ledger adjusted (TC-0109) — recorded on the append-only audit ledger");
        DATA.pulse(); break;
      }
      case "wf-pv-escalate": {
        DB.audit("Vilayvanh C.", "pv.escalated", "Keo Sayavong · no-show · ladder step 2", "10.0.4.12");
        toast("Escalated on the PV ladder — manager coached, recorded on the audit ledger");
        DATA.pulse(); break;
      }
      case "wf-note-monitor": {
        DB.audit("Vilayvanh C.", "attendance.flag_noted", "Noy Keomany · late +42m · monitoring", "10.0.4.12");
        toast("Noted — monitoring; recorded on the audit ledger");
        DATA.pulse(); break;
      }
      case "wf-correction-reminders": { // time-correction nudge → db_comms message
        commsMsg("Time-correction reminders — 6 staff, missing punches", ["Push"], 6, "Vilayvanh C.");
        toast("Correction reminders sent to 6 staff — logged to db_comms.messages");
        DATA.pulse(); break;
      }
      case "wf-role-approve": {
        DB.audit("Thip N.", "role.request_approved", "manager → team reports scope", "studio");
        toast("Role request approved — manager gains team reports scope; recorded on the audit ledger");
        DATA.pulse(); break;
      }
      /* ---------- v2.4.1.edge.auth — the portal & the identity cell ---------- */
      case "auth-lang": { AUTHV.state.lang = arg === "lo" ? "lo" : "en"; render(); break; }
      case "auth-goto": { // landing-page shortcuts → the full portal page, in the right mode
        AUTHV.state.mode = arg === "outbox" ? "outbox" : "forgot";
        AUTHV.state.error = ""; AUTHV.state.info = "";
        if (location.hash === "#/login") render(); else go("login");
        break;
      }
      case "auth-mode": {
        AUTHV.state.mode = arg || "login"; AUTHV.state.error = ""; AUTHV.state.info = "";
        if (arg === "login") AUTHV.state.step = 1;
        render(); break;
      }
      case "auth-login-p": { // per-persona frame: account select + password, one click
        const accEl = document.getElementById("lp-acc-" + arg);
        const pwEl = document.getElementById("lp-pw-" + arg);
        AUTHV.state.focus = arg;
        doLogin(((accEl && accEl.value) || "").trim().toLowerCase(), (pwEl && pwEl.value) || "");
        break;
      }
      case "auth-logout": {
        AUTH.logout();
        AUTHV.state.error = ""; AUTHV.state.info = "Signed out — the session was revoked."; AUTHV.state.mode = "login";
        toast("Signed out — session revoked, fact on the ledger");
        if (AUTH.portalOn()) go("login"); else { go("launcher"); }
        break;
      }
      case "auth-reset-request": {
        const el = document.getElementById("fg-email");
        const em = ((el && el.value) || "").trim().toLowerCase();
        const rr = AUTH.resetRequest(em);
        AUTHV.state.error = rr.ok ? "" : rr.msg;
        AUTHV.state.info = rr.ok ? rr.msg + " Open it from the demo outbox below." : "";
        render(); break;
      }
      case "auth-activate": {
        const pw = (document.getElementById("ac-pw") || {}).value || "";
        const pw2 = (document.getElementById("ac-pw2") || {}).value || "";
        const res = AUTH.activate(arg, pw, pw2);
        if (res.ok) {
          AUTHV.state.mode = "login"; AUTHV.state.error = "";
          AUTHV.state.focus = AUTH.primaryScope(res.acc.scopes);
          AUTHV.state.prefill = { persona: AUTHV.state.focus, email: res.acc.email };
          AUTHV.state.info = "Account active — " + res.acc.email + " is pre-selected in its persona frame; sign in with your new password.";
          toast(res.acc.email + " activated — fact on the ledger, confirmation in the outbox");
          go("login");
        } else { AUTHV.state.error = res.msg; render(); }
        break;
      }
      case "auth-reset-do": {
        const pw = (document.getElementById("rs-pw") || {}).value || "";
        const pw2 = (document.getElementById("rs-pw2") || {}).value || "";
        const res = AUTH.resetDo(arg, pw, pw2);
        if (res.ok) {
          AUTHV.state.mode = "login"; AUTHV.state.error = "";
          AUTHV.state.focus = AUTH.primaryScope(res.acc.scopes);
          AUTHV.state.prefill = { persona: AUTHV.state.focus, email: res.acc.email };
          AUTHV.state.info = "Password updated — sign in.";
          toast("Password updated for " + res.acc.email);
          go("login");
        } else { AUTHV.state.error = res.msg; render(); }
        break;
      }
      case "auth-invite": { // arg = EMP id; reads the Access card inputs
        const em = (document.getElementById("ax-email") || {}).value || "";
        const sc = (document.getElementById("ax-scope") || {}).value || "staff";
        const p = DATA.employees.find(e => e.id === arg);
        const res = AUTH.invite({ emp: arg, name: p ? p.name : arg, email: em, scope: sc, who: "Vilayvanh C." });
        toast(res.ok ? `Access on — invite mailed to ${em.trim().toLowerCase()} (72 h link, demo outbox)` : res.msg, res.ok ? undefined : "warn");
        break;
      }
      case "auth-resend": { AUTH.resend(arg, "console"); toast("New 72 h activation link mailed to " + arg); break; }
      case "auth-reinvite": {
        const a = AUTH.account(arg);
        if (a) { AUTH.invite({ emp: a.emp, name: a.name, email: a.email, scope: a.scopes[0], who: "console" }); toast(arg + " re-invited — access switched back on (invited)"); }
        break;
      }
      case "auth-unlock": { AUTH.unlock(arg, "console"); toast(arg + " unlocked — fail counter cleared"); break; }
      case "auth-force-reset": { AUTH.forceReset(arg, "console"); toast("Reset link (30 min) mailed to " + arg); break; }
      case "auth-revoke-access": { AUTH.accessOff(arg, "Vilayvanh C."); toast(arg + " — access off, sessions revoked, mail sent", "warn"); break; }
      case "auth-pw-change": {
        const s = AUTH.session(); if (!s) break;
        const res = AUTH.changePassword(s.email, (document.getElementById("sec-old") || {}).value || "", (document.getElementById("sec-new") || {}).value || "");
        toast(res.ok ? "Password updated — confirmation mail in the outbox" : res.msg, res.ok ? undefined : "warn");
        if (res.ok) DATA.pulse();
        break;
      }
      case "auth-revoke": {
        if (AUTH.revoke(arg)) {
          toast("Session " + arg + " revoked", "warn");
          if (AUTH.portalOn() && !AUTH.session()) go("login"); else DATA.pulse();
        }
        break;
      }
      case "auth-revoke-others": { const n = AUTH.revokeOthers(); toast(n + " other session(s) revoked"); DATA.pulse(); break; }
      case "portal-toggle": {
        const on = !AUTH.portalOn();
        AUTH.setPortal(on, "Thip N.");
        toast("auth_portal → " + (on ? "on — sign-in guards persona entry" : "off — open demo, no wall"));
        DATA.pulse(); break;
      }
      case "portal-mode": { // explicit on/off — safe to press twice
        const want = arg === "on";
        if (AUTH.portalOn() === want) { toast("Front door already in " + (want ? "Sign-in" : "Open demo") + " mode"); break; }
        AUTH.setPortal(want, "Thip N.");
        toast(want ? "Front door → Sign-in — the portal guards persona entry again" : "Front door → Open demo — the wall is down, data stays live");
        DATA.pulse(); break;
      }
      /* ---------- v2.4.1.edge.auth — auth_mode · credential modes · providers · sync · import ---------- */
      case "edge-mode": { // auth_mode local | remote
        AUTH.setAuthMode(arg, "Thip N.");
        const m = AUTH.authMode();
        const warn = m === "remote" && !AUTH.remoteEnabled();
        toast(m === "remote"
          ? (warn ? "auth_mode → remote, but no Worker URL is set (js/api-config.js) — sign-in stays on the simulator" : "auth_mode → edge Worker — sign-in binds the real directory + Argon2id")
          : "auth_mode → local — the in-browser directory simulator answers binds", warn ? "warn" : undefined);
        DATA.pulse(); break;
      }
      case "cred-mode": { // cred-mode:{email}:{mode}
        const [em, md] = (arg || "").split(":");
        const res = AUTH.setMode(em, md, { reason: "switched by HR" }, "Vilayvanh C.");
        if (res.ok && res.noop) toast(em + " is already on " + md);
        else if (res.ok) toast(md === "local"
          ? em + " → local — a set-password link was mailed (works even if the directory is down)"
          : em + " → " + md.toUpperCase() + " — the directory now proves them; the local hash is purged on first bind", md === "local" ? "warn" : undefined);
        else toast(res.msg, "warn");
        DATA.pulse(); break;
      }
      case "auth-setpw": { // complete a directory → local switch
        const pw = (document.getElementById("sp-pw") || {}).value || "";
        const pw2 = (document.getElementById("sp-pw2") || {}).value || "";
        const res = AUTH.setPasswordViaToken(arg, pw, pw2);
        if (res.ok) {
          AUTHV.state.mode = "login"; AUTHV.state.error = "";
          AUTHV.state.focus = AUTH.primaryScope(res.acc.scopes);
          AUTHV.state.prefill = { persona: AUTHV.state.focus, email: res.acc.email };
          AUTHV.state.info = "Local password set — sign in.";
          toast("Local password set for " + res.acc.email);
          go("login");
        } else { AUTHV.state.error = res.msg; render(); }
        break;
      }
      case "dir-toggle": { // enable/disable a directory simulator member
        const cur = (AUTH.dirUser(arg) || {}).enabled;
        AUTH.dirToggle(arg, !cur, "Thip N.");
        toast(arg + " " + (!cur ? "enabled" : "disabled") + " in the directory simulator — the next delta sync reflects it", !cur ? undefined : "warn");
        DATA.pulse(); break;
      }
      case "provider-save": { // author the real LDAP/RADIUS connection config
        const g = (id) => { const el = document.getElementById("pv-" + arg + "-" + id); return el ? String(el.value).trim() : undefined; };
        const cur = AUTH.provider(arg); if (!cur) break;
        const patch = { name: g("name") || cur.name, host: g("host"), transport: g("transport"), secretRef: g("secretRef") };
        if (cur.type === "ldap") { patch.baseDN = g("baseDN") || "—"; patch.bindDN = g("bindDN") || "—"; patch.userDNTemplate = g("userDNTemplate") || ""; }
        AUTH.providerSet(arg, patch, "Thip N.");
        if (AUTH.remoteEnabled()) {
          AUTH.pushProviderToEdge(arg).then(r => toast(r && r.ok
            ? cur.name + " saved + pushed to the edge Worker — the real bind uses it now (no redeploy)"
            : cur.name + " saved locally — edge push failed: " + ((r && r.msg) || "unreachable") + ". Set the secret + redeploy.", r && r.ok ? undefined : "warn"));
        } else {
          toast(cur.name + " saved — drives the simulator now. Flip to Edge Worker (+ set the secret) for the real bind.");
        }
        DATA.pulse(); break;
      }
      case "provider-reachable": { // toggle the fail-closed outage simulation
        const p = AUTH.provider(arg); const next = !(p.reachable !== false);
        AUTH.providerSet(arg, { reachable: next }, "Thip N.");
        toast(next ? p.name + " restored — directory sign-in works again" : p.name + " outage simulated — directory accounts fail closed (D2); break-glass local admin still gets in", next ? undefined : "warn");
        DATA.pulse(); break;
      }
      case "provider-test": {
        const p = AUTH.provider(arg);
        toast(p.reachable !== false
          ? "Bind test → " + p.host + " responded (simulated) · " + (p.type === "ldap" ? "LDAPS 636" : "RadSec 2083") + " reachable"
          : p.name + " is unreachable — clear the simulated outage first", p.reachable !== false ? undefined : "warn");
        break;
      }
      case "prov-import-sample": {
        AUTHV.prov.csv = PROV.sampleCSV(); AUTHV.prov.dry = null;
        const el = document.getElementById("imp-csv"); if (el) el.value = AUTHV.prov.csv;
        DATA.pulse(); break;
      }
      case "prov-import-dry": {
        const el = document.getElementById("imp-csv");
        AUTHV.prov.csv = el ? el.value : AUTHV.prov.csv;
        AUTHV.prov.mode = (document.getElementById("imp-mode") || {}).value || "local";
        AUTHV.prov.dry = PROV.dryRun(AUTHV.prov.csv, { mode: AUTHV.prov.mode });
        toast("Dry-run — " + AUTHV.prov.dry.items.length + " row(s) parsed, nothing written yet");
        DATA.pulse(); break;
      }
      case "prov-import-commit": {
        const el = document.getElementById("imp-csv"); if (el) AUTHV.prov.csv = el.value;
        const job = PROV.commitImport(AUTHV.prov.csv, { mode: AUTHV.prov.mode, source: "pasted.csv" }, "Vilayvanh C.");
        AUTHV.prov.dry = null; AUTHV.prov.csv = "";
        toast("Import " + job.id + " — " + job.created + " created, " + job.linked + " linked" + (job.errors ? ", " + job.errors + " error(s)" : "") + (job.capped ? ", " + job.capped + " held (seat cap)" : "") + " · notice in the outbox", job.capped ? "warn" : undefined);
        DATA.pulse(); break;
      }
      case "prov-sync-run": {
        const run = PROV.runSync(arg, "Thip N.");
        toast(run.queue.length ? run.id + " — " + run.queue.length + " proposal(s) in the review queue" + (run.conflicts ? ", " + run.conflicts + " conflict held" : "") : run.id + " — no changes since the last run");
        DATA.pulse(); break;
      }
      case "prov-sync-decide": { const [rid, idx, dec] = (arg || "").split(":"); PROV.decide(rid, Number(idx), dec); DATA.pulse(); break; }
      case "prov-sync-apply": {
        const run = PROV.applySync(arg, "Thip N.");
        toast(run.id + " applied — +" + run.created + " created, " + run.linked + " linked, " + run.suspended + " suspended · notice in the outbox");
        DATA.pulse(); break;
      }
      case "prov-search": { // individual lookup by username / name / surname / EMP
        const q = ((document.getElementById("dirq") || {}).value || "").trim();
        AUTHV.prov.q = q;
        AUTHV.prov.results = q ? PROV.search(q) : null;
        if (q) toast(AUTHV.prov.results.length ? AUTHV.prov.results.length + " match(es) for \"" + q + "\"" : "No directory user or account matches \"" + q + "\"", AUTHV.prov.results.length ? undefined : "warn");
        DATA.pulse(); break;
      }
      case "prov-search-clear": { AUTHV.prov.q = ""; AUTHV.prov.results = null; DATA.pulse(); break; }
      case "prov-bind": { // bind ONE directory user in (create or link)
        const res = PROV.bindDirectoryUser(arg, "Thip N.");
        if (res.ok && res.noop) toast(arg + " is already bound to the directory");
        else if (res.ok) toast(arg + (res.action === "created" ? " — account created + bound to the directory" : " — linked to the directory"));
        else toast(res.msg || "Could not bind " + arg, "warn");
        if (AUTHV.prov.q) AUTHV.prov.results = PROV.search(AUTHV.prov.q); // refresh the status inline
        DATA.pulse(); break;
      }
      /* ---------- v2.4.3 — Payroll · OT · Tax actions ---------- */
      case "pay-export": {
        const div = arg || "all";
        downloadText(`adeptio-payroll-${div}.csv`, toCSV(PAY.exportMatrix(div)), "text/csv");
        toast(`Exported ${div === "all" ? "all divisions" : div} — pay components (CSV)`);
        break;
      }
      case "pay-export-json": {
        const div = arg || "all", m = PAY.exportMatrix(div), head = m[0];
        const rows = m.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
        download(`adeptio-payroll-${div}.json`, { division: div, exported: new Date().toISOString(), components: rows });
        toast(`Exported ${div === "all" ? "all divisions" : div} — pay components (JSON)`);
        break;
      }
      case "pay-import": {
        const ta = document.getElementById("payimp"), div = (document.getElementById("paydiv") || {}).value || "all";
        if (!ta || !ta.value.trim()) { toast("Paste CSV rows to import (or Load current as sample)", "warn"); break; }
        const res = PAY.importCSV(ta.value, div, "Latsamy V.");
        toast(res.ok ? `Imported ${res.n} row(s) into ${div === "all" ? "matched divisions" : div} — payslip net recomputed` : (res.msg || "Import failed"), res.ok ? undefined : "warn");
        DATA.pulse(); break;
      }
      case "pay-import-sample": {
        const ta = document.getElementById("payimp"), div = (document.getElementById("paydiv") || {}).value || "all";
        if (ta) ta.value = toCSV(PAY.exportMatrix(div));
        toast("Loaded current " + (div === "all" ? "all-division" : div) + " components — edit, then Import");
        break;
      }
      case "pay-save": {
        const bk = DB.backups.now(["db_payroll"], "manual", "Staff pay snapshot", "Latsamy V.");
        toast(`${bk.id} — payroll snapshot saved (${bk.sizeKB} KB → L-CU)`);
        DATA.pulse(); break;
      }
      case "pay-load": {
        const bk = DB.backups.all().find(b => b.stores.includes("db_payroll") && b.data["db_payroll"]);
        if (!bk) { toast("No payroll snapshot yet — Save one first", "warn"); break; }
        DB.backups.restore(bk.id, ["db_payroll"], "Latsamy V.");
        toast(`Payroll restored from ${bk.id} (${bk.ts})`);
        DATA.pulse(); break;
      }
      case "pay-zip": {
        const slips = DATA.payslips;
        if (!slips.length) { toast("No payslips to zip", "warn"); break; }
        const files = slips.map(p => ({ name: `${p.id}.csv`, text: toCSV(payslipMatrix(p)) }));
        files.push({ name: "index.csv", text: toCSV([["slip", "employee", "period", "gross", "net", "status"]].concat(slips.map(p => [p.id, (DATA.employees.find(e => e.id === p.emp) || {}).name || p.emp, p.period, p.gross, p.net, p.status]))) });
        downloadZip(`adeptio-payslips-${DB.TENANT}.zip`, files);
        toast(`ZIP — ${slips.length} payslip(s) bundled (+ index.csv)`);
        break;
      }
      case "pay-slip-dl": {
        const p = DATA.payslips.find(x => x.id === arg); if (!p) { toast("Payslip not found", "warn"); break; }
        downloadText(`${p.id}.csv`, toCSV(payslipMatrix(p)), "text/csv");
        toast(`${p.id}.csv downloaded`);
        break;
      }
      case "ot-limit": {
        const [div, scope] = (arg || "").split(":");
        const el = document.getElementById("ot-" + div + "-" + scope);
        if (!el) { toast("Limit field not found", "warn"); break; }
        OT.setLimit(div, scope, el.value, "Vilayvanh C.");
        toast(`${div} ${scope} OT limit → ${Math.max(0, Math.round(Number(el.value) || 0))} h`);
        DATA.pulse(); break;
      }
      case "tax-save": {
        const g = (id) => { const el = document.getElementById(id); return el ? Number(String(el.value).replace(/[, ]/g, "")) : undefined; };
        const patch = {};
        ["nssfEmp", "nssfEr", "nssfCap", "pitExempt"].forEach(k => { const v = g("tax-" + k); if (v != null && !isNaN(v)) patch[k] = v; });
        PAY.setTaxConfig(patch, "Vilayvanh C.");
        const c = PAY.compliance();
        toast(`Tax config saved — ${c.level}${c.level === "Adjusted" ? " (" + c.diffs.length + " deviation" + (c.diffs.length === 1 ? "" : "s") + ")" : ", matches statutory"} · payslips recomputed`, c.level === "Compliant" ? undefined : "warn");
        DATA.pulse(); break;
      }
      case "tax-reset": {
        PAY.resetTaxConfig("Vilayvanh C.");
        toast("Tax config reset to the Lao statutory baseline — Compliant");
        DATA.pulse(); break;
      }
      case "pick": { return "pick"; } // handled inline by caller
      case "toast": default: toast(arg || "Done"); break;
    }
  }

  /* ---------- v2.4.1.edge.auth — sign-in glue: username decides the landing ----------
     auth_mode=remote + a Worker URL → verify at the edge (async); otherwise the local /
     simulator path (sync). Both land in finishLogin so the UX is identical either way. */
  function doLogin(email, pw) {
    if (AUTH.remoteEnabled && AUTH.remoteEnabled()) {
      AUTH.loginRemote(email, pw).then(res => finishLogin(res, email))
        .catch(() => { AUTHV.state.error = "The edge Worker is unreachable — switch auth_mode back to the simulator, or check the deploy."; AUTHV.state.prefill = { persona: AUTHV.state.focus, email }; render(); });
      return;
    }
    finishLogin(AUTH.login(email, pw), email);
  }
  function finishLogin(res, email) {
    if (res.ok) {
      AUTHV.state.error = ""; AUTHV.state.info = ""; AUTHV.state.mode = "login"; AUTHV.state.prefill = null; AUTHV.state.focus = "";
      const prim = AUTH.primaryScope(res.acc.scopes);
      toast(`Sabaidee, ${res.acc.name.split(" ")[0]} — signed in (${res.acc.scopes.join(" + ")} scope)${res.edge ? " · verified at the edge" : ""}`);
      const h = location.hash.replace(/^#\/?/, "");
      if (!h || h === "launcher" || h === "login") go(`${prim}/web/${defaultScreen(prim, "web")}`);
      else render(); // deep link kept — the guard simply lifts
    } else {
      AUTHV.state.error = res.msg;
      AUTHV.state.info = "";
      AUTHV.state.prefill = { persona: AUTHV.state.focus, email }; // keep the chosen account in its frame
      render();
    }
  }

  /* ---------- v2.3.2.db — file download helpers ---------- */
  function downloadText(name, text, mime) {
    try {
      const blob = new Blob([text], { type: mime || "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) { toast("Download blocked by the browser — data is still safe in the store", "warn"); }
  }
  function download(name, obj) { downloadText(name, JSON.stringify(obj, null, 2), "application/json"); }
  function toCSV(matrix) { return matrix.map(r => r.map(v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n"); }
  /* v2.4.3 — payslip → CSV matrix, plus a tiny store-only ZIP writer (no deps, offline-safe) */
  function payslipMatrix(p) {
    const rows = [["Pay code", "Amount (LAK)"]];
    (p.lines || []).forEach(l => rows.push([l[0], l[1]]));
    (p.deds || []).forEach(l => rows.push([l[0], l[1]]));
    rows.push(["Gross", p.gross]); rows.push(["Net", p.net]);
    return rows;
  }
  function crc32(bytes) { let c = ~0; for (let i = 0; i < bytes.length; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; }
  function zipBlob(files) {
    const enc = new TextEncoder(), u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const chunks = [], central = []; let offset = 0;
    files.forEach(f => {
      const data = enc.encode(f.text), name = enc.encode(f.name), crc = crc32(data);
      const local = [0x50, 0x4b, 0x03, 0x04].concat(u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(local), name, data);
      central.push({ crc, len: data.length, name, offset }); offset += 30 + name.length + data.length;
    });
    const cdir = []; let cdirSize = 0;
    central.forEach(c => {
      const h = [0x50, 0x4b, 0x01, 0x02].concat(u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(c.crc), u32(c.len), u32(c.len), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      cdir.push(new Uint8Array(h), c.name); cdirSize += 46 + c.name.length;
    });
    const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06].concat(u16(0), u16(0), u16(central.length), u16(central.length), u32(cdirSize), u32(offset), u16(0)));
    return new Blob([...chunks, ...cdir, end], { type: "application/zip" });
  }
  function downloadZip(name, files) {
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(zipBlob(files)); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
    catch (e) { toast("ZIP blocked by the browser — slips are still in the store", "warn"); }
  }
  // Group D — append a real row to db_comms.messages (mirrors DATA.sendComms, with a chosen actor)
  function commsMsg(audience, channels, est, who) {
    DB.add("db_comms", "messages", { id: "MSG-0" + (88 + DB.list("db_comms", "messages").length), audience, ch: Array.isArray(channels) ? channels.join(" · ") : channels, est, ts: DB.now() }, who || "console");
  }

  /* ---------- v2.3.2.db — schedule editor (selects & toggles) ---------- */
  document.addEventListener("change", (e) => {
    const up = e.target.closest && e.target.closest("#bk-upload"); // v2.4.5 — admin restore from an uploaded backup file
    if (up && up.files && up.files[0]) {
      const file = up.files[0], rd = new FileReader();
      rd.onload = () => { const res = BACKUP.importFile(rd.result, "admin"); toast(res.ok ? `Restored ${res.n} store${res.n === 1 ? "" : "s"} from ${file.name}${res.skipped && res.skipped.length ? " · identity excluded" : ""}` : res.err, res.ok ? undefined : "warn"); if (res.ok) { DATA.pulse(); const r = route(); if (r.view === "app") go(`${r.persona}/${r.device}/backups`); } };
      rd.readAsText(file); return;
    }
    const sp = e.target.closest(".staff-pick"); // v2.3.2.db — switch the acting Staff user (any row in db_people)
    if (sp) { DATA.setActingStaff(sp.value); toast(`Staff lens → ${DATA.me.staff.name} — requests, payslips, punches & documents now read their rows`); return; }
    const f = e.target.closest(".sc-freq");
    if (f) { DB.setPolicy(f.getAttribute("data-store"), { freq: f.value, last: null }, "Thip N."); toast(`${f.getAttribute("data-store")} → ${f.value} exports · runs on the next scheduler tick`); DATA.pulse(); return; }
    const o = e.target.closest(".sc-on");
    if (o) { DB.setPolicy(o.getAttribute("data-store"), { enabled: o.checked }, "Thip N."); toast(`${o.getAttribute("data-store")} schedule ${o.checked ? "enabled" : "paused"}`); DATA.pulse(); return; }
    // v2.4.4 — schedule division filter: re-route the calendar with the chosen scope (carried in the param)
    const ss = e.target.closest(".sf-scope");
    if (ss) {
      const base = ss.getAttribute("data-sched-scope") || "";          // "persona/device/persp[.date]"
      const scope = ss.value;
      go(base + (scope && scope !== "all" ? "~" + encodeURIComponent(scope) : ""));
      return;
    }
    const ds = e.target.closest(".sched-divsel"); // Staff & Division — reassign a person's division
    if (ds && ds.value) { SCHEDULE.assignDivision(ds.getAttribute("data-emp"), ds.value, "Vilayvanh C."); toast(`${ds.getAttribute("data-emp")} → ${ds.value} — written to db_people`); return; }
  });

  document.addEventListener("click", (e) => {
    // v2.4.4 fine-tune — week-number rail (CALCORE emits .cal-wk[data-sched-week]) expands the
    // week IN PLACE inside the month page. Click a week → open it; click another → switch;
    // click the open one again → collapse. State rides the route param as month.<weekStartISO>,
    // carrying any ~scope division filter so the lens survives the toggle.
    const wk = e.target.closest("[data-sched-week]");
    if (wk) {
      const r = route();
      if (r.view === "app") {
        const wkStart = wk.getAttribute("data-sched-week");
        const raw = r.param || "";
        const ti = raw.indexOf("~");
        const tilde = ti >= 0 ? raw.slice(ti) : "";        // carry the division filter
        const bare = ti >= 0 ? raw.slice(0, ti) : raw;
        const dot = bare.indexOf(".");
        const persp = (dot >= 0 ? bare.slice(0, dot) : bare) || "month";
        const curWeek = dot >= 0 ? bare.slice(dot + 1) : "";
        const isOpen = persp === "month" && curWeek === wkStart; // already open → collapse
        const base = `${r.persona}/${r.device}/${r.screen}/`;
        go(base + (isOpen ? "month" : "month." + wkStart) + tilde);
      }
      return;
    }
    const actEl = e.target.closest("[data-act]");
    if (actEl) {
      const act = actEl.getAttribute("data-act");
      if (act.startsWith("pick:")) { // composer chips: ch = multi, others = single
        const row = actEl.parentElement;
        if (act === "pick:ch") {
          actEl.setAttribute("aria-pressed", actEl.getAttribute("aria-pressed") !== "true");
        } else {
          row.querySelectorAll(".choice").forEach(c => c.setAttribute("aria-pressed", "false"));
          actEl.setAttribute("aria-pressed", "true");
        }
        return;
      }
      handleAct(act);
      return;
    }
    const goEl = e.target.closest("[data-go]");
    if (goEl) go(goEl.getAttribute("data-go"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const el = e.target.closest("[data-go]");
    if (el && !el.matches("button,a")) go(el.getAttribute("data-go"));
  });

  DATA.subscribe(render);
  window.addEventListener("hashchange", render);
  window.addEventListener("scroll", () => { document.body.dataset.scrolled = window.scrollY > 8; }, { passive: true });
  window.addEventListener("DOMContentLoaded", () => { if (!location.hash) location.hash = "#/launcher"; render(); });
})();
