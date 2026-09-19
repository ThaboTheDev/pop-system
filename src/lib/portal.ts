import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
const COOKIE = "pop_portal";
function secret() {
  const key = process.env.PORTAL_SECRET;
  if (!key || key.length < 32) throw new Error("PORTAL_SECRET must contain at least 32 characters");
  return key;
}
export const portalHash = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");
export function safeEqual(a: string, b: string) {
  return Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export async function createPortalSession(id: string) {
  const body = Buffer.from(JSON.stringify({ id, exp: Date.now() + 7 * 86400_000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${body}.${portalHash(body)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400 });
}
export async function portalParticipant(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const [body, signature, extra] = raw.split(".");
    if (extra || !body || !signature || !safeEqual(portalHash(body), signature)) return null;
    const { id, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) && typeof exp === "number" && exp > Date.now() ? id : null;
  } catch { return null; }
}
export async function clearPortalSession() { (await cookies()).delete(COOKIE); }
