import { promises as dns } from "node:dns";

const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
const DISPOSABLE = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
]);

function isCompleteEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || value.split("@").length !== 2) return false;
  if (/[*#\[\]{}<>\s]/.test(value)) return false;
  if (value.includes("..") || !EMAIL_RE.test(value)) return false;
  const [local] = value.split("@");
  if (!local || local.startsWith(".") || local.endsWith(".")) return false;
  return true;
}

function checkSyntax(email) {
  return isCompleteEmail(email);
}

async function verifyEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value) {
    return { syntax: false, domain: false, mx: false, risk: "missing", valid: false, checkedAt: new Date() };
  }
  const syntax = checkSyntax(value);
  if (!syntax) {
    return { syntax: false, domain: false, mx: false, risk: "invalid", valid: false, checkedAt: new Date() };
  }
  const domain = value.split("@")[1];
  let mx = false;
  try {
    const records = await dns.resolveMx(domain);
    mx = Array.isArray(records) && records.length > 0;
  } catch {
    mx = false;
  }
  const risk = DISPOSABLE.has(domain) ? "high" : mx ? "low" : "medium";
  return {
    syntax: true,
    domain: Boolean(domain),
    mx,
    risk,
    valid: syntax && mx && risk !== "high",
    checkedAt: new Date(),
  };
}

export { verifyEmail, checkSyntax, isCompleteEmail };
