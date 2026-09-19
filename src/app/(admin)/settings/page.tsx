import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatNumber, humanise } from "@/lib/format";

export const revalidate = 60;
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const sb = await supabaseServer();
  const { count: queued } = await sb
    .from("notifications").select("id", { count: "exact", head: true }).eq("state", "queued");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your account and how this installation is configured.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Your account</h2>
          <dl className="facts">
            <div><dt>Name</dt><dd>{user.full_name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Role</dt><dd>{humanise(user.role)}</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2>Notifications</h2>
          <p className="faint">
            Messages are written to an outbox rather than sent. Nothing leaves the system
            until a delivery service is connected, so no participant is contacted by accident.
          </p>
          <dl className="facts">
            <div><dt>Messages waiting</dt><dd>{formatNumber(queued ?? 0)}</dd></div>
            <div><dt>Delivery service</dt><dd>Not connected</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2>Document storage</h2>
          <dl className="facts">
            <div><dt>Bucket</dt><dd>{process.env.POP_BUCKET ?? "proof-of-payment"}</dd></div>
            <div><dt>Visibility</dt><dd>Private</dd></div>
            <div><dt>Accepted types</dt><dd>PDF, JPG, PNG</dd></div>
            <div><dt>Size limit</dt><dd>10 MB</dd></div>
            <div><dt>Link validity</dt><dd>{process.env.POP_SIGNED_URL_TTL ?? 5} minutes</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2>Participant submission link</h2>
          <p className="faint">Share this with participants. It needs no sign in.</p>
          <p style={{ marginBottom: 0 }}><code>/submit</code></p>
        </div>

        <div className="card">
          <h2>Account security</h2>
          <p className="faint">
            Super administrators should enable multi-factor authentication on their
            Supabase Auth account (TOTP). Password-only sign-in is not enough for
            a role that can verify payments and export every record.
          </p>
          {user.role === "super_admin" ? (
            <p className="faint" style={{ marginBottom: 0 }}>
              Turn MFA on in the Supabase dashboard under Authentication → Users
              for this email, or from the user&apos;s own Auth settings.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
