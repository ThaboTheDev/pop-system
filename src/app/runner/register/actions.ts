"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { submitApplication, type ApplicationResult } from "@/lib/applications";

export async function registerInPerson(form: FormData): Promise<ApplicationResult> {
  await requireRole("runner");
  const result = await submitApplication(form, true);
  if (result.ok) revalidatePath("/runner");
  return result;
}
