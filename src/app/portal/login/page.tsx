import Link from "next/link";
import { Crest } from "@/components/Brand";
import { PortalLoginForm } from "./PortalLoginForm";

export const metadata = { title: "Participant sign in | MSR Learning Institute", robots: { index: false, follow: false } };

export default async function PortalLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Participant sign in</h1>
        <p>See your record and payment history. We’ll email you a secure sign-in link.</p>
      </header>
      <main className="portal-body">
        {error ? <div className="notice notice-error" role="alert">That sign-in link could not be used. It may have expired, already been used, or been opened in another browser. Request a new link below.</div> : null}
        <PortalLoginForm />
        <p className="faint" style={{ marginTop: 16 }}>Not enrolled yet? <Link href="/register">Apply for a programme</Link>.</p>
        <p className="faint">Staff and runners: <Link href="/login">use staff sign in</Link>.</p>
      </main>
    </div>
  );
}
