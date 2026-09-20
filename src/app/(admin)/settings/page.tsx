import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDateTime, formatNumber, humanise } from "@/lib/format";
import { PageHead } from "@/components/PageHead";
import { processNow, requeue } from "./actions";

export const dynamic = "force-dynamic";

/** Outbox states, in the order an operator thinks about them: what is waiting,
 *  what is in flight, what has gone, and what needs a decision. */
const OUTBOX_STATES = ["queued", "processing", "sent", "failed", "skipped"] as const;

export default async function SettingsPage() {
  const user = await requireUser();
  const sb = await supabaseServer();

  const counts = await Promise.all(
    OUTBOX_STATES.map(async (state) => {
      const { count } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("state", state);
      return { state, count: count ?? 0 };
    }),
  );

  const { data: last } = await sb
    .from("notifications")
    .select("sent_at")
    .eq("state", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
  const isSuper = user.role === "super_admin";
  const stuck = counts.find((c) => c.state === "failed")?.count ?? 0;

  return (
    <>
      <PageHead
        eyebrow="Administration"
        title="Settings"
        sub="Your account and how this installation is configured."
      />

      <div className="grid grid-2">
        <div className="card">
          <h2>Your account</h2>
          <dl className="facts">
            <div><dt>Name</dt><dd>{user.full_name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Role</dt><dd>{humanise(user.role)}</dd></div>
          </dl>
          <p className="faint" style={{ marginTop: 14, marginBottom: 0 }}>
            <a href="/submit">Public submission form</a> · <a href="/portal">Participant portal</a>
          </p>
        </div>

        <div className="card">
          <h2>Notification delivery</h2>
          <dl className="facts">
            <div>
              <dt>Provider</dt>
              <dd>
                <span className={`badge ${emailConfigured ? "badge-ok" : "badge-idle"}`}>
                  {emailConfigured ? "Resend" : "Not configured"}
                </span>
              </dd>
            </div>
            <div><dt>Channels</dt><dd>Email only</dd></div>
            <div><dt>Last sent</dt><dd>{last?.sent_at ? formatDateTime(last.sent_at) : "Never"}</dd></div>
          </dl>
          <p className="faint" style={{ marginTop: 14, marginBottom: 0 }}>
            Emails are queued in the database when a payment is submitted or decided,
            then delivered by the scheduled worker. Nothing else leaves the system.
          </p>
        </div>

        <div className="card card-flush">
          <h2>Notification outbox</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>State</th><th>Meaning</th><th className="num">Messages</th></tr>
              </thead>
              <tbody>
                {counts.map(({ state, count }) => (
                  <tr key={state}>
                    <td><span className={`badge ${state === "sent" ? "badge-ok" : state === "failed" || state === "skipped" ? "badge-stop" : "badge-wait"}`}>{humanise(state)}</span></td>
                    <td className="faint">{OUTBOX_MEANING[state]}</td>
                    <td className="num">{formatNumber(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isSuper ? (
            <div style={{ padding: 16 }}>
              {stuck > 0 ? (
                <div className="notice notice-warn">
                  {formatNumber(stuck)} {stuck === 1 ? "message" : "messages"} failed or were
                  skipped. Check the provider error on the row before requeuing.
                </div>
              ) : null}
              <div className="btn-row">
                <form action={processNow}>
                  <button className="btn btn-primary">Process now, up to 25</button>
                </form>
                <form action={requeue}>
                  <button className="btn">Requeue failed and skipped</button>
                </form>
              </div>
              <p className="faint" style={{ marginTop: 10, marginBottom: 0 }}>
                Requeuing retries failed and skipped emails only. Rows left in
                processing after a worker crash need investigating first.
              </p>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2>Document storage</h2>
          <dl className="facts">
            <div><dt>Bucket</dt><dd>{process.env.POP_BUCKET ?? "proof-of-payment"}</dd></div>
            <div><dt>Visibility</dt><dd>Private, signed links only</dd></div>
            <div><dt>Accepted types</dt><dd>PDF, JPG, PNG</dd></div>
            <div><dt>Size limit</dt><dd>10 MB per document</dd></div>
            <div><dt>Link validity</dt><dd>{process.env.POP_SIGNED_URL_TTL ?? 5} minutes</dd></div>
          </dl>
        </div>

        <div className="card">
          <h2>Sign-in and access control</h2>
          <p>
            Administrators sign in with their work email and password. There is
            no second factor: the authenticator step was removed from both the
            sign-in form and the server-side check together, rather than left
            to challenge nothing.
          </p>
          <p className="faint" style={{ marginBottom: 0 }}>
            What stands in its place: row level security on every table, role
            checks inside the SQL functions, an append-only audit log, and
            server-only secrets. The trade-off, and how the second factor could
            be restored, is written down in README §7.
          </p>
        </div>
      </div>
    </>
  );
}

/** One line per outbox state, so the table explains itself to an operator. */
const OUTBOX_MEANING: Record<(typeof OUTBOX_STATES)[number], string> = {
  queued: "Waiting for the worker to pick it up",
  processing: "Claimed by a worker, not yet confirmed",
  sent: "Accepted by the provider",
  failed: "Provider returned an error, safe to requeue",
  skipped: "Deliberately not sent, safe to requeue",
};
