"use client";

import { useEffect } from "react";

/** User-facing error boundary shown when a Server Component throws on render
 *  (for example a transient Supabase blip). Without this Next renders a
 *  blank 500 page with no recovery affordance. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Page error", error);
  }, [error]);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="card">
          <p className="eyebrow">MSR Learning Institute</p>
          <h1>Something went wrong</h1>
          <p className="muted">
            The page could not be loaded. This is usually a temporary problem.
          </p>
          <div className="btn-row">
            <button className="btn btn-gold" onClick={() => reset()}>Try again</button>
            <a className="btn" href="/dashboard">Return to dashboard</a>
          </div>
        </div>
      </div>
    </div>
  );
}
