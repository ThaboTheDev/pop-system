import { supabaseAdmin } from "@/lib/supabase/admin";
import { RegisterForm } from "./RegisterForm";
import { Crest } from "@/components/Brand";

export const metadata = {
  title: "Register | MSR Learning Institute",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // The public form needs the open programmes, and this page has no session.
  // If the query fails (or none are open) the visitor gets a plain notice —
  // never an error boundary on a public page.
  let programmes: { id: string; name: string; amount_due: number }[] | null = null;
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from("programmes")
      .select("id, name, amount_due")
      .eq("is_active", true)
      .order("name");
    programmes = data ?? [];
  } catch {
    programmes = null;
  }

  return (
    <div className="portal">
      <header className="portal-head">
        <Crest className="brand-logo" size={58} />
        <div className="crest">MSR Learning Institute</div>
        <h1>Register for a programme</h1>
        <p>
          Send your details to the institute. The finance office reviews every
          registration, and the decision arrives by email.
        </p>
      </header>
      <main className="portal-body">
        {programmes && programmes.length > 0 ? (
          <RegisterForm programmes={programmes} />
        ) : (
          <div className="card">
            <div className="notice notice-info" style={{ marginBottom: 0 }}>
              Registration is not open yet. Please check again soon, or contact
              the institute if you expected to be able to register now.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
