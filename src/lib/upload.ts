import { createHash } from "crypto";

export const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Magic-number check. A browser-supplied MIME type is a claim, not evidence,
 *  so the first bytes are inspected before anything is stored. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  const [a, b, c, d] = bytes;
  if (a === 0x25 && b === 0x50 && c === 0x44 && d === 0x46) return "application/pdf";
  if (a === 0xff && b === 0xd8 && c === 0xff) return "image/jpeg";
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return "image/png";
  return null;
}

export function validateUpload(file: File, bytes: Uint8Array) {
  if (file.size === 0) return "The file is empty. Attach the proof of payment again.";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 10 MB. Send a smaller copy.";
  const sniffed = sniffMime(bytes);
  if (!sniffed) return "Only PDF, JPG and PNG files can be uploaded.";
  if (!ALLOWED_MIME.includes(sniffed as (typeof ALLOWED_MIME)[number]))
    return "Only PDF, JPG and PNG files can be uploaded.";
  if (file.type && file.type !== sniffed)
    return "The file contents do not match its type. Re-save the document and try again.";
  return null;
}

export const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Deterministic, non-guessable path. Nothing in it can be enumerated from
 *  the outside, and the bucket is private regardless. */
export const storagePath = (participantId: string, paymentId: string, fileName: string) =>
  `participants/${participantId}/payments/${paymentId}/${fileName}`;
