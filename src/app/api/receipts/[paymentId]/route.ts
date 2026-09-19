import { documentAccess, pdfResponse } from "@/lib/pdf";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const access = await documentAccess(); if (!access) return new Response("Unauthorized", { status: 401 });
  const { paymentId } = await params;
  let query = access.sb.from("payments").select("*,participants(full_name,participant_ref)").eq("id", paymentId).eq("status", "verified");
  if (access.participantId) query = query.eq("participant_id", access.participantId);
  const { data: p } = await query.maybeSingle(); if (!p) return new Response("Not found", { status: 404 });
  return pdfResponse("Payment receipt", [p.payment_ref, `${p.participants.full_name} (${p.participants.participant_ref})`, `Payment date: ${p.payment_date}`, `Amount: R ${Number(p.amount).toFixed(2)}`, `Reference: ${p.reference ?? ""}`, `Verified: ${p.verified_at}`], `receipt-${p.payment_ref}`, access.user?.id ?? null, p.participant_id);
}
