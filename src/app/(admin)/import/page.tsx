import { OperationsImport } from "./OperationsImport";
import { requireRole } from "@/lib/auth";
import { ImportPanel } from "./ImportPanel";
import { PageHead } from "@/components/PageHead";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("super_admin", "finance_admin");
  return (
    <>
      <PageHead
        eyebrow="Participant registry"
        title="Bulk import participants"
        sub="Upload a CSV. Nothing is written until you have seen the check and confirmed it."
      />
      <OperationsImport />
      <h2>New participants</h2>
      <ImportPanel />
    </>
  );
}
