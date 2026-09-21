import { PRIVACY_NOTICE_VERSION } from "@/lib/types";

/** Keep this wording and its recorded version together. This notice describes
 * the processing we actually perform; institute-specific retention policies
 * and contact details must be confirmed by the information officer at go-live. */
export function PrivacyNotice() {
  return (
    <section className="notice notice-info" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Your personal information</h2>
      <p>
        MSR Learning Institute uses your name, contact details and programme choice
        to review your application. If you are accepted, we use them to maintain
        the participant register, manage fees and payments, and contact you about
        your registration. Submitting this form does not enrol you or issue a Participant ID.
      </p>
      <p>
        Only authorised people can access your information for their work. Our
        hosting and email providers process it to operate this service. We do not
        sell your information or use this consent for marketing. We keep records
        only as needed for these purposes and applicable record-keeping duties.
      </p>
      <p>
        Contact the institute’s registry to ask about access, corrections,
        retention, withdrawing consent or a privacy concern. Withdrawing consent
        may affect our ability to process your application; some records may need
        to be retained by law. You may also complain to South Africa’s Information Regulator.
      </p>
      <small>Privacy notice version {PRIVACY_NOTICE_VERSION}</small>
    </section>
  );
}
