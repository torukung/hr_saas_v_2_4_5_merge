// mailer.js — minimal SMTP client for Cloudflare Workers (cloudflare:sockets).
// Sends one message over an authenticated TLS SMTP session.
//
// Tuned for Gmail SMTP (smtp.gmail.com:465 implicit TLS, AUTH LOGIN with a 16-char
// App Password), but works against any RFC 5321 server. Port 587 STARTTLS is supported.
//
// SECURITY:
//   - Never logs SMTP_USER / SMTP_PASS. Credentials come only from env (Worker secrets).
//   - Port 25 is rejected on purpose — Cloudflare Workers block outbound port 25.
//   - Body + subject are UTF-8 base64 encoded, so Lao (ລາວ) text is preserved and no
//     SMTP "dot-stuffing" hazard exists (base64 lines never begin with ".").
//
// Part of: v2.4.1.edge.auth baseline (B1). Called via mail-relay.js, never directly.

import { connect } from "cloudflare:sockets";

const CRLF = "\r\n";
const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ---- small helpers --------------------------------------------------------

function b64(str) {
  // UTF-8 safe base64 (btoa is latin1-only, so widen through the encoder first).
  const bytes = ENC.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function chunk76(s) {
  return s.match(/.{1,76}/g)?.join(CRLF) ?? s;
}

// RFC 2047 encoded-word for non-ASCII headers (e.g. a Lao Subject line).
function encodeHeaderWord(str) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(str)) return str; // pure ASCII → leave as-is
  return `=?UTF-8?B?${b64(str)}?=`;
}

function htmlToText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Line-buffered SMTP reply reader. Resolves on the final line of a reply
// (multiline replies use "250-foo" continuations; the last line is "250 foo").
function makeReader(readable) {
  const reader = readable.getReader();
  let buf = "";
  return {
    async readReply() {
      for (;;) {
        const lines = buf.split(CRLF);
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^\d{3} /.test(lines[i])) {
            const line = lines[i];
            buf = lines.slice(i + 1).join(CRLF);
            const code = parseInt(line.slice(0, 3), 10);
            return { code, line, ok: code >= 200 && code < 400 };
          }
        }
        const { value, done } = await reader.read();
        if (done) return { code: 0, line: buf.trim(), ok: false };
        buf += DEC.decode(value, { stream: true });
      }
    },
    release() {
      try { reader.releaseLock(); } catch (_) { /* noop */ }
    },
  };
}

function buildMime({ from, to, subject, text, html }) {
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Message-ID: <${crypto.randomUUID()}@adeptio.stage>`,
  ];
  const plain = text || (html ? htmlToText(html) : "");

  if (html) {
    const boundary = "=_adeptio_" + crypto.randomUUID().replace(/-/g, "");
    const body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      chunk76(b64(plain)),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      chunk76(b64(html)),
      ``,
      `--${boundary}--`,
      ``,
    ].join(CRLF);
    return (
      head.concat([`Content-Type: multipart/alternative; boundary="${boundary}"`, ``]).join(CRLF) +
      CRLF +
      body
    );
  }

  return (
    head
      .concat([`Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: base64`, ``, chunk76(b64(plain)), ``])
      .join(CRLF)
  );
}

// ---- main entry -----------------------------------------------------------

/**
 * Send one email over authenticated SMTP. Resolves {ok:true,to} or throws.
 * @param {object} env  Worker env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 * @param {{to:string, subject:string, text?:string, html?:string}} msg
 */
export async function smtpSendMail(env, msg) {
  const host = env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.MAIL_FROM || user;

  if (!user || !pass) throw new Error("SMTP not configured: set SMTP_USER and SMTP_PASS secrets.");
  if (port === 25) throw new Error("Port 25 is blocked on Cloudflare Workers. Use 465 (TLS) or 587 (STARTTLS).");
  if (!msg || !msg.to) throw new Error("smtpSendMail: msg.to is required.");

  const mime = buildMime({ from, to: msg.to, subject: msg.subject || "(no subject)", text: msg.text, html: msg.html });

  let socket = connect({ hostname: host, port }, { secureTransport: port === 587 ? "starttls" : "on", allowHalfOpen: false });
  await socket.opened;
  let reader = makeReader(socket.readable);
  let writer = socket.writable.getWriter();

  const send = (line) => writer.write(ENC.encode(line + CRLF));
  const sendRaw = (raw) => writer.write(ENC.encode(raw));
  const expect = async (stage, ...codes) => {
    const r = await reader.readReply();
    // r.line never contains credentials (AUTH echoes only base64 prompts/results, not our input).
    if (!r.ok || (codes.length && !codes.includes(r.code))) {
      throw new Error(`SMTP ${stage} failed: ${r.code} ${r.line}`);
    }
    return r;
  };

  try {
    await expect("greeting", 220);
    await send(`EHLO adeptio.stage`);
    await expect("EHLO", 250);

    if (port === 587) {
      await send("STARTTLS");
      await expect("STARTTLS", 220);
      // Upgrade: release locks, swap to the TLS socket, re-EHLO.
      reader.release();
      writer.releaseLock();
      socket = socket.startTls();
      await socket.opened;
      reader = makeReader(socket.readable);
      writer = socket.writable.getWriter();
      await send(`EHLO adeptio.stage`);
      await expect("EHLO(tls)", 250);
    }

    await send("AUTH LOGIN");
    await expect("AUTH", 334);
    await send(b64(user));
    await expect("AUTH user", 334);
    await send(b64(pass));
    await expect("AUTH pass", 235); // 535 here = wrong App Password / 2FA not set

    await send(`MAIL FROM:<${from}>`);
    await expect("MAIL FROM", 250);
    await send(`RCPT TO:<${msg.to}>`);
    await expect("RCPT TO", 250, 251);
    await send("DATA");
    await expect("DATA", 354);

    // Defensive dot-stuffing (base64 bodies never trigger it, but headers/edge cases are cheap to guard).
    const payload = mime.replace(/\r\n\./g, "\r\n..");
    await sendRaw(payload + CRLF + "." + CRLF);
    await expect("end-of-DATA", 250);

    await send("QUIT").catch(() => {});
    return { ok: true, to: msg.to };
  } finally {
    try { writer.releaseLock(); } catch (_) { /* noop */ }
    try { await socket.close(); } catch (_) { /* noop */ }
  }
}
