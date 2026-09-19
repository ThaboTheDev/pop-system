import { formatMoney } from "@/lib/format";

/** Thirty-day verified receipts. Inline SVG: no chart dependency, no client
 *  JavaScript, and it prints. */
export function TrendChart({ data }: { data: { day: string; verified_amount: number | null }[] }) {
  if (!data.length) return <p className="faint">No payments recorded in the last 30 days.</p>;
  const values = data.map((d) => Number(d.verified_amount ?? 0));
  const peak = Math.max(...values, 1);
  const w = 100 / data.length;

  return (
    <>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img"
           aria-label="Verified payments received per day over the last 30 days"
           style={{ width: "100%", height: 132, display: "block" }}>
        {values.map((v, i) => {
          const h = (v / peak) * 30;
          return (
            <rect key={i} x={i * w + w * 0.15} y={31 - h} width={w * 0.7} height={Math.max(h, 0.35)}
                  fill="var(--brand)" opacity={0.85}>
              <title>{`${data[i].day}: ${formatMoney(v)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="faint" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>{data[0].day}</span>
        <span>Peak day {formatMoney(peak)}</span>
        <span>{data[data.length - 1].day}</span>
      </div>
    </>
  );
}
