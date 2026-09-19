export type UserRole = "super_admin" | "finance_admin" | "course_admin" | "viewer";

export type PaymentStatus =
  | "pending_review" | "under_review" | "verified"
  | "rejected" | "duplicate" | "requires_clarification";

export type ParticipantStatus =
  | "not_paid" | "partially_paid" | "fully_paid"
  | "verification_pending" | "payment_issue" | "refund_adjustment";

export type PaymentMethod =
  | "eft" | "cash_deposit" | "card" | "mobile_money" | "payroll_deduction" | "other";

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  programme_ids: string[];
  can_verify: boolean;
}

export interface Participant {
  id: string;
  participant_ref: string;
  first_name: string;
  surname: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  programme_id: string;
  cohort_id: string | null;
  registration_date: string;
  amount_due: number;
  amount_paid: number;
  outstanding: number;
  pop_count: number;
  payment_status: ParticipantStatus;
  last_payment_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  payment_ref: string;
  participant_id: string;
  programme_id: string;
  amount: number;
  payment_date: string;
  reference: string | null;
  method: PaymentMethod;
  bank: string | null;
  status: PaymentStatus;
  duplicate_flag: boolean;
  duplicate_reason: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  submitted_at: string;
}

export interface Pop {
  id: string;
  payment_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface DashboardStats {
  participants_total: number;
  pops_total: number;
  pops_pending: number;
  pops_verified: number;
  pops_rejected: number;
  pops_attention: number;
  amount_declared: number;
  amount_verified: number;
  received_today: number;
  received_month: number;
  submitted_today: number;
  participants_fully_paid: number;
  participants_outstanding: number;
  outstanding_total: number;
  status_breakdown: Record<string, number>;
  verification_breakdown: Record<string, number>;
  payments_over_time: { day: string; count: number; verified_amount: number | null }[];
  by_programme: { name: string; participants: number; paid: number; outstanding: number }[];
}

export const DECISIONS: { value: PaymentStatus; label: string }[] = [
  { value: "verified", label: "Verify payment" },
  { value: "rejected", label: "Reject payment" },
  { value: "duplicate", label: "Mark as duplicate" },
  { value: "requires_clarification", label: "Request clarification" },
  { value: "under_review", label: "Move to under review" },
];

export const REJECTION_REASONS = [
  "Incorrect amount",
  "Incorrect banking details",
  "Unclear document",
  "Duplicate submission",
  "Wrong participant",
  "Payment cannot be confirmed",
  "Missing information",
  "Other",
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "eft", label: "EFT / bank transfer" },
  { value: "cash_deposit", label: "Cash deposit" },
  { value: "card", label: "Card payment" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "payroll_deduction", label: "Payroll deduction" },
  { value: "other", label: "Other" },
];
