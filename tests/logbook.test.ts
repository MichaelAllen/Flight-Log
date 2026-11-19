import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import { parseLog } from "../scripts/importer.ts";
import {
  aggregateConnections,
  airportStats,
  emptyFilters,
  estimatedDistance,
  filterEntries,
  parseState,
  resolvedLegs,
  serializeState,
  summarize,
  timeSeries,
  type Airport,
  type Book,
  type Entry,
} from "../src/model.ts";
const airports: Record<string, Airport> = {
  A: { id: "A", name: "A", city: "", state: "", lat: 34, lon: -78 },
  B: { id: "B", name: "B", city: "", state: "", lat: 35, lon: -78 },
  C: { id: "C", name: "C", city: "", state: "", lat: 35, lon: -79 },
};
const base: Entry = {
  id: "one",
  date: "1995-06-14",
  aircraftType: "BE-C23",
  tailNumber: "N9230S",
  route: ["A", "B", "C", "A"],
  routeOriginal: "A-B-C-A",
  totalHours: 1.4,
  remarks: "Solo practice",
  bookId: "book",
  pdfPage: 1,
  printedPage: "1",
  sourceRow: "1",
  notes: "",
  categories: {},
  original: {},
};
const second: Entry = {
  ...base,
  id: "two",
  date: "1996-03-12",
  aircraftType: "C172",
  tailNumber: "N12345",
  totalHours: null,
};
const books: Book[] = [
  {
    id: "book",
    title: "Test",
    pdf: "/books/test.pdf",
    pageCount: 2,
    privacyReviewed: true,
  },
];
const importAirports = {
  "60J": { ...airports.A, id: "60J" },
  SUT: { ...airports.B, id: "SUT" },
  CRE: { ...airports.C, id: "CRE" },
};
const row = {
  id: "flight-1",
  date: "1995-06-14",
  aircraft_type: "BE-C23",
  tail_number: "N9230S",
  route: "60J>SUT>CRE>60J",
  source_book_id: "book",
  pdf_page: "1",
  total_hours: "1.4",
  remarks: "Solo, practice",
  unknown_column: "Preserve this",
};
const csv = (rows: Record<string, string>[] = [row]) => Papa.unparse(rows);
const parse = (rows: Record<string, string>[] = [row]) =>
  parseLog(csv(rows), books, importAirports);
test("sample route keeps repeated departure and ordered stops", () => {
  const r = parse();
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.entries[0].route, ["60J", "SUT", "CRE", "60J"]);
  assert.equal(r.entries[0].original.unknown_column, "Preserve this");
  assert.equal(r.entries[0].remarks, "Solo, practice");
});
test("year, multiple aircraft and tail filters intersect", () => {
  assert.deepEqual(
    filterEntries([base, second], {
      ...emptyFilters,
      year: "1995",
      types: ["BE-C23", "PA-28"],
      tails: ["N9230S", "N99999"],
    }).map((e) => e.id),
    ["one"],
  );
  assert.equal(
    filterEntries([base], { ...emptyFilters, types: ["C172"] }).length,
    0,
  );
});
test("date range inclusive, airport and search filters combine", () => {
  assert.equal(
    filterEntries([base, second], {
      ...emptyFilters,
      from: base.date,
      to: base.date,
      airport: "B",
      search: "solo",
    }).length,
    1,
  );
  assert.equal(
    filterEntries([base], {
      ...emptyFilters,
      from: "1996-01-01",
      to: "1995-01-01",
    }).length,
    0,
  );
});
test("all state round trips through a shareable URL", () => {
  const f = {
    ...emptyFilters,
    year: "1995",
    from: "1995-01-01",
    to: "1995-12-31",
    types: ["BE-C23", "C172"],
    tails: ["N9230S", "N12345"],
    airport: "60J",
    search: "solo & practice",
    connection: "60J|SUT",
  };
  assert.deepEqual(
    parseState("?" + serializeState(f, "flight-1", "insights")),
    { filters: f, selected: "flight-1", view: "insights" },
  );
});
test("unknown view safely falls back to atlas", () =>
  assert.equal(parseState("?view=unknown").view, "atlas"));
test("aggregate counts logbook entries once per undirected connection", () => {
  const e = { ...base, route: ["A", "B", "A", "B", "A"] };
  const g = aggregateConnections([e, { ...e, id: "two" }], airports);
  assert.equal(g.length, 1);
  assert.equal(g[0].count, 2);
  assert.equal(g[0].entryIds.length, 2);
  assert.equal(
    filterEntries([e], { ...emptyFilters, connection: "A|B" }).length,
    1,
  );
});
test("unresolved intermediate stops never create a bridging connection", () => {
  const e = { ...base, route: ["A", "UNKNOWN", "C", "A"] };
  assert.deepEqual(
    resolvedLegs(e, airports).map((l) => [l.from.id, l.to.id]),
    [["C", "A"]],
  );
  assert.equal(aggregateConnections([e], airports).length, 1);
  assert.equal(estimatedDistance(e, airports), null);
});
test("local flight has airport but no invented route/distance", () => {
  const e = { ...base, route: ["A", "A"] };
  assert.equal(aggregateConnections([e], airports).length, 0);
  assert.equal(resolvedLegs(e, airports).length, 0);
  assert.equal(estimatedDistance(e, airports), 0);
  assert.equal(airportStats([e])[0].appearances, 2);
});
test("hours use designated totals, missing is distinct from zero", () => {
  const e = {
    ...base,
    totalHours: 0,
    categories: { solo: 10, pilot_in_command: 10 },
  };
  assert.deepEqual(summarize([base, second, e]), {
    count: 3,
    hours: 1.4,
    missing: 1,
    airports: 3,
    aircraft: 2,
  });
  const r = parse([{ ...row, total_hours: "", night: "0" }]);
  assert.equal(r.entries[0].totalHours, null);
  assert.equal(r.entries[0].categories.night, 0);
});
test("airport appearances include returns but entries count once", () => {
  const a = airportStats([base, second]).find((a) => a.id === "A")!;
  assert.equal(a.appearances, 4);
  assert.equal(a.entries, 2);
  assert.equal(a.first, "1995-06-14");
  assert.equal(a.last, "1996-03-12");
});
test("time series sorts periods and accumulates known hours", () => {
  assert.deepEqual(
    timeSeries([second, base], "year").map((s) => [
      s.label,
      s.hours,
      s.cumulative,
      s.missing,
    ]),
    [
      ["1995", 1.4, 1.4, 0],
      ["1996", 0, 1.4, 1],
    ],
  );
});
test("duplicate IDs block import", () =>
  assert.ok(parse([row, row]).errors.some((e) => e.includes("duplicate ID"))));
test("impossible dates block import", () => {
  for (const date of ["1995-02-30", "1995-13-01", "06/14/1995", "nonsense"])
    assert.ok(
      parse([{ ...row, date }]).errors.some((e) =>
        e.includes("invalid ISO date"),
      ),
    );
});
test("malformed and negative numbers block import", () => {
  for (const total_hours of ["-1", "NaN", "Infinity", "1:24", "1,4"])
    assert.ok(
      parse([{ ...row, total_hours }]).errors.some((e) =>
        e.includes("invalid non-negative"),
      ),
    );
  assert.ok(
    parse([{ ...row, landings: "1.5" }]).errors.some((e) =>
      e.includes("integer"),
    ),
  );
});
test("missing or invalid source references block import", () => {
  for (const pdf_page of ["0", "-1", "3", "1.5"])
    assert.ok(
      parse([{ ...row, pdf_page }]).errors.some((e) => e.includes("PDF page")),
    );
  assert.ok(
    parse([{ ...row, source_book_id: "missing" }]).errors.some((e) =>
      e.includes("unknown source book"),
    ),
  );
});
test("unresolved identifiers require a documented uncertainty", () => {
  assert.ok(
    parse([{ ...row, route: "60J>ZZZZ>CRE" }]).errors.some((e) =>
      e.includes("unresolved"),
    ),
  );
  const r = parse([
    {
      ...row,
      route: "60J>ZZZZ>CRE",
      transcription_notes: "Unreadable middle stop",
    },
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});
test("blank or malformed routes block import", () => {
  for (const route of ["", "60J>>CRE", "60J-SUT-CRE"])
    assert.ok(parse([{ ...row, route }]).errors.length > 0);
});
test("missing columns and malformed CSV block import", () => {
  assert.ok(
    parseLog("id,date\na,1995-06-14", books, importAirports).errors.some((e) =>
      e.includes("Missing required column"),
    ),
  );
  assert.ok(parseLog('id,date\n"bad', books, importAirports).errors.length > 0);
});
test("prepared archive has valid references", async () => {
  const config = JSON.parse(await readFile("data/catalog.json", "utf8")),
    a = JSON.parse(await readFile("data/airports.json", "utf8"));
  const result = parseLog(
    await readFile("data/flights.csv", "utf8"),
    config.books,
    a,
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.entries.length > 0);
});
test("large archive aggregation stays bounded and correct", () => {
  const entries = Array.from({ length: 20000 }, (_, i) => ({
    ...base,
    id: `e-${i}`,
  }));
  const t = performance.now();
  const filtered = filterEntries(entries, { ...emptyFilters, year: "1995" });
  assert.equal(summarize(filtered).count, 20000);
  assert.equal(aggregateConnections(filtered, airports)[0].count, 20000);
  assert.ok(performance.now() - t < 3000);
});
