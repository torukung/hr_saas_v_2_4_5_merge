/* ============================================================
   ADEPTIO · UI library
   Inline SVG icon set (stroke 1.7 / round) · components · charts
   Everything returns an HTML string — screens compose these.
   ============================================================ */
window.UI = (function () {

  /* ---------- icons ---------- */
  const P = {
    home: '<path d="M4 11.5 12 4.5l8 7"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    inbox: '<path d="M4 13.5 6 6h12l2 7.5"/><path d="M4 13.5h4.5l1.2 2.5h4.6l1.2-2.5H20V19H4z"/>',
    user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M5 19.6c1.3-3.2 3.9-4.8 7-4.8s5.7 1.6 7 4.8"/>',
    users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c1-2.8 3-4.2 5.5-4.2s4.5 1.4 5.5 4.2"/><path d="M15.5 6.2a3 3 0 0 1 0 5.7M17 14.9c1.8.5 3 1.8 3.6 3.8"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.8v3.4M15.5 3.8v3.4"/>',
    banknote: '<rect x="3.5" y="6.5" width="17" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.6 9.5h.01M17.4 14.5h.01"/>',
    file: '<path d="M7 3.8h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5.3A1.5 1.5 0 0 1 7.5 3.8z" transform="translate(.5 -.6)"/><path d="M14 3.4v4.4h4.4"/>',
    files: '<path d="M8 7.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 18.5V9A1.5 1.5 0 0 1 8 7.5z"/><path d="M9 4.5h8a2 2 0 0 1 2 2V16"/>',
    folder: '<path d="M4 6.5h5l2 2.5h9V18a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18z"/>',
    chart: '<path d="M4.5 4.5V19.5h15"/><path d="M8.5 15.5v-4M12.5 15.5V8M16.5 15.5v-6.5"/>',
    trend: '<path d="M4 16.5 9.5 11l3.5 3.5 6.5-7"/><path d="M14.8 7.5h4.7v4.7"/>',
    megaphone: '<path d="M4 10.5v3.5h2.6l5.4 4V6.5l-5.4 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5.5M18 7.5a7 7 0 0 1 0 9.5"/>',
    shield: '<path d="M12 3.8 5.5 6.3v5.5c0 4 2.7 6.9 6.5 8.4 3.8-1.5 6.5-4.4 6.5-8.4V6.3z"/><path d="m9.3 11.9 2 2 3.4-3.8"/>',
    key: '<circle cx="8.5" cy="15.5" r="3.7"/><path d="m11.2 12.8 7.3-7.3M16 7l2.5 2.5M13.5 9.5 16 12"/>',
    plug: '<path d="M9 4.5v4M15 4.5v4M7 8.5h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5z"/><path d="M12 16.5v3"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevR: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
    chevL: '<path d="M15 5.5 8.5 12 15 18.5"/>',
    chevD: '<path d="m5.5 9 6.5 6.5L18.5 9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4.5v10M7.5 11 12 15.5 16.5 11"/><path d="M5 19.5h14"/>',
    bell: '<path d="M12 4.5a5 5 0 0 1 5 5c0 4 1.5 5.5 1.5 5.5h-13S7 13.5 7 9.5a5 5 0 0 1 5-5z"/><path d="M10.3 18.5a1.8 1.8 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    send: '<path d="M19.5 4.5 4.5 10.8l6 2.2 2.2 6z"/><path d="m10.5 13 9-8.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/>',
    eye: '<path d="M3.5 12S6.5 6.2 12 6.2 20.5 12 20.5 12 17.5 17.8 12 17.8 3.5 12 3.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    edit: '<path d="M14.5 5.5 18.5 9.5 9 19H5v-4z"/><path d="m12.8 7.2 4 4"/>',
    alert: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4M12 16.8h.01"/>',
    logout: '<path d="M14.5 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2v-2"/><path d="M9.5 12H20M16.8 8.5 20.2 12l-3.4 3.5"/>',
    layers: '<path d="m12 4 8 4.3-8 4.3-8-4.3z"/><path d="m5.2 12.2 6.8 3.7 6.8-3.7M5.2 16 12 19.7 18.8 16"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5z"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5V5.5M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
    pin: '<path d="M12 21s6.5-5.3 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.7 12 21 12 21z"/><circle cx="12" cy="10.3" r="2.3"/>',
    building: '<rect x="5" y="4" width="14" height="16.5" rx="1.5"/><path d="M9 8h2M13 8h2M9 11.5h2M13 11.5h2M9 15h2M13 15h2M10.5 20.5v-2.6h3v2.6"/>',
    pulse: '<path d="M3.5 12h4l2-5.5 4 11 2.2-5.5h4.8"/>',
    receipt: '<path d="M6 3.8h12V20l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 20z"/><path d="M9.5 8.5h5M9.5 12h5"/>',
    box: '<path d="m12 3.8 7.5 3.8v8.8L12 20.2l-7.5-3.8V7.6z"/><path d="M4.8 7.8 12 11.5l7.2-3.7M12 11.5v8.4"/>',
    heart: '<path d="M12 19.5S4.5 15 4.5 9.7A3.9 3.9 0 0 1 12 7.9a3.9 3.9 0 0 1 7.5 1.8C19.5 15 12 19.5 12 19.5z"/>',
    sparkle: '<path d="M12 4.5 13.8 10 19.5 12 13.8 14 12 19.5 10.2 14 4.5 12 10.2 10z"/>',
    wifi: '<path d="M4 9.8a12 12 0 0 1 16 0M7 13a8 8 0 0 1 10 0M10 16.2a4 4 0 0 1 4 0"/><path d="M12 19h.01"/>',
    battery: '<rect x="3" y="8" width="15" height="8" rx="2.4"/><path d="M20.5 11v2"/><rect x="5" y="10" width="9" height="4" rx="1.2" fill="currentColor" stroke="none"/>',
    signal: '<path d="M5 17.5v-2M9 17.5v-5M13 17.5V9M17 17.5V5.8"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    refresh: '<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M19.5 4.5v4h-4"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 5.7L19.5 7.5"/>',
    phone: '<rect x="7" y="3.5" width="10" height="17" rx="2.6"/><path d="M10.8 18h2.4"/>',
    history: '<path d="M5 12a7.5 7.5 0 1 1 2.2 5.3"/><path d="M5 13v-3.5h3.5"/><path d="M12 8.5V12l2.5 1.5"/>',
    swap: '<path d="M7 7.5h11M14.5 4l3.5 3.5L14.5 11"/><path d="M17 16.5H6M9.5 13 6 16.5 9.5 20"/>',
    calcheck: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.8v3.4M15.5 3.8v3.4"/><path d="m9 14.2 2 2 4-4"/>'
  };
  function icon(name, cls) {
    return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.grid}</svg>`;
  }

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = (name) => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const kip = (n) => "₭ " + Number(n).toLocaleString("en-US");

  /* ---------- components ---------- */
  function kpi(label, value, sub, opts = {}) {
    return `<div class="card kpi ${opts.hero ? "hero" : ""}">
      <span class="k-label">${esc(label)}</span>
      <span class="k-value num">${value}</span>
      ${sub ? `<span class="k-sub">${sub}</span>` : ""}
    </div>`;
  }

  function card(title, body, opts = {}) {
    const head = title ? `<div class="card-head">
        <span class="t">${opts.icon ? icon(opts.icon) : ""}${esc(title)}</span>
        ${opts.link ? `<button class="link" data-go="${opts.link}">${esc(opts.linkLabel || t("common.viewAll"))} ${icon("chevR")}</button>` : ""}
        ${opts.badge || ""}
      </div>` : "";
    return `<div class="card ${opts.cls || ""}" ${opts.span ? `style="grid-column:span ${opts.span}"` : ""}>${head}${body}</div>`;
  }

  function badge(status) {
    const map = {
      approved: ["ok", "Approved"], ok: ["ok", "OK"], live: ["ok", "Live"], active: ["ok", "Active"],
      published: ["ok", "Published"], disbursed: ["ok", "Disbursed"], present: ["ok", "Present"],
      pending: ["warn", "Pending"], draft: ["warn", "Draft"], review: ["warn", "In review"],
      late: ["warn", "Late"], expiring: ["warn", "Expiring"], onleave: ["", "On leave"],
      returned: ["bad", "Returned"], failed: ["bad", "Failed"], absent: ["bad", "Absent"],
      flagged: ["bad", "Flagged"], readonly: ["acc", "Read-only"],
      // v2.4.2 — device & gate statuses
      online: ["ok", "Online"], degraded: ["warn", "Degraded"], offline: ["bad", "Offline"],
      "import": ["acc", "Import"], secured: ["ok", "Secured"], held: ["warn", "Held open"], forced: ["bad", "Forced"]
    };
    const [cls, label] = map[status] || ["", status];
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  const idtag = (id) => `<span class="idtag">${esc(id)}</span>`;

  function rowitem(o) {
    return `<div class="rowitem ${o.go ? "click" : ""}" ${o.go ? `data-go="${o.go}" role="button" tabindex="0"` : ""}>
      ${o.avatar ? `<span class="avatar">${initials(o.avatar)}</span>`
        : `<span class="ric ${o.neutral ? "n" : ""}">${icon(o.icon || "file")}</span>`}
      <div class="rmain"><div class="rt">${o.title}</div><div class="rs">${o.sub || ""}</div></div>
      <div class="rside">${o.side || ""}</div>
    </div>`;
  }
  const rowlist = (items) => `<div class="rowlist">${items.join("")}</div>`;

  function table(cols, rows, opts = {}) {
    return `<div class="tablewrap"><table class="tbl">
      <thead><tr>${cols.map(c => `<th class="${c.r ? "r" : ""}">${esc(c.h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.go ? "click" : ""}" ${r.go ? `data-go="${r.go}" tabindex="0"` : ""}>${r.cells.map((c, i) => `<td class="${cols[i] && cols[i].r ? "r" : ""}">${c}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;
  }

  function steps(list, current) {
    return `<div class="steps">${list.map((s, i) => `
      <div class="step ${i < current ? "done" : i === current ? "now" : ""}">
        <div class="sdot">${i < current ? icon("check") : i + 1}</div>
        <div class="st">${esc(s.t)}</div><div class="ss">${esc(s.s || "")}</div>
      </div>`).join("")}</div>`;
  }

  function empty(iconName, title, sub) {
    return `<div class="empty">${icon(iconName)}<div class="et">${esc(title)}</div><div class="es">${esc(sub || "")}</div></div>`;
  }

  function avatar(name, lg) { return `<span class="avatar ${lg ? "lg" : ""}">${initials(name)}</span>`; }

  /* ---------- charts (hand-rolled SVG, no deps) ---------- */
  function sparkline(values, opts = {}) {
    const w = opts.w || 320, h = opts.h || 64, pad = 4;
    const min = Math.min(...values), max = Math.max(...values), span = (max - min) || 1;
    const pts = values.map((v, i) => [
      pad + i * (w - pad * 2) / (values.length - 1),
      h - pad - ((v - min) / span) * (h - pad * 2)
    ]);
    const line = pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ");
    const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
    const last = pts[pts.length - 1];
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${area}" fill="var(--acc-bg)" opacity=".55"/>
      <polyline points="${line}" fill="none" stroke="var(--acc)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="var(--acc-d)"/>
    </svg>`;
  }

  function bars(data, opts = {}) {
    // data: [{l, v, tone?}] — vertical rounded bars with labels
    const w = opts.w || 440, h = opts.h || 150, bot = 20, top = 14;
    const max = opts.max || Math.max(...data.map(d => d.v)) || 1;
    const bw = Math.min(36, (w / data.length) * 0.5);
    const step = w / data.length;
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      ${data.map((d, i) => {
      const bh = Math.max(3, (d.v / max) * (h - bot - top));
      const x = step * i + (step - bw) / 2, y = h - bot - bh;
      const fill = d.tone === "warn" ? "var(--warn)" : d.tone === "bad" ? "var(--bad)" : d.tone === "soft" ? "var(--acc-ln)" : "var(--acc)";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" rx="5" fill="${fill}" opacity="${d.tone === "soft" ? ".9" : ".88"}"/>
        ${opts.values ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="var(--ink-2)">${d.vt || d.v}</text>` : ""}
        <text x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="9.5" font-weight="600" fill="var(--muted)">${esc(d.l)}</text>`;
    }).join("")}
    </svg>`;
  }

  function lines2(a, b, labels, opts = {}) {
    // dual series line chart (e.g. budget vs actual)
    const w = opts.w || 640, h = opts.h || 190, padL = 34, padR = 10, padT = 12, padB = 22;
    const all = a.concat(b); const min = Math.min(...all) * 0.97, max = Math.max(...all) * 1.03, span = max - min || 1;
    const X = i => padL + i * (w - padL - padR) / (a.length - 1);
    const Y = v => padT + (1 - (v - min) / span) * (h - padT - padB);
    const path = s => s.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    const gridY = [0, .5, 1].map(f => padT + f * (h - padT - padB));
    const fmt = opts.fmt || (v => v);
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      ${gridY.map(y => `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--line-2)" stroke-width="1"/>`).join("")}
      ${[max, (max + min) / 2, min].map((v, i) => `<text x="${padL - 6}" y="${gridY[i] + 3}" text-anchor="end" font-size="8.5" fill="var(--muted-2)" font-weight="600">${fmt(v)}</text>`).join("")}
      <path d="${path(b)}" fill="none" stroke="var(--muted-2)" stroke-width="1.6" stroke-dasharray="4 4"/>
      <path d="${path(a)}" fill="none" stroke="var(--acc)" stroke-width="2.2" stroke-linecap="round"/>
      ${a.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.4" fill="var(--acc-d)"/>`).join("")}
      ${labels.map((l, i) => i % Math.ceil(labels.length / 12) === 0 ? `<text x="${X(i).toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="8.5" fill="var(--muted)" font-weight="600">${esc(l)}</text>` : "").join("")}
    </svg>`;
  }

  function donut(pct, opts = {}) {
    const r = 34, c = 2 * Math.PI * r, sz = opts.size || 92;
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 84 84" aria-hidden="true" style="display:block">
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--line-2)" stroke-width="9"/>
      <circle cx="42" cy="42" r="${r}" fill="none" stroke="${opts.color || "var(--acc)"}" stroke-width="9"
        stroke-dasharray="${(c * pct / 100).toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 42 42)"/>
      <text x="42" y="46" text-anchor="middle" font-size="17" font-weight="650" fill="var(--ink)" font-family="var(--display)">${Math.round(pct)}%</text>
    </svg>`;
  }

  function heatcal(opts = {}) {
    // June 2026 month grid: 1 Mon … 30 Tue; levels keyed by day number
    const dows = ["M", "T", "W", "T", "F", "S", "S"];
    const lv = opts.levels || {};
    let cells = dows.map(d => `<div class="hc dow">${d}</div>`).join("");
    for (let d = 1; d <= 30; d++) {
      const dow = (d - 1) % 7; // June 2026: 1st = Monday
      const wknd = dow >= 5;
      const cls = lv[d] || (wknd ? "off" : (d <= (opts.until || 10) ? "l2" : ""));
      cells += `<div class="hc ${cls}">${d}</div>`;
    }
    return `<div class="heatcal">${cells}</div>`;
  }

  function legend(items) {
    return `<div class="legend">${items.map(i => `<span><i style="background:${i.c}"></i>${esc(i.l)}</span>`).join("")}</div>`;
  }

  /* v2.4.3 — horizontal quota/usage meter (OT quotas, budgets) */
  function meter(pct, opts = {}) {
    const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const tone = opts.tone || (pct >= 100 ? "bad" : pct >= 85 ? "warn" : "ok");
    const col = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--ok)";
    return `<div class="meter">${opts.label ? `<div class="meter-lbl">${esc(opts.label)}</div>` : ""}<div class="meter-track"><span style="width:${p}%;background:${col}"></span></div></div>`;
  }

  /* ---------- tier lock affordances (v2.3.1.essential) ---------- */
  // Key-locked + greyed-out marker for features outside the current tier (R4: flags, not forks).
  const lockMsg = (label, unlock) => `locked:${esc(label)} unlocks at ${esc(unlock)} — locked on Essential. Use the tier toggle (top right) to preview.`;
  function lockTag(unlock) {
    return `<span class="badge lock" title="Unlocks at ${esc(unlock)}">${icon("lock")} ${esc(unlock.split(" ·")[0])}</span>`;
  }
  function lockBtn(label, unlock, cls) {
    return `<button class="btn ${cls || "sm ghost"} locked" data-act="${lockMsg(label, unlock)}">${icon("lock")} ${esc(label)}</button>`;
  }
  function lockChoice(label, unlock) {
    return `<button class="choice locked" data-act="${lockMsg(label, unlock)}">${icon("lock")} ${esc(label)}</button>`;
  }

  return { icon, esc, initials, kip, kpi, card, badge, idtag, rowitem, rowlist, table, steps, empty, avatar, sparkline, bars, lines2, donut, heatcal, legend, meter, lockMsg, lockTag, lockBtn, lockChoice };
})();
