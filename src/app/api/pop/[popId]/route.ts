import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/** The only route to a stored document.
 *  Nothing is served from a public URL: the request is authenticated, the
 *  administrator's read is checked against RLS, and the file is then streamed
 *  through a short-lived signed link that is never handed to the browser. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ popId: string }> },
) {
  const user = await currentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { popId } = await params;
  const sb = await supabaseServer();

  // Selecting through the user's own session means row level security decides
  // whether this administrator may see this participant's document at all.
  const { data: pop } = await sb
    .from("pops")
    .select("storage_path, file_name, mime_type, payment_id")
    .eq("id", popId)
    .maybeSingle();

  if (!pop) return new NextResponse("Not found", { status: 404 });

  const ttl = Number(process.env.POP_SIGNED_URL_TTL ?? 5) * 60;
  const { data: signed, error } = await supabaseAdmin()
    .storage.from(process.env.POP_BUCKET ?? "proof-of-payment")
    .createSignedUrl(pop.storage_path, ttl);

  if (error || !signed) return new NextResponse("The document could not be opened", { status: 500 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  await logAudit(user, download ? "pop.downloaded" : "pop.streamed", "payment",
    pop.payment_id, `${download ? "Downloaded" : "Viewed"} ${pop.file_name}`);

  const file = await fetch(signed.signedUrl);
  if (!file.ok || !file.body) return new NextResponse("The document could not be read", { status: 502 });

  return new NextResponse(file.body, {
    headers: {
      "Content-Type": pop.mime_type,
      "Content-Disposition":
        `${download ? "attachment" : "inline"}; filename="${pop.file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
