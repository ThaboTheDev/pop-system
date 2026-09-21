import { timingSafeEqual } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { processOutbox } from "@/lib/notify";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Leave 15 s of the 60 s function limit for the final batch's sends to settle.
const BUDGET_MS = 45_000;
const BATCH = 100;
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  const actual = request.headers.get("authorization") ?? "";
  const cron = !!expected && Buffer.byteLength(expected) === Buffer.byteLength(actual) && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  if (!cron && (await currentUser())?.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  // Daily 05:00 UTC sweep. Application/payment notices are also scheduled
  // after their triggering requests. Supabase Auth sends portal links outside
  // this outbox. Here we drain whatever is left — batches of
  // BATCH until the queue is empty or the time budget is spent. Anything
  // remaining stays queued for tomorrow's run; nothing is silently dropped.
  const startedAt = Date.now();
  const totals = { sent: 0, failed: 0, skipped: 0, batches: 0 };
  while (Date.now() - startedAt < BUDGET_MS) {
    const batch = await processOutbox(BATCH);
    totals.sent += batch.sent;
    totals.failed += batch.failed;
    totals.skipped += batch.skipped;
    totals.batches += 1;
    if (batch.sent + batch.failed + batch.skipped < BATCH) break;
  }
  return Response.json(totals);
}
export const GET = POST;
