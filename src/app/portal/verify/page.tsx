import { verifyOTP } from "../actions";
export default async function Verify({ searchParams }: { searchParams: Promise<{ id?: string; invalid?: string }> }) {
  const p = await searchParams;
  return <main className="content"><h1>Verify your email</h1>{p.invalid && <p role="alert">Invalid or expired code. You have at most five attempts.</p>}
    <form action={verifyOTP} className="card"><input type="hidden" name="id" value={p.id ?? ""} /><label>Six-digit code<input name="code" required pattern="[0-9]{6}" autoComplete="one-time-code" inputMode="numeric" /></label><button className="btn btn-primary">Verify</button></form></main>;
}
