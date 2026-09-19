import { timingSafeEqual } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { processOutbox } from "@/lib/notify";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  const actual = request.headers.get("authorization") ?? "";
  const cron = !!expected && Buffer.byteLength(expected) === Buffer.byteLength(actual) && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  if (!cron && (await currentUser())?.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json(await processOutbox(25));
}
export const GET = POST;
