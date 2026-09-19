import Link from "next/link";

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="login-card card">
        <p className="eyebrow">Not found</p>
        <h1>That record does not exist</h1>
        <p className="muted">
          It may have been removed, or the link may be incomplete.
        </p>
        <Link className="btn btn-gold" href="/dashboard">Back to the dashboard</Link>
      </div>
    </div>
  );
}
