import { humanise } from "@/lib/format";
import type { ParticipantStatus, PaymentStatus } from "@/lib/types";

const tone: Record<string, string> = {
  verified: "badge-ok",
  approved: "badge-ok",
  pending: "badge-wait",
  declined: "badge-stop",
  fully_paid: "badge-ok",
  pending_review: "badge-wait",
  under_review: "badge-note",
  verification_pending: "badge-wait",
  partially_paid: "badge-note",
  requires_clarification: "badge-wait",
  rejected: "badge-stop",
  payment_issue: "badge-stop",
  duplicate: "badge-dupe",
  not_paid: "badge-idle",
  refund_adjustment: "badge-idle",
};

export function StatusBadge({ status }: { status: PaymentStatus | ParticipantStatus | string }) {
  return <span className={`badge ${tone[status] ?? "badge-idle"}`}>{humanise(status)}</span>;
}

export function DuplicateBadge({ reason }: { reason?: string | null }) {
  return (
    <span className="badge badge-dupe" title={reason ?? undefined}>
      Duplicate, review required
    </span>
  );
}
