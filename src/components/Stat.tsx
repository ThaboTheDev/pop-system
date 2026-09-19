export function Stat({
  label, value, foot, variant,
}: {
  label: string;
  value: string | number;
  foot?: string;
  variant?: "flag" | "alert";
}) {
  const long = String(value).length > 11;
  return (
    <div className={`stat${variant ? ` ${variant}` : ""}`}>
      <div className="label">{label}</div>
      <div className={`value${long ? " sm" : ""}`}>{value}</div>
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  );
}
