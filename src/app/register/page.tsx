import Link from "next/link";
import { ApplicationForm } from "@/components/ApplicationForm";
import { Crest } from "@/components/Brand";
import { registrationProgrammes } from "@/lib/applications";
import { registerApplication } from "./actions";

export const metadata = { title: "Apply | MSR Learning Institute", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const programmes = await registrationProgrammes();
  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Apply for a programme</h1>
        <p>Staff review every application. Your Participant ID is created only after approval.</p>
      </header>
      <main className="portal-body">
        {programmes?.length
          ? <ApplicationForm programmes={programmes} submit={registerApplication} />
          : <div className="card notice notice-info">Applications are not available right now. Please check again later or contact the registry.</div>}
        <p className="faint" style={{ marginTop: 16 }}>Already enrolled? <Link href="/portal/login">Sign in to the participant portal</Link>.</p>
      </main>
    </div>
  );
}
