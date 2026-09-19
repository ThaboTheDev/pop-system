import { SubmitForm } from "./SubmitForm";
import { Crest } from "@/components/Brand";

export const metadata = {
  title: "Submit your proof of payment | MSR Learning Institute",
  robots: { index: false, follow: false },
};

export default function SubmitPage() {
  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Submit your proof of payment</h1>
        <p>
          Send the receipt from your bank once your payment has gone through.
          You will get a reference number to keep.
        </p>
      </header>
      <main className="portal-body">
        <SubmitForm />
      </main>
    </div>
  );
}
