import Papa from "papaparse";
import type { Airport, Book, Entry } from "../src/model.ts";
export const required = [
  "id",
  "date",
  "aircraft_type",
  "tail_number",
  "route",
  "source_book_id",
  "pdf_page",
];
export const numericColumns = [
  "total_hours",
  "single_engine_land",
  "multi_engine_land",
  "night",
  "actual_instrument",
  "simulated_instrument",
  "dual_received",
  "pilot_in_command",
  "solo",
  "cross_country",
  "landings",
  "instrument_approaches",
];
export function parseLog(
  csv: string,
  books: Book[],
  airports: Record<string, Airport>,
  extraNumeric: string[] = [],
  options: {
    totalTimeColumn?: string;
    airportAliases?: Record<string, string>;
  } = {},
) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const errors: string[] = parsed.errors.map(
      (e) =>
        `CSV ${e.row === undefined ? "" : `row ${e.row + 2}`}: ${e.message}`,
    ),
    warnings: string[] = [],
    entries: Entry[] = [],
    ids = new Set<string>();
  for (const c of required)
    if (!parsed.meta.fields?.includes(c))
      errors.push(`Missing required column: ${c}`);
  const totalTimeColumn = options.totalTimeColumn || "total_hours";
  if (![...numericColumns, ...extraNumeric].includes(totalTimeColumn))
    errors.push(`Unknown total-time column: ${totalTimeColumn}`);
  if (options.totalTimeColumn && !parsed.meta.fields?.includes(totalTimeColumn))
    errors.push(`Missing configured hours column: ${totalTimeColumn}`);
  for (const [from, to] of Object.entries(options.airportAliases || {}))
    if (
      !/^[A-Z0-9]{2,7}$/.test(from) ||
      !airports[to] ||
      options.airportAliases?.[to]
    )
      errors.push(
        `Invalid airport alias: ${from} -> ${to}; target must be a resolved canonical airport`,
      );
  for (const [i, raw] of parsed.data.entries()) {
    const r = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [
          k,
          typeof v === "string" ? v.trim() : v,
        ]),
      ) as Record<string, string>,
      label = `row ${i + 2} (${r.id || "no ID"})`;
    for (const c of required)
      if (!r[c] && !(c === "tail_number" && r.transcription_notes))
        errors.push(`${label}: ${c} is required`);
    if (!r.tail_number && r.transcription_notes)
      warnings.push(`${label}: tail number not supplied; retained as unknown`);
    if (ids.has(r.id)) errors.push(`${label}: duplicate ID`);
    ids.add(r.id);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
      Number.isNaN(Date.parse(r.date)) ||
      new Date(r.date).toISOString().slice(0, 10) !== r.date
    )
      errors.push(`${label}: invalid ISO date`);
    const route = (r.route || "")
      .split(">")
      .map((s) => s.trim().toUpperCase())
      .map((id) => options.airportAliases?.[id] || id);
    if (route.some((s) => !s || !/^[A-Z0-9]{2,7}$/.test(s)))
      errors.push(
        `${label}: invalid route; use ordered identifiers separated by >`,
      );
    const notes = r.transcription_notes || "";
    const unresolved = route.filter((id) => !airports[id]);
    if (unresolved.length) {
      const msg = `${label}: unresolved airport(s): ${[...new Set(unresolved)].join(", ")}`;
      if (notes) warnings.push(msg);
      else
        errors.push(msg + "; add transcription_notes documenting uncertainty");
    }
    const numeric: Record<string, number | null> = {};
    for (const c of new Set([...numericColumns, ...extraNumeric])) {
      const v = r[c];
      numeric[c] = v === undefined || v === "" ? null : Number(v);
      if (
        v !== undefined &&
        v !== "" &&
        (!/^\d+(\.\d+)?$/.test(v) ||
          !Number.isFinite(numeric[c]) ||
          numeric[c]! < 0)
      )
        errors.push(`${label}: invalid non-negative decimal ${c}`);
      if (
        ["landings", "instrument_approaches"].includes(c) &&
        numeric[c] !== null &&
        !Number.isInteger(numeric[c])
      )
        errors.push(`${label}: ${c} must be an integer`);
    }
    const book = books.find((b) => b.id === r.source_book_id),
      page = Number(r.pdf_page);
    if (!book) errors.push(`${label}: unknown source book`);
    if (!Number.isInteger(page) || page < 1 || (book && page > book.pageCount))
      errors.push(`${label}: PDF page outside book range`);
    entries.push({
      id: r.id,
      date: r.date,
      aircraftType: r.aircraft_type,
      tailNumber: r.tail_number,
      route,
      routeOriginal: r.route_original || r.route,
      totalHours: numeric[totalTimeColumn],
      remarks: r.remarks || "",
      bookId: r.source_book_id,
      pdfPage: page,
      printedPage: r.printed_page || "",
      sourceRow: r.source_row || "",
      notes,
      categories: Object.fromEntries(
        Object.entries(numeric).filter(([k]) => k !== "total_hours"),
      ),
      original: raw,
    });
  }
  return {
    entries: entries.sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    ),
    errors,
    warnings,
  };
}
