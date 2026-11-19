import Papa from "papaparse";

export function normalizeSourceCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  if (parsed.errors.length)
    throw new Error(parsed.errors.map((e) => e.message).join("; "));
  if (!parsed.meta.fields?.includes("date"))
    throw new Error("Source CSV needs a date column");
  const rows: Record<string, string>[] = parsed.data.map((row, index) => {
    const raw = row.date.trim();
    let date = raw;
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw);
    if (us) {
      let year = us[3];
      if (year.length === 2) {
        const century = Number(year) < 89 ? "20" : "19";
        year = century + year;
      }
      date = `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error(
        `Source row ${index + 2}: invalid date ${JSON.stringify(raw)}`,
      );
    return { ...row, date, date_original: row.date_original || row.date };
  });
  return { rows, csv: Papa.unparse(rows, { newline: "\n" }) };
}
