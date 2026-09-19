import Link from "next/link";

/** Page heading in the institute's house style: a small gold rule and
 *  uppercase label above a navy title, with the screen's actions set to the
 *  right. Every admin page uses this so headings line up and the eyebrow
 *  labels stay consistent across the system. */
export function PageHead({
  eyebrow,
  title,
  sub,
  back,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {back ? (
          <Link className="back-link" href={back.href}>
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </div>
  );
}
