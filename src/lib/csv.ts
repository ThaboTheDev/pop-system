/** RFC4180-style parser, including quoted commas, escaped quotes and newlines. */
export function parseCSV(text: string): Record<string, string>[] {
 const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
 text = text.replace(/^\uFEFF/, "");
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
  else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
   row.push(value.trim()); value = "";
   if (c !== ',') { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
  } else value += c;
 }
 if (quoted) throw new Error("Unclosed CSV quote");
 row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
 const header = rows.shift()?.map(h => h.toLowerCase().replace(/\s+/g, "_"));
 if (!header?.length || new Set(header).size !== header.length) throw new Error("Missing or duplicate CSV headers");
 if (rows.length > 1000) throw new Error("Split the file into batches of at most 1,000 rows");
 return rows.map((r,i) => { if (r.length !== header.length) throw new Error(`Row ${i + 2}: column count does not match header`); return Object.fromEntries(header.map((h,j) => [h,r[j]])); });
}
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function money(value: string, positive = true) {
 if (!/^-?\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || (positive && Number(value) <= 0)) throw new Error("Amount must be a decimal with at most two places");
 return Number(value);
}
