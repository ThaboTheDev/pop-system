"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Hit {
  participants: { id: string; participant_ref: string; full_name: string; programme: string; outstanding: number }[];
  payments: { id: string; payment_ref: string; reference: string | null; amount: number; full_name: string }[];
}

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }

    // Cancel a previous in-flight search so responses can't arrive out of order
    // and so every keystroke doesn't leave a dangling request to Supabase.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        if (!ctrl.signal.aborted && res.ok) setHits(await res.json());
      } catch {
        // AbortError is expected; network failures clear stale results.
        if (!ctrl.signal.aborted) setHits(null);
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setHits(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const nothing = hits && !hits.participants.length && !hits.payments.length;

  return (
    <div className="searchbox" ref={box}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search participant, ID, payment reference, phone, email"
        aria-label="Search participants and payments"
      />
      {hits ? (
        <div className="results">
          {busy ? <div className="group">Searching…</div> : null}
          {hits.participants.length ? <div className="group">Participants</div> : null}
          {hits.participants.map((p) => (
            <Link key={p.id} href={`/participants/${p.id}`} onClick={() => setHits(null)}>
              <div>{p.full_name}</div>
              <div className="meta">{p.participant_ref} · {p.programme}</div>
            </Link>
          ))}
          {hits.payments.length ? <div className="group">Payments</div> : null}
          {hits.payments.map((p) => (
            <Link key={p.id} href={`/verification/${p.id}`} onClick={() => setHits(null)}>
              <div>{p.payment_ref} · R{Number(p.amount).toFixed(2)}</div>
              <div className="meta">{p.full_name}{p.reference ? ` · ${p.reference}` : ""}</div>
            </Link>
          ))}
          {nothing ? <div className="group">No participant or payment matches that.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
