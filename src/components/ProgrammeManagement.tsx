import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteProgramme, saveCohort, deleteCohort } from "@/app/(admin)/programmes/actions";
import { formatMoney } from "@/lib/format";
import { ProgrammeForm } from "./ProgrammeForm";

type Cohort = {
  id: string;
  code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

type ProgrammeRow = {
  id: string;
  code: string;
  name: string;
  amount_due: number;
  once_off_amount: number | null;
  pricing_model: string;
  is_active: boolean;
  cohorts: Cohort[] | null;
};

function priceSummary(p: ProgrammeRow) {
  if (p.pricing_model === "dual") {
    return `Once-off ${formatMoney(p.once_off_amount)} · Monthly ${formatMoney(p.amount_due)}`;
  }
  return `Fee ${formatMoney(p.amount_due)}`;
}

export async function ProgrammeManagement() {
  const user = await requireUser();
  if (user.role !== "super_admin") return null;
  const { data } = await (await supabaseServer())
    .from("programmes")
    .select("*,cohorts(*)")
    .order("name");
  const programmes = (data ?? []) as ProgrammeRow[];

  return (
    <section className="programme-manage">
      <div className="card card-flush" style={{ marginBottom: 18 }}>
        <h2>Add a programme</h2>
        <div style={{ padding: 18 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Set a code, a name and the fee. If the course offers two ways to pay, record the
            discounted once-off amount and the original monthly price — applicants will choose
            between them when they register.
          </p>
          <ProgrammeForm />
        </div>
      </div>

      <h2 className="section-title">Existing programmes</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Fee changes apply to future imports and new applications. Already approved participants keep
        the amount due recorded on their record. Deleting a cohort clears it on existing participants.
      </p>

      {programmes.length === 0 ? (
        <div className="card empty">
          <strong>No programmes yet</strong>
          Create the first programme above. It will appear on the public application form once it is active.
        </div>
      ) : null}

      <div className="programme-list">
        {programmes.map((p) => (
          <details key={p.id} className="card card-flush disclose">
            <summary>
              <span>
                <strong>{p.name}</strong>
                <span className="faint" style={{ display: "block", marginTop: 2 }}>
                  {p.code} · {priceSummary(p)}
                </span>
              </span>
              <span className="btn-row" style={{ pointerEvents: "none" }}>
                <span className={`badge ${p.is_active ? "badge-ok" : "badge-idle"}`}>
                  {p.is_active ? "Active" : "Inactive"}
                </span>
                <span className="badge badge-note">
                  {p.pricing_model === "dual" ? "Two prices" : "One price"}
                </span>
                <span className="badge badge-idle">{(p.cohorts ?? []).length} cohorts</span>
              </span>
            </summary>
            <div className="disclose-body">
              <h3>Programme details</h3>
              <ProgrammeForm programme={p} />

              <form action={deleteProgramme} style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={p.id} />
                <button className="btn btn-sm btn-danger">Delete unused programme</button>
                <span className="faint" style={{ marginLeft: 8 }}>
                  Only works if {p.name} has no participants or payments.
                </span>
              </form>

              <h3 style={{ marginTop: 28 }}>Cohorts</h3>
              <p className="faint">Intakes under this programme. Optional start and end dates.</p>
              {(p.cohorts ?? []).length === 0 ? <p className="faint">No cohorts yet.</p> : null}
              <div className="cohort-list">
                {(p.cohorts ?? []).map((c) => (
                  <div className="cohort-row" key={c.id}>
                    <form action={saveCohort} className="cohort-form">
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="programme_id" value={p.id} />
                      <div className="field">
                        <label htmlFor={`c-code-${c.id}`}>Code</label>
                        <input id={`c-code-${c.id}`} name="code" defaultValue={c.code} required />
                      </div>
                      <div className="field">
                        <label htmlFor={`c-name-${c.id}`}>Name</label>
                        <input id={`c-name-${c.id}`} name="name" defaultValue={c.name} required />
                      </div>
                      <div className="field">
                        <label htmlFor={`c-start-${c.id}`}>Start</label>
                        <input id={`c-start-${c.id}`} type="date" name="start" defaultValue={c.start_date ?? ""} />
                      </div>
                      <div className="field">
                        <label htmlFor={`c-end-${c.id}`}>End</label>
                        <input id={`c-end-${c.id}`} type="date" name="end" defaultValue={c.end_date ?? ""} />
                      </div>
                      <div className="field cohort-actions">
                        <label className="faint">&nbsp;</label>
                        <button className="btn btn-sm">Save cohort</button>
                      </div>
                    </form>
                    <form action={deleteCohort}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-sm" aria-label={`Delete cohort ${c.name}`}>Delete</button>
                    </form>
                  </div>
                ))}
              </div>

              <form action={saveCohort} className="card" style={{ marginTop: 14, background: "var(--surface)" }}>
                <h3>New cohort</h3>
                <input type="hidden" name="programme_id" value={p.id} />
                <div className="field-row">
                  <div className="field">
                    <label htmlFor={`new-c-code-${p.id}`}>Code</label>
                    <input id={`new-c-code-${p.id}`} name="code" placeholder="2026-S1" required />
                  </div>
                  <div className="field">
                    <label htmlFor={`new-c-name-${p.id}`}>Name</label>
                    <input id={`new-c-name-${p.id}`} name="name" placeholder="Semester 1 2026" required />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor={`new-c-start-${p.id}`}>Start</label>
                    <input id={`new-c-start-${p.id}`} type="date" name="start" />
                  </div>
                  <div className="field">
                    <label htmlFor={`new-c-end-${p.id}`}>End</label>
                    <input id={`new-c-end-${p.id}`} type="date" name="end" />
                  </div>
                </div>
                <button className="btn">Create cohort</button>
              </form>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
