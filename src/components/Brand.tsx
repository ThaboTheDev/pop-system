/** The institute's crest, used at three sizes: the sidebar, the sign-in panel
 *  and the participant portal. It is a plain <img> rather than next/image:
 *  the file is a small local asset that is already the right size, so the
 *  optimiser would add a round trip and a build-time dependency for nothing.
 *  width/height are set to reserve the space and avoid layout shift. */
export function Crest({
  size = 46,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src="/branding/msri-logo.png"
      alt="Mzuvukile Slabbert Radebe Institute"
      width={size}
      height={size}
    />
  );
}

/** Sidebar lockup: crest on its white plate, product name, institution name. */
export function BrandMark() {
  return (
    <div className="mark">
      <Crest className="brand-logo" size={46} />
      <div>
        <strong>Payments and PoP</strong>
        <span>MSR Learning Institute</span>
      </div>
    </div>
  );
}
