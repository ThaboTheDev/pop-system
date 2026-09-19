import { requireRole } from "@/lib/auth";
import { ImportPanel } from "./ImportPanel";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("super_admin", "finance_admin");
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bulk import participants</h1>
          <p>Upload a CSV. Nothing is written until you have seen the check and confirmed it.</p>
        </div>
      </div>
      <ImportPanel />
    </>
  );
}
