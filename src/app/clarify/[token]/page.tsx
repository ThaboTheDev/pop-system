import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tokenHash } from "@/lib/resubmit";
import { sha256, sniffMime, validateUpload } from "@/lib/upload";
async function upload(token: string, form: FormData) {
  "use server";
  const files = form.getAll("proof").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length || files.length > 2) throw new Error("Attach one or two documents");
  const documents = await Promise.all(files.map(async f => {
    const bytes = new Uint8Array(await f.arrayBuffer()); const invalid = validateUpload(f, bytes);
    if (invalid) throw new Error(invalid);
    return { bytes, mime: sniffMime(bytes)!, size: f.size, hash: sha256(bytes), name: "Replacement proof", path: `resubmissions/${crypto.randomUUID()}` };
  }));
  const sb = supabaseAdmin();
  const { data: t } = await sb.from("resubmit_tokens").select("id").eq("token_hash", tokenHash(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!t) throw new Error("Link is invalid or expired");
  const stored: string[] = []; const bucket = sb.storage.from(process.env.POP_BUCKET ?? "proof-of-payment");
  try {
    for (const d of documents) {
      const { error } = await bucket.upload(d.path, d.bytes, { contentType: d.mime });
      if (error) throw new Error("Upload failed"); stored.push(d.path);
    }
    const { error } = await sb.rpc("finish_resubmit", { p_token_hash: tokenHash(token), p_documents: documents.map(({ bytes: _bytes, ...d }) => d) });
    if (error) throw new Error("Link expired, already used, or payment no longer needs clarification");
  } catch (e) { if (stored.length) await bucket.remove(stored); throw e; }
  redirect("/portal?resubmitted=1");
}
export default async function Clarify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data: t } = await supabaseAdmin().from("resubmit_tokens").select("id").eq("token_hash", tokenHash(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!t) return <main className="content"><h1>Link expired or already used</h1><a href="/portal">Request access to your portal</a></main>;
  return <main className="content"><h1>Resubmit payment proof</h1><p>Attach up to two PDF, JPG or PNG documents, at most 10 MB each.</p><form action={upload.bind(null, token)}><input type="file" name="proof" accept="application/pdf,image/jpeg,image/png" multiple required /><button className="btn btn-primary">Submit replacement documents</button></form></main>;
}
