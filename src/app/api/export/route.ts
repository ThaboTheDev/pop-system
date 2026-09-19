import { currentUser, canExport } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const CHUNK = 1000;
const MAX_ROWS = 100_000;

/** Guards against CSV formula injection when the file is opened in Excel. */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const escaped = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${escaped.replace(/"/g, '""')}"`;
}

/** Streams the filtered result set in pages rather than building the whole
 *  file in memory, so an export of every payment does not exhaust the
 *  server's heap. */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!canExport(user)) return new Response("Your role cannot export records", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const type = sp.get("type") ?? "payments";
  const sb = await supabaseServer();

  const operations: Record<string, string> = { arrears: "arrears_report", throughput: "admin_throughput", duplicates: "duplicate_report" };
  if (Object.hasOwn(operations, type)) {
    const { data, error } = await sb.rpc(operations[type]);
    if (error) return new Response("Report failed", { status: 500 });
    const rows = (data ?? []) as Record<string, unknown>[];
    const head = Object.keys(rows[0] ?? {});
    logAudit(user, "report.exported", "report", type, `Exported ${type} report`);
    return csvResponse([head.join(","), ...rows.map(r => head.map(h => cell(r[h])).join(","))].join("\r\n"), type);
  }
  if (type === "programme") {
    const { data } = await sb.rpc("programme_report", {
      p_from: sp.get("from"), p_to: sp.get("to"),
    });
    const rows = (data ?? []) as Record<string, unknown>[];
    const head = ["programme", "code", "participants", "pops_submitted",
                  "verified_payments", "pending_payments", "total_verified", "outstanding"];
    const csv = [head.join(","), ...rows.map((r) => head.map((h) => cell(r[h])).join(","))].join("\r\n");
    logAudit(user, "report.exported", "report", "programme", "Exported programme report");
    return csvResponse(csv, "programme-report");
  }

  const isParticipants = type === "participants";
  const header = isParticipants
    ? ["participant_ref", "full_name", "email", "mobile", "programme", "cohort",
       "registration_date", "amount_due", "amount_paid", "outstanding",
       "pop_count", "payment_status", "last_payment_date"]
    : ["payment_ref", "participant_ref", "participant_name", "programme", "amount",
       "payment_date", "reference", "method", "bank", "status", "duplicate_flag",
       "submitted_at", "verified_at", "rejection_reason"];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`${header.join(",")}\r\n`));
      let offset = 0;
      let written = 0;

      while (written < MAX_ROWS) {
        let q = isParticipants
          ? sb.from("participants").select(
              "participant_ref, full_name, email, mobile, registration_date, amount_due, amount_paid, outstanding, pop_count, payment_status, last_payment_date, programmes(name), cohorts(name)")
          : sb.from("payments").select(
              "payment_ref, amount, payment_date, reference, method, bank, status, duplicate_flag, submitted_at, verified_at, rejection_reason, participants(participant_ref, full_name), programmes(name)");

        // The same filters the screen used, so an export matches what was seen.
        if (isParticipants) {
          if (sp.get("programme")) q = q.eq("programme_id", sp.get("programme")!);
          if (sp.get("status")) q = q.eq("payment_status", sp.get("status")!);
          q = q.order("participant_ref", { ascending: true });
        } else {
          if (sp.get("programme")) q = q.eq("programme_id", sp.get("programme")!);
          if (sp.get("status")) q = q.eq("status", sp.get("status")!);
          if (sp.get("from")) q = q.gte("payment_date", sp.get("from")!);
          if (sp.get("to")) q = q.lte("payment_date", sp.get("to")!);
          q = q.order("submitted_at", { ascending: true });
        }

        const { data, error } = await q.range(offset, offset + CHUNK - 1);
        if (error || !data?.length) break;

        for (const r of data as Record<string, unknown>[]) {
          const person = r.participants as { participant_ref?: string; full_name?: string } | null;
          const prog = (r.programmes as { name?: string } | null)?.name ?? "";
          const cohort = (r.cohorts as { name?: string } | null)?.name ?? "";
          const line = isParticipants
            ? [r.participant_ref, r.full_name, r.email, r.mobile, prog, cohort,
               r.registration_date, r.amount_due, r.amount_paid, r.outstanding,
               r.pop_count, r.payment_status, r.last_payment_date]
            : [r.payment_ref, person?.participant_ref, person?.full_name, prog, r.amount,
               r.payment_date, r.reference, r.method, r.bank, r.status, r.duplicate_flag,
               r.submitted_at, r.verified_at, r.rejection_reason];
          controller.enqueue(encoder.encode(`${line.map(cell).join(",")}\r\n`));
          written += 1;
        }

        if (data.length < CHUNK) break;
        offset += CHUNK;
      }

      controller.close();
    },
  });

  logAudit(user, "records.exported", type, null,
    `Exported ${type} with filters ${sp.toString() || "none"}`);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvResponse(csv: string, name: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
