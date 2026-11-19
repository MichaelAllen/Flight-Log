import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { parseLog } from "./importer.ts";
import { normalizeSourceCsv } from "./normalize-source.ts";
import type { Airport, Book } from "../src/model.ts";
const config = JSON.parse(await readFile("data/catalog.json", "utf8"));
const airports: Record<string, Airport> = JSON.parse(
  await readFile("data/airports.json", "utf8"),
);
const overrides = JSON.parse(
  await readFile("data/airport-overrides.json", "utf8"),
);
for (const [id, a] of Object.entries(overrides) as [
  string,
  Airport & { reviewNote: string },
][]) {
  if (!a.reviewNote) throw new Error(`Override ${id} needs reviewNote`);
  airports[id] = { ...a, id };
}
for (const [id, a] of Object.entries(airports))
  if (
    a.id !== id ||
    !Number.isFinite(a.lat) ||
    !Number.isFinite(a.lon) ||
    Math.abs(a.lat) > 90 ||
    Math.abs(a.lon) > 180
  )
    throw new Error(`Invalid airport: ${id}`);
const books: Book[] = config.books;
const publication = process.argv.includes("--publication");
if (new Set(books.map((b) => b.id)).size !== books.length)
  throw new Error("Duplicate book ID");
for (const b of books) {
  if (publication && !b.privacyReviewed)
    throw new Error(`Review privacy before publishing ${b.id}`);
  if (!/^\/books\/[\w./-]+\.pdf$/.test(b.pdf) || b.pdf.includes(".."))
    throw new Error("Book PDF must be under public/books");
  const pdf = await PDFDocument.load(
    await readFile(path.join("public", b.pdf)),
  );
  if (pdf.getPageCount() !== b.pageCount)
    throw new Error(`${b.id}: pageCount does not match PDF`);
}
if (publication && !config.meta.privacyReviewed)
  throw new Error(
    "Review CSV remarks and scans before publication; set meta.privacyReviewed only after review",
  );
if (
  !publication &&
  (!config.meta.privacyReviewed || books.some((b) => !b.privacyReviewed))
)
  console.warn(
    "Archive privacy-review flags are unset. The explicit publication audit is available via npm run validate:publication.",
  );
const result = parseLog(
  normalizeSourceCsv(await readFile("data/flights.csv", "utf8")).csv,
  books,
  airports,
  config.extraNumericColumns || [],
  {
    totalTimeColumn: config.totalTimeColumn,
    airportAliases: config.airportAliases,
  },
);
for (const w of result.warnings) console.warn("WARNING:", w);
if (result.errors.length) {
  for (const e of result.errors) console.error("ERROR:", e);
  process.exit(1);
}
if (!result.entries.length) throw new Error("CSV contains no entries");
const used = new Set(result.entries.flatMap((e) => e.route));
const sourcePages = [...new Set(result.entries.map((e) => e.pdfPage))].sort(
  (a, b) => a - b,
);
const importNotice = config.meta.demo
  ? config.meta.importNotice
  : `${result.entries.length} entries from PDF pages ${sourcePages.join(", ")}. Preliminary transcription; uncertainties are preserved in each entry.${result.entries.every((e) => e.totalHours === null) ? " Total flight hours have not been supplied." : ""}`;
if (!process.argv.includes("--check")) {
  await mkdir("public/data", { recursive: true });
  await writeFile(
    "public/data/logbook.json",
    JSON.stringify({
      entries: result.entries,
      airports: Object.fromEntries(
        Object.entries(airports).filter(([id]) => used.has(id)),
      ),
      books,
      meta: {
        ...config.meta,
        importNotice,
        totalTimeColumn: config.totalTimeColumn || "total_hours",
        airportAliases: config.airportAliases || {},
      },
      warnings: result.warnings,
    }),
  );
}
console.log(
  `Validated ${result.entries.length} entries, ${books.length} book(s), ${used.size} airport identifiers. ${result.warnings.length} warning(s).`,
);
