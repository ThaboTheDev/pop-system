import { PDFDocument, StandardFonts } from "pdf-lib";
import { currentUser } from "@/lib/auth";
import { portalParticipant } from "@/lib/portal";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
export async function documentAccess() {
  const user = await currentUser();
  if (user) return { sb: await supabaseServer(), user, participantId: null };
  const participantId = await portalParticipant();
  return participantId ? { sb: supabaseAdmin(), user: null, participantId } : null;
}
export async function pdfResponse(title: string, lines: string[], name: string, actorId: string | null, entityId: string) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage(); let y = 790;
  const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, " ");
  for (const line of [process.env.ORG_NAME ?? "Payments and PoP", title, "", ...lines]) {
    // Wrap long fields and keep the standard font's encoding safe.
    const text = clean(line);
    for (let i = 0; i < Math.max(1, text.length); i += 88) {
      if (y < 50) { page = pdf.addPage(); y = 790; }
      page.drawText(text.slice(i, i + 88), { x: 40, y, size: 10, font }); y -= 17;
    }
  }
  const { error } = await supabaseAdmin().from("audit_logs").insert({ actor_id: actorId, action: "document.downloaded", entity_type: "participant", entity_id: entityId, summary: title });
  if (error) throw new Error("Could not audit document download");
  return new Response(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
}
