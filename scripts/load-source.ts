import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { normalizeSourceCsv } from "./normalize-source.ts";

const [csvPath, pdfPath] = process.argv.slice(2);
if (!csvPath || !pdfPath)
  throw new Error(
    "Usage: npm run load -- /path/to/Logbook.csv /path/to/Logbook.pdf",
  );
const original = await readFile(csvPath, "utf8");
const { rows, csv } = normalizeSourceCsv(original);
if (!rows.length) throw new Error("Source CSV has no entries");
const ids = [...new Set(rows.map((r) => r.source_book_id))];
if (ids.length !== 1 || !ids[0])
  throw new Error("This loader expects one source book per CSV");
const pdfBytes = await readFile(pdfPath);
const pdf = await PDFDocument.load(pdfBytes);
const pages = [...new Set(rows.map((r) => Number(r.pdf_page)))].sort(
  (a, b) => a - b,
);
if (pages.some((n) => !Number.isInteger(n) || n < 1 || n > pdf.getPageCount()))
  throw new Error("CSV PDF references are outside the supplied book");
const pdfName = path.basename(pdfPath);
if (!/^[\w.-]+\.pdf$/i.test(pdfName))
  throw new Error(
    "Use a PDF filename with letters, numbers, dots, underscores or hyphens",
  );
const config = JSON.parse(await readFile("data/catalog.json", "utf8"));
config.meta.demo = false;
config.meta.privacyReviewed = false;
config.meta.importNotice = `${rows.length} entries from PDF pages ${pages.join(", ")}. Preliminary transcription; uncertainties are preserved in each entry.${rows.every((r) => !(r[config.totalTimeColumn || "total_hours"] || "").trim()) ? " Total flight hours have not been supplied." : ""}`;
config.books = [
  {
    id: ids[0],
    title: "Pilot logbook",
    pdf: `/books/${pdfName}`,
    pageCount: pdf.getPageCount(),
    privacyReviewed: false,
  },
];
await mkdir("data/source", { recursive: true });
await mkdir("public/books", { recursive: true });
await writeFile("data/source/logbook.csv", original);
await writeFile("data/flights.csv", csv + "\n");
await writeFile("data/catalog.json", JSON.stringify(config, null, 2) + "\n");
await copyFile(pdfPath, path.join("public/books", pdfName));
// Demonstration files must not remain among publicly served static assets.
await rm("public/books/demo-logbook.pdf", { force: true });
await rm("public/data/flights-template.csv", { force: true });
console.log(
  `Loaded ${rows.length} entries and ${pdf.getPageCount()} PDF pages. Source CSV preserved unchanged in data/source/logbook.csv. Privacy review remains pending.`,
);
