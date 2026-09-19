"use server";

import { requireRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface ImportRow {
  line: number;
  participant_ref?: string;
  first_name: string;
  surname: string;
  email: string;
  mobile: string;
  programme_code: string;
  cohort_code?: string;
  amount_due: number;
}

export interface ImportReport {
  detected: number;
  valid: ImportRow[];
  invalid: { line: number; raw: string; problem: string }[];
  duplicates: { line: number; participant_ref: string; problem: string }[];
  error?: string;
  imported?: number;
}

const HEADERS = ["participant_id", "first_name", "surname", "email", "mobile", "programme_code", "cohort_code", "amount_due"];

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Validates without writing anything. Nothing is imported until an
 *  administrator has seen this report and confirmed it. */
export async function validateImport(formData: FormData): Promise<ImportReport> {
  await requireRole("super_admin", "finance_admin");
  const file = formData.get("file");
  const empty: ImportReport = { detected: 0, valid: [], invalid: [], duplicates: [] };
  if (!(file instanceof File) || file.size === 0)
    return { ...empty, error: "Choose a CSV file to check." };
  if (file.size > 8 * 1024 * 1024)
    return { ...empty, error: "The file is larger than 8 MB. Split it into smaller batches." };

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { ...empty, error: "The file has no rows." };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const missing = ["first_name", "surname", "programme_code"].filter((h) => !header.includes(h));
  if (missing.length)
    return { ...empty, error: `The file is missing these columns: ${missing.join(", ")}. Expected: ${HEADERS.join(", ")}.` };

  const idx = (name: string) => header.indexOf(name);
  const sb = await supabaseServer();
  const { data: programmes } = await sb.from("programmes").select("id, code, amount_due");
  const codes = new Map((programmes ?? []).map((p) => [p.code.toUpperCase(), p]));

  const report: ImportReport = { detected: lines.length - 1, valid: [], invalid: [], duplicates: [] };
  const seenEmails = new Set<string>();
  const seenRefs = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const line = i + 1;
    const get = (name: string) => (idx(name) >= 0 ? (cols[idx(name)] ?? "") : "");

    const first = get("first_name");
    const surname = get("surname");
    const email = get("email").toLowerCase();
    const programmeCode = get("programme_code").toUpperCase();
    const ref = get("participant_id").toUpperCase();
    const amountRaw = get("amount_due").replace(/[R\s,]/g, "");

    const problems: string[] = [];
    if (!first || !surname) problems.push("name is incomplete");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push("email is not valid");
    if (!codes.has(programmeCode)) problems.push(`programme code ${programmeCode || "(blank)"} does not exist`);
    if (amountRaw && Number.isNaN(Number(amountRaw))) problems.push("amount due is not a number");

    if (problems.length) {
      report.invalid.push({ line, raw: lines[i].slice(0, 160), problem: problems.join(", ") });
      continue;
    }
    if (email && seenEmails.has(email)) {
      report.duplicates.push({ line, participant_ref: ref || email, problem: "repeated in this file" });
      continue;
    }
    if (ref && seenRefs.has(ref)) {
      report.duplicates.push({ line, participant_ref: ref, problem: "repeated in this file" });
      continue;
    }
    seenEmails.add(email);
    if (ref) seenRefs.add(ref);

    const programme = codes.get(programmeCode)!;
    report.valid.push({
      line,
      participant_ref: ref || undefined,
      first_name: first, surname, email,
      mobile: get("mobile"),
      programme_code: programmeCode,
      cohort_code: get("cohort_code") || undefined,
      amount_due: amountRaw ? Number(amountRaw) : Number(programme.amount_due),
    });
  }

  // Anyone already on the system, matched on the email address.
  const emails = report.valid.map((r) => r.email).filter(Boolean);
  for (let i = 0; i < emails.length; i += 500) {
    const { data: existing } = await sb
      .from("participants").select("email, participant_ref")
      .in("email", emails.slice(i, i + 500));
    for (const e of existing ?? []) {
      const row = report.valid.find((r) => r.email === e.email);
      if (row) {
        report.duplicates.push({
          line: row.line, participant_ref: e.participant_ref,
          problem: "email already registered",
        });
      }
    }
  }
  const dupLines = new Set(report.duplicates.map((d) => d.line));
  report.valid = report.valid.filter((r) => !dupLines.has(r.line));

  return report;
}

/** Writes only the rows that passed validation, in batches. */
export async function commitImport(rowsJson: string): Promise<ImportReport> {
  const user = await requireRole("super_admin", "finance_admin");
  const rows = JSON.parse(rowsJson) as ImportRow[];
  const sb = await supabaseServer();
  const admin = supabaseAdmin();

  const { data: programmes } = await sb.from("programmes").select("id, code");
  const codes = new Map((programmes ?? []).map((p) => [p.code.toUpperCase(), p.id]));
  const { data: cohorts } = await sb.from("cohorts").select("id, code, programme_id");

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map((r) => {
      const programmeId = codes.get(r.programme_code)!;
      const cohort = cohorts?.find(
        (c) => c.programme_id === programmeId && c.code.toUpperCase() === (r.cohort_code ?? "").toUpperCase(),
      );
      return {
        ...(r.participant_ref ? { participant_ref: r.participant_ref } : {}),
        first_name: r.first_name,
        surname: r.surname,
        email: r.email || null,
        mobile: r.mobile || null,
        programme_id: programmeId,
        cohort_id: cohort?.id ?? null,
        amount_due: r.amount_due,
      };
    });
    const { error, count } = await admin.from("participants").insert(batch, { count: "exact" });
    if (error) return { detected: rows.length, valid: [], invalid: [], duplicates: [], imported, error: error.message };
    imported += count ?? batch.length;
  }

  await admin.from("audit_logs").insert({
    actor_id: user.id, actor_email: user.email, action: "participants.imported",
    entity_type: "participant", entity_id: null,
    summary: `Imported ${imported} participants`,
    metadata: { rows: rows.length },
  });

  return { detected: rows.length, valid: [], invalid: [], duplicates: [], imported };
}
