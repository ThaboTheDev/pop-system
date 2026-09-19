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
    <div style={{ maxWidth: 560, margin: "10vh auto", padding: 24 }}>
      <div className="card">
        <h1>Something went wrong</h1>
        <p>The page could not be loaded. This is usually a temporary problem.</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
          <a className="btn" href="/dashboard">Return to dashboard</a>
        </div>
      </div>
    </div>
  );
}
