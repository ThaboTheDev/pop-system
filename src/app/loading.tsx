/** Shown while a server-rendered page is streaming in. Without this, slow
 *  queries make the browser look frozen. Keep it tiny so it paints instantly. */
export default function Loading() {
  return (
    <div style={{ padding: 40 }} aria-live="polite" aria-busy="true">
      <div className="card">
        <p className="faint" style={{ margin: 0 }}>Loading…</p>
      </div>
    </div>
  );
}
