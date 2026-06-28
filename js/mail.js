/* ============================================================
   ADEPTIO · v2.4.5 — Messaging / channels  (window.MAIL)  · T6 (D1·D2)
   The channel layer behind HR's Communication composer: Email/SMTP
   (D1), plus SMS · LINE · WhatsApp (D2). A channel lights up only
   when its feature-flag is ON *and* it's configured (keys present) —
   the owner sets that up in Platform Settings (T9). Per-channel
   budget meter. Actual send stays a build-phase stub until the
   Cloudflare Worker. Node-safe.
   ============================================================ */
window.MAIL = (function () {
  const DEF = [
    { id: "mail",     label: "Email · SMTP",  flag: "mail",     icon: "mail" },
    { id: "sms",      label: "SMS",           flag: "sms",      icon: "chat" },
    { id: "line",     label: "LINE",          flag: "line",     icon: "chat" },
    { id: "whatsapp", label: "WhatsApp",      flag: "whatsapp", icon: "chat" }
  ];
  // owner-set config (keys held as secrets at deploy; here just configured? + note + budget)
  const cfg = {
    mail:     { configured: true,  note: "smtp.gmail.com:465 · App Password set", budget: { used: 412, limit: 5000 } },
    sms:      { configured: false, note: "provider / API key not set",            budget: { used: 0,   limit: 2000 } },
    line:     { configured: false, note: "OA channel token not set",              budget: { used: 0,   limit: 2000 } },
    whatsapp: { configured: false, note: "Cloud-API token not set",               budget: { used: 0,   limit: 2000 } }
  };
  const flagOn = (f) => { try { return window.FLAGS ? FLAGS.on(f) : true; } catch (e) { return true; } };
  function channels() { return DEF.map(c => ({ ...c, enabled: flagOn(c.flag), configured: cfg[c.id].configured, note: cfg[c.id].note, budget: cfg[c.id].budget, ready: flagOn(c.flag) && cfg[c.id].configured })); }
  const ready = (id) => !!(cfg[id] && cfg[id].configured && flagOn(id));
  function setConfig(id, patch, who) {
    if (cfg[id]) { Object.assign(cfg[id], patch); try { if (window.DB && DB.audit) DB.audit(who || "Thip N.", "mail.channel_config", id, "console"); } catch (e) {} try { if (window.DATA && DATA.pulse) DATA.pulse(); } catch (e) {} }
    return cfg[id];
  }
  return { channels, ready, setConfig, cfg };
})();
