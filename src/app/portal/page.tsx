import { PortalForm } from "./PortalForm";
import { Crest } from "@/components/Brand";

export const metadata = {
  title: "Participant portal | MSR Learning Institute",
  robots: { index: false, follow: false },
};

/** Participants reach their own record with a code sent to the email on their
 *  registration. No password, and no route to anyone else's record. */
export default function Portal() {
  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Participant portal</h1>
        <p>
          View your payments, your payment plan and your statement. We email a
          six-digit code to the address on your registration.
        </p>
      </header>
      <main className="portal-body">
        <PortalForm />
      </main>
    </div>
  );
}
