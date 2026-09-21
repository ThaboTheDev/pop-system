import { redirect } from "next/navigation";
// Six-digit codes and custom sessions have been retired.
export default function LegacyPortalVerify() { redirect("/portal/login"); }
