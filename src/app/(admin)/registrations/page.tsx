import { redirect } from "next/navigation";

// Bookmark compatibility only. The participant-backed registration workflow
// has been removed; there is one application queue and one approval function.
export default function LegacyRegistrations() { redirect("/applications"); }
