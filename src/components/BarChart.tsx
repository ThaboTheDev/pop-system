import { humanise, formatNumber } from "@/lib/format";

/** Deliberately plain: a labelled proportion read left to right. A donut would
 *  make the same six numbers harder to compare. */
export function BarChart({
  data, total, formatValue,
}: {
  data: { key: string; value: number }[];
  total?: number;
  formatValue?: (v: number) => string;
}) {
  const sum = total ?? data.reduce((a, d) => a + d.value, 0);
  if (!sum) return <p className="faint">Nothing recorded yet.</p>;
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.key}>
          <span>{humanise(d.key)}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max(1, (d.value / sum) * 100)}%` }} />
          </span>
          <span className="right">{formatValue ? formatValue(d.value) : formatNumber(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
