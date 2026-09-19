import { documentAccess, pdfResponse } from "@/lib/pdf";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  const access = await documentAccess(); if (!access) return new Response("Unauthorized", { status: 401 });
  const { participantId } = await params;
  if (access.participantId && access.participantId !== participantId) return new Response("Not found", { status: 404 });
  const { data: p } = await access.sb.from("participants").select("*").eq("id", participantId).maybeSingle();
  if (!p) return new Response("Not found", { status: 404 });
  const { data: payments, count, error } = await access.sb.from("payments").select("payment_ref,payment_date,amount,status", { count: "exact" }).eq("participant_id", participantId).order("payment_date", { ascending: false }).order("id").limit(40);
  if (error) throw new Error("Could not load statement");
  return pdfResponse("Account statement", [`${p.full_name} (${p.participant_ref})`, `Generated: ${new Date().toISOString()}`, `Due: R ${p.amount_due}; paid (including approved adjustments): R ${p.amount_paid}`, `Outstanding: R ${p.outstanding}`, "Only verified payments and approved adjustments reduce outstanding.", "", ...(payments ?? []).map((r: { payment_date: string; payment_ref: string; amount: number; status: string }) => `${r.payment_date} ${r.payment_ref} R ${Number(r.amount).toFixed(2)} ${r.status}`), ...(count && count > 40 ? ["Truncated: only the latest 40 payments are shown."] : [])], `statement-${p.participant_ref}`, access.user?.id ?? null, participantId);
}
