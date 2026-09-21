import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { scheduleOutbox } from "@/lib/notify";
import { PRIVACY_NOTICE_VERSION, type RegistrationProgramme } from "@/lib/types";

export type ApplicationResult = { ok?: boolean; alreadyApplied?: boolean; error?: string };

export async function registrationProgrammes(): Promise<RegistrationProgramme[] | null> {
  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.rpc("registration_programmes");
    if (error) return null;
    return (data ?? []).map((row: RegistrationProgramme) => ({
      code: row.code,
      name: row.name,
      amount_due: Number(row.amount_due),
      once_off_amount: row.once_off_amount == null ? null : Number(row.once_off_amount),
      pricing_model: row.pricing_model === "dual" ? "dual" : "single",
    }));
  } catch { return null; }
}

/** Both entry points call the same database function. The runner action guards
 * its caller separately; the RPC also checks auth.uid() and role itself. */
export async function submitApplication(form: FormData, inPerson: boolean): Promise<ApplicationResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!rateLimit(`application:${ip}`, inPerson ? 30 : 5, 60_000).allowed)
    return { error: "Too many attempts. Please wait a minute and try again." };
  if (form.get("consent") !== "on") return { error: "Consent to the privacy notice is required." };
  if (form.get("notice_version") !== PRIVACY_NOTICE_VERSION)
    return { error: "The privacy notice has changed. Refresh this page and read it before applying." };

  const option = String(form.get("payment_option") ?? "").trim();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("submit_application", {
    p_first_name: String(form.get("first_name") ?? "").trim(),
    p_surname: String(form.get("surname") ?? "").trim(),
    p_email: String(form.get("email") ?? "").trim().toLowerCase(),
    p_mobile: String(form.get("mobile") ?? "").trim(),
    p_programme_code: String(form.get("programme_code") ?? ""),
    p_consent: true,
    p_notice_version: PRIVACY_NOTICE_VERSION,
    p_in_person: inPerson,
    p_payment_option: option || null,
  });
  if (error) {
    const messages: Record<string, string> = {
      CONSENT_REQUIRED: "Consent to the privacy notice is required.",
      NOTICE_VERSION_REQUIRED: "Refresh the page to load the privacy notice.",
      INVALID_NAME: "Enter a first name and surname, each no longer than 100 characters.",
      INVALID_EMAIL: "Enter a valid email address. The decision will be sent there.",
      INVALID_MOBILE: "The mobile number is too long.",
      UNKNOWN_PROGRAMME: "That programme is not open for applications. Refresh and choose an available programme.",
      PAYMENT_OPTION_REQUIRED: "This programme has two prices. Choose once-off (discounted) or monthly (original price).",
      INVALID_PAYMENT_OPTION: "That payment option is not available on the selected programme.",
      FORBIDDEN: "Your account cannot capture applications. Sign in with your runner account.",
    };
    return { error: messages[error.message] ?? "The application could not be recorded. Please try again." };
  }
  scheduleOutbox();
  return { ok: true, alreadyApplied: !!data?.already_applied };
}
