import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Papa from "papaparse";
import { parseLog } from "../scripts/importer.ts";
import { normalizeSourceCsv } from "../scripts/normalize-source.ts";
import { withBasePath } from "../src/urls.ts";
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
    normalizeSourceCsv(await readFile("data/flights.csv", "utf8")).csv,
    config.books,
    a,
    [],
    {
      totalTimeColumn: config.totalTimeColumn,
      airportAliases: config.airportAliases,
    },
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

test("missing tail requires a note, stays filterable, and is not counted as an identified aircraft", () => {
  assert.ok(
    parse([{ ...row, tail_number: "" }]).errors.some((e) =>
      e.includes("tail_number"),
    ),
  );
  const r = parse([
    { ...row, tail_number: "", transcription_notes: "Registration unreadable" },
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.entries[0].tailNumber, "");
  assert.equal(summarize(r.entries).aircraft, 0);
  const f = { ...emptyFilters, tails: [""] };
  assert.equal(filterEntries(r.entries, f).length, 1);
  assert.deepEqual(
    parseState("?" + serializeState(f, "", "atlas")).filters.tails,
    [""],
  );
});

test("source normalization preserves raw dates and rejects impossible US dates", async () => {
  const { normalizeSourceCsv } = await import("../scripts/normalize-source.ts");
  const result = normalizeSourceCsv(
    Papa.unparse([
      { ...row, date: "11/24/89" },
      { ...row, id: "other", date: "1/22/95" },
    ]),
  );
  assert.equal(result.rows[0].date, "1989-11-24");
  assert.equal(result.rows[0].date_original, "11/24/89");
  assert.equal(result.rows[1].date, "1995-01-22");
  assert.throws(
    () => normalizeSourceCsv(Papa.unparse([{ ...row, date: "2/30/90" }])),
    /invalid date/,
  );
  assert.equal(
    normalizeSourceCsv(result.csv).rows[0].date_original,
    "11/24/89",
  );
});

test("two-digit US years use the archive's 1989–2088 window", () => {
  const dates = [
    ["2/29/00", "2000-02-29"],
    ["12/31/88", "2088-12-31"],
    ["1/1/89", "1989-01-01"],
    ["12/31/99", "1999-12-31"],
    ["12/31/1988", "1988-12-31"],
  ];
  const { rows } = normalizeSourceCsv(
    Papa.unparse(dates.map(([date]) => ({ ...row, date }))),
  );
  assert.deepEqual(
    rows.map(({ date_original, date }) => [date_original, date]),
    dates,
  );
});

test("loaded archive preserves supplied fields, missing hours, and book-page references", async () => {
  const config = JSON.parse(await readFile("data/catalog.json", "utf8"));
  const supplied = Papa.parse<Record<string, string>>(
    await readFile("data/flights.csv", "utf8"),
    { header: true, skipEmptyLines: true },
  ).data;
  const canonical = normalizeSourceCsv(
    await readFile("data/flights.csv", "utf8"),
  ).rows;
  assert.equal(canonical.length, supplied.length);
  const byId = new Map(canonical.map((r) => [r.id, r]));
  for (const original of supplied) {
    const converted = byId.get(original.id)!;
    for (const [key, value] of Object.entries(original))
      assert.equal(
        key === "date" ? converted.date_original : converted[key],
        key === "date" ? original.date_original || value : value,
        `${original.id}: ${key}`,
      );
    assert.ok(
      config.books.some(
        (b: Book) =>
          b.id === converted.source_book_id &&
          Number(converted.pdf_page) >= 1 &&
          Number(converted.pdf_page) <= b.pageCount,
      ),
    );
  }
  const a = {
    ...JSON.parse(await readFile("data/airports.json", "utf8")),
    ...JSON.parse(await readFile("data/airport-overrides.json", "utf8")),
  };
  const result = parseLog(
    normalizeSourceCsv(await readFile("data/flights.csv", "utf8")).csv,
    config.books,
    a,
    [],
    {
      totalTimeColumn: config.totalTimeColumn,
      airportAliases: config.airportAliases,
    },
  );
  assert.deepEqual(result.errors, []);
  for (const entry of result.entries) {
    const missing = entry.route.filter((id) => !a[id]);
    if (missing.length) {
      assert.ok(entry.notes.trim(), `${entry.id}: missing airport review note`);
      assert.ok(
        result.warnings.some((warning) =>
          warning.includes(`(${entry.id}): unresolved airport(s): ${[...new Set(missing)].join(", ")}`),
        ),
        `${entry.id}: missing unresolved-airport warning`,
      );
    }
  }
  for (const e of result.entries)
    assert.equal(
      e.totalHours,
      byId.get(e.id)![config.totalTimeColumn || "total_hours"]
        ? Number(byId.get(e.id)![config.totalTimeColumn || "total_hours"])
        : null,
    );
  assert.equal(
    summarize(result.entries).aircraft,
    new Set(supplied.map((r) => r.tail_number).filter(Boolean)).size,
  );
  assert.equal(config.meta.demo, false);
});

test("configured hour source uses single-engine land without adding or falling back to categories", () => {
  const options = { totalTimeColumn: "single_engine_land" };
  const result = parseLog(
    csv([
      { ...row, total_hours: "9", single_engine_land: "1.4", night: "0.5" },
    ]),
    books,
    importAirports,
    [],
    options,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.entries[0].totalHours, 1.4);
  assert.equal(result.entries[0].original.total_hours, "9");
  assert.equal(result.entries[0].categories.single_engine_land, 1.4);
  const missing = parseLog(
    csv([{ ...row, single_engine_land: "" }]),
    books,
    importAirports,
    [],
    options,
  );
  assert.equal(missing.entries[0].totalHours, null);
  const zero = parseLog(
    csv([{ ...row, single_engine_land: "0" }]),
    books,
    importAirports,
    [],
    options,
  );
  assert.equal(zero.entries[0].totalHours, 0);
  assert.ok(
    parseLog(csv(), books, importAirports, [], options).errors.some((e) =>
      e.includes("Missing configured hours column"),
    ),
  );
});

test("8A2 aliases to 60J while preserving original routes and coalescing visits", async () => {
  const options = { airportAliases: { "8A2": "60J" } };
  const result = parseLog(
    csv([{ ...row, route: "8A2>SUT>8A2", route_original: "8A2-SUT-8A2" }]),
    books,
    importAirports,
    [],
    options,
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries[0].route, ["60J", "SUT", "60J"]);
  assert.equal(result.entries[0].routeOriginal, "8A2-SUT-8A2");
  assert.equal(result.entries[0].original.route, "8A2>SUT>8A2");
  assert.equal(
    aggregateConnections(result.entries, importAirports)[0].count,
    1,
  );
  const { canonicalizeFilters } = await import("../src/model.ts");
  const filters = canonicalizeFilters(
    { ...emptyFilters, airport: "8A2", connection: "8A2|SUT" },
    options.airportAliases,
  );
  assert.equal(filters.airport, "60J");
  assert.equal(filters.connection, "60J|SUT");
  assert.equal(filterEntries(result.entries, filters).length, 1);
});

test("search matches airport names and cities for visited stops, case-insensitively", () => {
  const catalog: Record<string, Airport> = {
    "60J": {
      ...airports.A,
      id: "60J",
      name: "Odell Williamson Municipal Airport",
      city: "Ocean Isle Beach",
    },
    CRE: {
      ...airports.B,
      id: "CRE",
      name: "Grand Strand Airport",
      city: "North Myrtle Beach",
    },
  };
  const coast = {
    ...base,
    route: ["CRE", "60J", "CRE"],
    remarks: "",
    notes: "",
  };
  const other = {
    ...base,
    id: "other",
    route: ["CRE", "CRE"],
    remarks: "",
    notes: "",
  };
  for (const search of [
    "Ocean Isle",
    "odell williamson",
    " OCEAN ISLE ",
    "60j",
  ]) {
    assert.deepEqual(
      filterEntries([coast, other], { ...emptyFilters, search }, catalog).map(
        (e) => e.id,
      ),
      [coast.id],
    );
  }
  assert.equal(
    filterEntries(
      [coast],
      { ...emptyFilters, search: "Ocean Isle", year: "1996" },
      catalog,
    ).length,
    0,
  );
  assert.equal(
    filterEntries(
      [coast],
      { ...emptyFilters, search: "Ocean Isle", tails: ["OTHER"] },
      catalog,
    ).length,
    0,
  );
  assert.equal(
    filterEntries(
      [{ ...coast, route: ["UNKNOWN"] }],
      { ...emptyFilters, search: "Ocean Isle" },
      catalog,
    ).length,
    0,
  );
  assert.equal(
    filterEntries(
      [{ ...other, remarks: "Ocean Isle visit" }],
      { ...emptyFilters, search: "Ocean Isle" },
      catalog,
    ).length,
    1,
  );
});

test("real archive city and airport-name searches include 60J entries", async () => {
  const data = JSON.parse(await readFile("public/data/logbook.json", "utf8"));
  const expected = data.entries
    .filter((e: Entry) => e.route.includes("60J"))
    .map((e: Entry) => e.id);
  const byName = filterEntries(
    data.entries,
    { ...emptyFilters, search: "Odell Williamson" },
    data.airports,
  ).map((e) => e.id);
  assert.deepEqual(byName, expected);
  const byCity = new Set(
    filterEntries(
      data.entries,
      { ...emptyFilters, search: "Ocean Isle" },
      data.airports,
    ).map((e) => e.id),
  );
  assert.ok(expected.every((id: string) => byCity.has(id)));
});

test("public asset URLs work at the origin root and a GitHub Pages repository path", () => {
  for (const base of ["/", "/Flight-Log/", "/Flight-Log"]) {
    const expected = base === "/" ? "/" : "/Flight-Log/";
    assert.equal(
      withBasePath("data/logbook.json", base),
      expected + "data/logbook.json",
    );
    assert.equal(
      withBasePath("/books/Logbook.pdf", base),
      expected + "books/Logbook.pdf",
    );
    assert.equal(withBasePath("", base), expected);
    assert.equal(
      withBasePath("/books/Logbook.pdf#page=5", base),
      expected + "books/Logbook.pdf#page=5",
    );
  }
});
