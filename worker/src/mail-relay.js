// mail-relay.js — the platform mail relay, as an INTERFACE.
//
// Callers (the B1 auth endpoints) only ever call sendAuthMail(...). They never know or
// care which provider delivers it. Today's adapter is Gmail SMTP (mailer.js); swapping to
// an HTTP ESP (Resend / SendGrid / Brevo / MailChannels) later is a one-function change
// here with ZERO change to callers — exactly the §9 "keep the relay an interface" rule.
//
// auth_mode gating (the kernel flag):
//   - local  → demo outbox only, NO real send (file:// safe, demo never breaks)
//   - remote → real delivery via MAIL_PROVIDER (smtp | http)
//
// The demo outbox stays the "log lens" in both modes: every mail is recorded (subject,
// recipient, mode) via the optional recordOutbox() hook, whether or not it is actually sent.

import { smtpSendMail } from "./mailer.js";
import { templates } from "./templates.js";

/**
 * @param {object} env  Worker env (AUTH_MODE, MAIL_PROVIDER, SMTP_* secrets, MAIL_FROM)
 * @param {object} args
 * @param {string} args.kind          template key: invite|activate|reset|setPassword|syncImport
 * @param {string} args.to            recipient email
 * @param {object} [args.vars]        template variables (name, link, counts, ...)
 * @param {Function} [args.recordOutbox]  async hook to persist the outbox row (the log lens)
 * @returns {Promise<{delivered:boolean, mode:string, provider?:string, reason?:string}>}
 */
export async function sendAuthMail(env, { kind, to, vars = {}, recordOutbox } = {}) {
  const tpl = templates[kind];
  if (!tpl) throw new Error(`Unknown mail kind: ${kind}`);
  if (!to) throw new Error("sendAuthMail: 'to' is required.");

  const built = tpl(vars);
  const msg = { to, subject: built.subject, text: built.text, html: built.html };
  const mode = String(env.AUTH_MODE || "local").toLowerCase();

  // Outbox is the log lens — record in BOTH modes (never store secrets, only metadata).
  if (typeof recordOutbox === "function") {
    await recordOutbox({ kind, to, subject: msg.subject, mode, recordedAt: new Date().toISOString() });
  }

  if (mode !== "remote") {
    return { delivered: false, mode, reason: "auth_mode=local (outbox only, no real send)" };
  }

  const provider = String(env.MAIL_PROVIDER || "smtp").toLowerCase();
  if (provider === "smtp") {
    await smtpSendMail(env, msg);
    return { delivered: true, mode, provider };
  }
  if (provider === "http") {
    await httpEspSend(env, msg);
    return { delivered: true, mode, provider };
  }
  throw new Error(`Unknown MAIL_PROVIDER: ${provider} (expected "smtp" or "http").`);
}

/**
 * HTTP ESP swap-in seam. Implement against your provider's REST API when/if the Gmail
 * SMTP path is outgrown (daily cap, deliverability, custom domain). Left as a stub so the
 * relay interface is provider-agnostic. Example shape for Resend:
 *
 *   await fetch("https://api.resend.com/emails", {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${env.ESP_API_KEY}`, "Content-Type": "application/json" },
 *     body: JSON.stringify({ from: env.MAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
 *   });
 */
async function httpEspSend(env, msg) {
  throw new Error("HTTP ESP adapter not configured. Set MAIL_PROVIDER=smtp, or implement httpEspSend() for your ESP.");
}
