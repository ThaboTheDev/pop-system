"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Thin progress bar pinned to the top of the viewport during client-side
 *  navigations. Tab switches that hit the network show motion within a frame
 *  of the click; instant (cached) switches finish before the bar is noticed.
 *
 *  How it works: any click on an internal link sets the pending state, and the
 *  state clears when the pathname or search params actually change. A timeout
 *  clears it as a backstop so a failed navigation never leaves the bar stuck. */
function ProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, setPending] = useState(false);

  // Navigation landed: hide the bar.
  useEffect(() => {
    setPending(false);
  }, [pathname, search]);

  // Navigation started: show the bar on internal-link clicks.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const target = anchor.getAttribute("target");
      if (target && target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let destination: URL;
      try { destination = new URL(href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin) return;
      // Hash-only and current-page links never change pathname/searchParams.
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      setPending(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // Backstop: never leave the bar visible for more than 10 s.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(false), 10_000);
    return () => clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return <div className="nav-progress" role="progressbar" aria-label="Loading page" />;
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressInner />
    </Suspense>
  );
}
