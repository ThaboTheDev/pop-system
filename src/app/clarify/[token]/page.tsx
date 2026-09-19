import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tokenHash } from "@/lib/resubmit";
import { sha256, sniffMime, validateUpload } from "@/lib/upload";
import { Crest } from "@/components/Brand";

export const metadata = {
  title: "Resubmit proof of payment | MSR Learning Institute",
  robots: { index: false, follow: false },
};

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

/** One-time link from a clarification email. Participants land here without
 *  signing in, so the page carries the institute's name and nothing else. */
export default async function Clarify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data: t } = await supabaseAdmin().from("resubmit_tokens").select("id").eq("token_hash", tokenHash(token)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();

  if (!t) {
    return (
      <div className="portal">
        <header className="portal-head">
          <Crest className="brand-logo" size={58} />
          <div className="crest">MSR Learning Institute</div>
          <h1>This link has expired</h1>
          <p>The link can be used once, and only for a short time.</p>
        </header>
        <main className="portal-body">
          <div className="card">
            <p className="muted">
              Ask the finance office to send a new link, or open the participant
              portal to see the payment.
            </p>
            <a className="btn btn-gold" href="/portal">Open the participant portal</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Resubmit your proof of payment</h1>
        <p>
          Attach up to two PDF, JPG or PNG documents, at most 10 MB each. The
          finance office asked for a clearer copy.
        </p>
      </header>
      <main className="portal-body">
        <form action={upload.bind(null, token)} className="card">
          <div className="field">
            <label>Replacement documents</label>
            <div className="drop">
              <div>PDF, JPG or PNG, up to 10 MB each</div>
              <input type="file" name="proof" accept="application/pdf,image/jpeg,image/png" multiple required />
            </div>
          </div>
          <button className="btn btn-gold btn-lg" style={{ width: "100%" }}>
            Submit replacement documents
          </button>
          <p className="faint" style={{ marginTop: 12, marginBottom: 0 }}>
            This link works once. Your documents are stored privately.
          </p>
        </form>
      </main>
    </div>
  );
}
