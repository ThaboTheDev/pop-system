import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { documentAccess } from "@/lib/pdf";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
// 10 MB PoPs plus headroom; Vercel Pro allows up to 100 MB response bodies.
export const maxDuration = 30;

/** The only route to a stored document.
 *  Nothing is served from a public URL: the request is authenticated, the
 *  staff member or participant's read is checked against RLS, and the file is then proxied
 *  from a short-lived signed URL that is never handed to the browser.
 *
 *  We forward the upstream response body directly (no buffering, no cloning)
 *  so a 10 MB PDF doesn't sit in the lambda's heap twice. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ popId: string }> },
) {
  const access = await documentAccess();
  if (!access) return new NextResponse("Not signed in", { status: 401 });

  const { popId } = await params;
  const { sb, user } = access;

  const { data: pop } = await sb
    .from("pops")
    .select("storage_path, file_name, mime_type, payment_id")
    .eq("id", popId)
    .maybeSingle();

  if (!pop) return new NextResponse("Not found", { status: 404 });

  // Pop is guaranteed non-null here; bind to a const for strict TS.
  const doc = pop;

  const ttl = Number(process.env.POP_SIGNED_URL_TTL ?? 5) * 60;
  const { data: signed, error } = await supabaseAdmin()
    .storage.from(process.env.POP_BUCKET ?? "proof-of-payment")
    .createSignedUrl(doc.storage_path, ttl);

  if (error || !signed) return new NextResponse("The document could not be opened", { status: 500 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  if (user) logAudit(user, download ? "pop.downloaded" : "pop.streamed", "payment",
    doc.payment_id, `${download ? "Downloaded" : "Viewed"} ${doc.file_name}`);

  const upstream = await fetch(signed.signedUrl, {
    signal: request.signal,
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("The document could not be read", { status: 502 });
  }

  const safeName = String(doc.file_name).replace(/"/g, "").replace(/[\r\n]/g, "");
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition":
        `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
