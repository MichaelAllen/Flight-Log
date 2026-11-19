import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";
const rows = Papa.parse<Record<string, string>>(
  await readFile("data/flights.csv", "utf8"),
  { header: true, skipEmptyLines: true },
).data;
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica),
  serif = await pdf.embedFont(StandardFonts.TimesRoman),
  bold = await pdf.embedFont(StandardFonts.HelveticaBold);
for (let index = 0; index < 3; index++) {
  const p = pdf.addPage([900, 620]);
  const ink = rgb(0.16, 0.25, 0.19),
    muted = rgb(0.5, 0.56, 0.46);
  p.drawRectangle({
    x: 0,
    y: 0,
    width: 900,
    height: 620,
    color: rgb(0.98, 0.98, 0.95),
  });
  p.drawText("THE FLIGHT LOG", {
    x: 40,
    y: 568,
    size: 30,
    font: serif,
    color: ink,
  });
  p.drawText("DEMONSTRATION SOURCE BOOK", {
    x: 40,
    y: 542,
    size: 10,
    font: bold,
    color: muted,
  });
  p.drawText("ILLUSTRATIVE ENTRIES - NOT AN ORIGINAL SCAN", {
    x: 40,
    y: 505,
    size: 13,
    font: bold,
    color: rgb(0.65, 0.38, 0.18),
  });
  p.drawText(
    "Replace this file with the reviewed scanned logbook. Page and row links are functional.",
    { x: 40, y: 484, size: 10, font, color: muted },
  );
  const cols = [40, 132, 205, 295, 520, 565, 620, 860];
  const labels = [
    "DATE",
    "TYPE",
    "TAIL NUMBER",
    "ROUTE OF FLIGHT",
    "HOURS",
    "LDGS",
    "REMARKS",
  ];
  for (let c = 0; c < labels.length; c++)
    p.drawText(labels[c], {
      x: cols[c] + 5,
      y: 450,
      size: 8,
      font: bold,
      color: ink,
    });
  for (let n = 0; n <= 11; n++) {
    const y = 468 - n * 31;
    p.drawLine({
      start: { x: 40, y },
      end: { x: 860, y },
      thickness: n === 0 ? 1 : 0.4,
      color: muted,
    });
  }
  for (const x of cols)
    p.drawLine({
      start: { x, y: 468 },
      end: { x, y: 127 },
      thickness: 0.4,
      color: muted,
    });
  rows.slice(index * 10, index * 10 + 10).forEach((r, i) => {
    const y = 419 - i * 31;
    const values = [
      r.date,
      r.aircraft_type,
      r.tail_number,
      r.route.replaceAll(">", " - "),
      r.total_hours || "--",
      r.landings,
      r.remarks,
    ];
    values.forEach((v, c) =>
      p.drawText(
        v.length > (c === 6 ? 38 : 50)
          ? v.slice(0, c === 6 ? 35 : 47) + "..."
          : v,
        { x: cols[c] + 5, y, size: c === 3 ? 9 : 8, font, color: ink },
      ),
    );
  });
  p.drawText(`DEMO BOOK | PDF PAGE ${index + 1} | PRINTED PAGE ${index + 1}`, {
    x: 40,
    y: 79,
    size: 9,
    font,
    color: muted,
  });
  p.drawText(
    "Each row corresponds to one illustrative entry in data/flights.csv.",
    { x: 40, y: 59, size: 9, font, color: muted },
  );
}
await writeFile("public/books/demo-logbook.pdf", await pdf.save());
console.log("Created 3-page demonstration PDF");
