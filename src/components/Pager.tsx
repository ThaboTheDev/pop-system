import Link from "next/link";
import { formatNumber } from "@/lib/format";

/** Page links are plain hrefs so paging works without client JavaScript and
 *  every page is linkable and bookmarkable. */
export function Pager({
  page, pageSize, total, basePath, params,
}: {
  page: number; pageSize: number; total: number;
  basePath: string; params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pager">
      <span>
        {formatNumber(from)} to {formatNumber(to)} of {formatNumber(total)}
      </span>
      <span className="btn-row">
        {page > 1 ? <Link className="btn btn-sm" href={link(1)}>First</Link> : null}
        {page > 1 ? <Link className="btn btn-sm" href={link(page - 1)}>Previous</Link> : null}
        <span className="btn btn-sm" aria-current="page">Page {formatNumber(page)} of {formatNumber(pages)}</span>
        {page < pages ? <Link className="btn btn-sm" href={link(page + 1)}>Next</Link> : null}
        {page < pages ? <Link className="btn btn-sm" href={link(pages)}>Last</Link> : null}
      </span>
    </div>
  );
}
