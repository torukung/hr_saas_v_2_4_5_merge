// argon2.js — password hashing for the edge Worker (B1 · decision D7 = Argon2id).
//
// Argon2id via hash-wasm (runs in the Workers runtime — pure WASM, no Node built-ins).
// Stored format is the standard PHC string ($argon2id$v=19$m=..,t=..,p=..$salt$hash), so
// params travel with the hash and can be tuned per-tenant later.
//
// Transparent re-hash: v2.4.0 seeded its demo accounts as a sync SHA-256 of
// `email·password·adeptio.v240`. On the first successful edge sign-in we recognise that
// legacy hash, verify it, and re-write the account with a fresh Argon2id hash — so the
// migration is invisible to the user and one-way.

import { argon2id, argon2Verify } from "hash-wasm";

// OWASP-leaning params, trimmed for the edge memory budget (19 MiB, t=3, p=1).
const PARAMS = { parallelism: 1, iterations: 3, memorySize: 19456, hashLength: 32 };

export async function hashPassword(password, env) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return await argon2id({ password: password + (env.PASSWORD_PEPPER || ""), salt, ...PARAMS, outputType: "encoded" });
}

// → { ok, legacy } — legacy=true means "not an Argon2id hash; try the legacy path".
export async function verifyPassword(password, stored, env) {
  if (!stored) return { ok: false };
  if (typeof stored === "string" && stored.startsWith("$argon2")) {
    const ok = await argon2Verify({ password: password + (env.PASSWORD_PEPPER || ""), hash: stored });
    return { ok };
  }
  return { ok: false, legacy: true };
}

// Legacy v2.4.0 demo hash check (sync SHA-256, UTF-8) — used only to migrate seed accounts.
export async function legacyMatches(email, password, storedHex) {
  if (!storedHex) return false;
  const data = new TextEncoder().encode(email + "·" + password + "·adeptio.v240");
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === storedHex;
}
