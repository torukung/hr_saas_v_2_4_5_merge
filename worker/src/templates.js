// templates.js — bilingual (EN · ລາວ) auth mail templates for v2.4.1.edge.auth.
//
// Covers the existing portal mails (invite · activate · reset) plus the +2 new
// templates the blueprint adds for remote auth:
//   - setPassword : sent when an account's credential mode flips directory → local
//   - syncImport  : result notice to HR after a file import or LDAP/AD sync run
//
// Each template is a pure function returning { subject, text, html }.
// Keep copy short; this is staging/demo. All strings are UTF-8 (Lao-safe).

const FOOT_EN = "This is an automated message from the Adeptio HR portal (staging).";
const FOOT_LO = "ນີ້ແມ່ນຂໍ້ຄວາມອັດຕະໂນມັດຈາກລະບົບ Adeptio HR (staging).";

function wrap(titleEN, titleLO, bodyEN, bodyLO, cta) {
  const ctaHtml = cta ? `<p style="margin:20px 0"><a href="${cta.href}" style="background:#5C6493;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${cta.labelEN} · ${cta.labelLO}</a></p>` : "";
  const ctaText = cta ? `\n${cta.labelEN} / ${cta.labelLO}: ${cta.href}\n` : "";
  return {
    text: `${titleEN}\n\n${bodyEN}${ctaText}\n— — —\n${titleLO}\n\n${bodyLO}\n\n${FOOT_EN}\n${FOOT_LO}`,
    html:
      `<div style="font-family:system-ui,Segoe UI,sans-serif;color:#222127;max-width:560px">` +
      `<h2 style="font-weight:600">${titleEN}</h2><p>${bodyEN}</p>${ctaHtml}` +
      `<hr style="border:none;border-top:1px solid #E7E3DA;margin:18px 0">` +
      `<h2 style="font-weight:600">${titleLO}</h2><p>${bodyLO}</p>${ctaHtml}` +
      `<p style="color:#7C786F;font-size:12px;margin-top:18px">${FOOT_EN}<br>${FOOT_LO}</p></div>`,
  };
}

export const templates = {
  // Person invited to the portal (Access switched on for them).
  invite: ({ name = "", org = "Adeptio", link = "#" }) => ({
    subject: `${org}: You're invited to the HR portal · ທ່ານໄດ້ຮັບເຊີນເຂົ້າລະບົບ`,
    ...wrap(
      "You're invited",
      "ທ່ານໄດ້ຮັບເຊີນ",
      `Hello ${name}, an account has been created for you on the ${org} HR portal. Set your password to activate it. This invite expires in 72 hours.`,
      `ສະບາຍດີ ${name}, ບັນຊີຂອງທ່ານຖືກສ້າງຂຶ້ນໃນລະບົບ ${org} HR ແລ້ວ. ກະລຸນາຕັ້ງລະຫັດຜ່ານເພື່ອເປີດໃຊ້ງານ. ຄຳເຊີນນີ້ໝົດອາຍຸພາຍໃນ 72 ຊົ່ວໂມງ.`,
      { href: link, labelEN: "Activate account", labelLO: "ເປີດໃຊ້ບັນຊີ" }
    ),
  }),

  // Account activated confirmation.
  activate: ({ name = "", org = "Adeptio", link = "#" }) => ({
    subject: `${org}: Your account is active · ບັນຊີຂອງທ່ານພ້ອມໃຊ້ງານ`,
    ...wrap(
      "Account activated",
      "ບັນຊີເປີດໃຊ້ງານແລ້ວ",
      `Welcome aboard, ${name}. Your ${org} portal account is now active. You can sign in any time.`,
      `ຍິນດີຕ້ອນຮັບ ${name}. ບັນຊີ ${org} ຂອງທ່ານພ້ອມໃຊ້ງານແລ້ວ. ທ່ານສາມາດເຂົ້າສູ່ລະບົບໄດ້ທຸກເວລາ.`,
      { href: link, labelEN: "Open portal", labelLO: "ເປີດລະບົບ" }
    ),
  }),

  // Self-service password reset (local accounts).
  reset: ({ name = "", link = "#" }) => ({
    subject: `Reset your password · ຕັ້ງລະຫັດຜ່ານໃໝ່`,
    ...wrap(
      "Password reset",
      "ຕັ້ງລະຫັດຜ່ານໃໝ່",
      `Hello ${name}, we received a request to reset your password. This link is valid for 30 minutes. If you didn't ask for this, ignore this email.`,
      `ສະບາຍດີ ${name}, ມີຄຳຮ້ອງຂໍຕັ້ງລະຫັດຜ່ານໃໝ່. ລິ້ງນີ້ໃຊ້ໄດ້ 30 ນາທີ. ຖ້າທ່ານບໍ່ໄດ້ຮ້ອງຂໍ, ກະລຸນາລະເລີຍອີເມວນີ້.`,
      { href: link, labelEN: "Reset password", labelLO: "ຕັ້ງລະຫັດໃໝ່" }
    ),
  }),

  // NEW: credential mode flipped directory → local; user must set a local password.
  setPassword: ({ name = "", link = "#", reason = "" }) => ({
    subject: `Action needed: set a password · ກະລຸນາຕັ້ງລະຫັດຜ່ານ`,
    ...wrap(
      "Set a password for your account",
      "ກະລຸນາຕັ້ງລະຫັດຜ່ານໃຫ້ບັນຊີ",
      `Hello ${name}, your sign-in method changed to a local password${reason ? ` (${reason})` : ""}. Until you set one, only this link works. It expires in 72 hours.`,
      `ສະບາຍດີ ${name}, ວິທີເຂົ້າສູ່ລະບົບຂອງທ່ານໄດ້ປ່ຽນເປັນລະຫັດຜ່ານພາຍໃນ${reason ? ` (${reason})` : ""}. ກ່ອນທີ່ທ່ານຈະຕັ້ງລະຫັດ, ໃຊ້ໄດ້ສະເພາະລິ້ງນີ້. ໝົດອາຍຸໃນ 72 ຊົ່ວໂມງ.`,
      { href: link, labelEN: "Set password", labelLO: "ຕັ້ງລະຫັດຜ່ານ" }
    ),
  }),

  // NEW: import / sync result notice to HR or Sys Admin.
  syncImport: ({ kind = "sync", created = 0, linked = 0, suspended = 0, conflicts = 0, link = "#" }) => ({
    subject: `${kind === "import" ? "Import" : "Directory sync"} finished · ${kind === "import" ? "ນຳເຂົ້າ" : "ຊິ້ງໄດເຣັກທໍຣີ"}ສຳເລັດ`,
    ...wrap(
      `${kind === "import" ? "Import" : "Directory sync"} finished`,
      `${kind === "import" ? "ການນຳເຂົ້າ" : "ການຊິ້ງໄດເຣັກທໍຣີ"}ສຳເລັດແລ້ວ`,
      `Created ${created}, linked ${linked}, suspended ${suspended}. ${conflicts} item(s) need review.`,
      `ສ້າງໃໝ່ ${created}, ເຊື່ອມໂຍງ ${linked}, ໂຈະ ${suspended}. ມີ ${conflicts} ລາຍການທີ່ຕ້ອງກວດສອບ.`,
      { href: link, labelEN: "Open review queue", labelLO: "ເປີດຄິວກວດສອບ" }
    ),
  }),
};
