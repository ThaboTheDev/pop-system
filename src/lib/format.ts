const money = new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR", minimumFractionDigits: 2,
});

export const formatMoney = (v: number | string | null | undefined) =>
  money.format(Number(v ?? 0));

export const formatDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "2-digit" }) : "\u2014";

export const formatDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-ZA", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "\u2014";

export const formatNumber = (v: number | null | undefined) =>
  new Intl.NumberFormat("en-ZA").format(Number(v ?? 0));

export const humanise = (v: string | null | undefined) =>
  (v ?? "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const PAYMENT_OPTION_LABELS: Record<string, string> = {
  once_off: "Once-off (discounted)",
  monthly: "Monthly (original price)",
  single: "Single programme fee",
};

export const describePaymentOption = (option: string | null | undefined, quoted?: number | string | null) => {
  const label = PAYMENT_OPTION_LABELS[option ?? ""] ?? "Programme fee";
  return quoted == null || quoted === "" ? label : `${label} · ${formatMoney(quoted)}`;
};

export const fileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};
