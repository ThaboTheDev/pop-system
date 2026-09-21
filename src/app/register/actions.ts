"use server";

import { submitApplication, type ApplicationResult } from "@/lib/applications";

export async function registerApplication(form: FormData): Promise<ApplicationResult> {
  return submitApplication(form, false);
}
