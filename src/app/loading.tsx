/** Shown while a server-rendered page is streaming in. A skeleton shaped like
 *  the admin content (heading, stat cards, table) so tab switches feel instant:
 *  layout holds its shape and only the figures fill in. Pure CSS, no JS, so it
 *  paints on the first streamed byte. */
export default function Loading() {
  return (
    <div aria-live="polite" aria-busy="true" aria-label="Loading page">
      <div className="page-head">
        <div>
          <div className="skel skel-title" />
          <div className="skel skel-line" style={{ width: 280, marginTop: 8 }} />
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div className="stat" key={i} aria-hidden="true">
            <div className="skel skel-line" style={{ width: "55%" }} />
            <div className="skel skel-value" />
          </div>
        ))}
      </div>
      <div className="card card-flush" aria-hidden="true">
        <div style={{ padding: "14px 16px 12px" }}>
          <div className="skel skel-line" style={{ width: 180 }} />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="skel-row" key={i}>
            <div className="skel skel-line" style={{ width: "22%" }} />
            <div className="skel skel-line" style={{ width: "34%" }} />
            <div className="skel skel-line" style={{ width: "16%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
