import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { CaptureForm } from "./CaptureForm";

export default async function RunnerCapture() {
  await requireRole("runner");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
  return <>
    <h2>Record money received</h2>
    <p>For an enrolled participant only. Check their name and ID before recording the amount. Every captured payment waits for independent finance verification.</p>
    <CaptureForm requestId={randomUUID()} today={today} />
  </>;
}
