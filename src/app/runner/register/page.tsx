import { requireRole } from "@/lib/auth";
import { registrationProgrammes } from "@/lib/applications";
import { ApplicationForm } from "@/components/ApplicationForm";
import { registerInPerson } from "./actions";

export default async function RunnerRegister() {
  await requireRole("runner");
  const programmes = await registrationProgrammes();
  return <>
    <h2>Register an applicant</h2>
    <p>Explain the privacy notice in person. This submits an application for staff review; it does not enrol the person or issue an ID.</p>
    {programmes?.length ? <ApplicationForm programmes={programmes} submit={registerInPerson} inPerson /> : <div className="notice notice-info">No programmes are available right now. Please contact the registry.</div>}
  </>;
}
