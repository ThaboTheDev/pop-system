import { Crest } from "@/components/Brand";
import { verifyOTP } from "../actions";

export const metadata = {
  title: "Verify your email | MSR Learning Institute",
  robots: { index: false, follow: false },
};

export default async function Verify({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; invalid?: string }>;
}) {
  const p = await searchParams;

  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Verify your email</h1>
        <p>Enter the six-digit code we sent you. It expires shortly, and you have five attempts.</p>
      </header>
      <main className="portal-body">
        <form action={verifyOTP} className="card">
          {p.invalid ? (
            <div className="notice notice-error" role="alert">
              That code is invalid or has expired. Request a new one from the portal.
            </div>
          ) : null}
          <input type="hidden" name="id" value={p.id ?? ""} />
          <div className="field">
            <label htmlFor="code">Six-digit code</label>
            <input id="code" name="code" required pattern="[0-9]{6}" autoComplete="one-time-code"
                   inputMode="numeric" placeholder="000000" />
          </div>
          <button className="btn btn-gold btn-lg" style={{ width: "100%" }}>Verify</button>
        </form>
      </main>
    </div>
  );
}
