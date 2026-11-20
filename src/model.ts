export interface Airport {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}
export function airportLabel(airport: Airport | undefined, field: "name" | "city") {
  return airport && [airport[field], airport.state].filter(Boolean).join(", ");
}

export interface Book {
  id: string;
  title: string;
  pdf: string;
  pageCount: number;
  privacyReviewed: boolean;
}
export interface Entry {
  id: string;
  date: string;
  aircraftType: string;
  tailNumber: string;
  route: string[];
  routeOriginal: string;
  totalHours: number | null;
  remarks: string;
  bookId: string;
  pdfPage: number;
  printedPage: string;
  sourceRow: string;
  notes: string;
  categories: Record<string, number | null>;
  original: Record<string, string>;
}
export interface Dataset {
  entries: Entry[];
  airports: Record<string, Airport>;
  books: Book[];
  meta: {
    demo: boolean;
    title: string;
    description: string;
    airportSource: string;
    importNotice?: string;
    totalTimeColumn?: string;
    airportAliases?: Record<string, string>;
  };
  warnings: string[];
}
export interface Filters {
  year: string;
  from: string;
  to: string;
  types: string[];
  tails: string[];
  airport: string;
  search: string;
  connection: string;
  notesOnly: boolean;
}
export const emptyFilters: Filters = {
  year: "",
  from: "",
  to: "",
  types: [],
  tails: [],
  airport: "",
  search: "",
  connection: "",
  notesOnly: false,
};
export function connectionKey(a: string, b: string) {
  return [a, b].sort().join("|");
}
export function canonicalizeFilters(
  f: Filters,
  aliases: Record<string, string> = {},
): Filters {
  return {
    ...f,
    airport: aliases[f.airport] || f.airport,
    connection: f.connection
      ? f.connection
          .split("|")
          .map((id) => aliases[id] || id)
          .sort()
          .join("|")
      : "",
  };
}
export function hasConnection(e: Entry, key: string) {
  return e.route.some(
    (a, i) =>
      i > 0 && a !== e.route[i - 1] && connectionKey(a, e.route[i - 1]) === key,
  );
}
export function filterEntries(
  entries: Entry[],
  f: Filters,
  airports: Record<string, Airport> = {},
) {
  const q = f.search.trim().toLowerCase();
  const matchingAirports = new Set(
    q
      ? Object.values(airports)
          .filter((a) =>
            [a.name, a.city].some((value) => value.toLowerCase().includes(q)),
          )
          .map((a) => a.id)
      : [],
  );
  return entries.filter(
    (e) =>
      (!f.year || e.date.startsWith(f.year + "-")) &&
      (!f.from || e.date >= f.from) &&
      (!f.to || e.date <= f.to) &&
      (!f.types.length || f.types.includes(e.aircraftType)) &&
      (!f.tails.length || f.tails.includes(e.tailNumber)) &&
      (!f.airport || e.route.includes(f.airport)) &&
      (!f.notesOnly || Boolean(e.notes?.trim())) &&
      (!f.connection || hasConnection(e, f.connection)) &&
      (!q ||
        e.route.some((id) => matchingAirports.has(id)) ||
        [
          e.id,
          e.date,
          e.aircraftType,
          e.tailNumber,
          e.remarks,
          e.route.join(" "),
          e.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
}
export function parseState(search: string): {
  filters: Filters;
  selected: string;
  view: string;
} {
  const p = new URLSearchParams(search);
  return {
    filters: {
      year: p.get("year") || "",
      from: p.get("from") || "",
      to: p.get("to") || "",
      types: p.getAll("type"),
      tails: p.getAll("tail"),
      airport: p.get("airport") || "",
      search: p.get("q") || "",
      notesOnly: p.get("notes") === "1",
      connection: p.get("connection") || "",
    },
    selected: p.get("entry") || "",
    view: ["atlas", "insights", "airports"].includes(p.get("view") || "")
      ? p.get("view")!
      : "atlas",
  };
}
export function serializeState(f: Filters, selected: string, view: string) {
  const p = new URLSearchParams();
  for (const [k, v] of [
    ["year", f.year],
    ["from", f.from],
    ["to", f.to],
    ["airport", f.airport],
    ["q", f.search],
    ["connection", f.connection],
    ["notes", f.notesOnly ? "1" : ""],
    ["entry", selected],
    ["view", view === "atlas" ? "" : view],
  ])
    if (v) p.set(k, v);
  f.types.forEach((v) => p.append("type", v));
  f.tails.forEach((v) => p.append("tail", v));
  return p.toString();
}
export function summarize(entries: Entry[]) {
  const known = entries.filter((e) => e.totalHours !== null);
  return {
    count: entries.length,
    hours: known.reduce((s, e) => s + e.totalHours!, 0),
    missing: entries.length - known.length,
    airports: new Set(entries.flatMap((e) => e.route)).size,
    aircraft: new Set(entries.map((e) => e.tailNumber).filter(Boolean)).size,
  };
}
export function aggregateConnections(
  entries: Entry[],
  airports: Record<string, Airport>,
) {
  const groups = new Map<
    string,
    { key: string; from: string; to: string; count: number; entryIds: string[] }
  >();
  for (const e of entries) {
    const seen = new Set<string>();
    for (let i = 1; i < e.route.length; i++) {
      const a = e.route[i - 1],
        b = e.route[i];
      if (a === b || !airports[a] || !airports[b]) continue;
      const key = connectionKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = groups.get(key) || {
        key,
        from: a,
        to: b,
        count: 0,
        entryIds: [],
      };
      g.count++;
      g.entryIds.push(e.id);
      groups.set(key, g);
    }
  }
  return [...groups.values()];
}
export function resolvedLegs(e: Entry, airports: Record<string, Airport>) {
  return e.route.slice(1).flatMap((b, i) => {
    const a = e.route[i];
    return a !== b && airports[a] && airports[b]
      ? [{ from: airports[a], to: airports[b], index: i + 1 }]
      : [];
  });
}
export function estimatedDistance(e: Entry, airports: Record<string, Airport>) {
  if (e.route.some((id) => !airports[id])) return null;
  return resolvedLegs(e, airports).reduce((s, l) => {
    const r = Math.PI / 180,
      a = l.from,
      b = l.to;
    const h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) *
        Math.cos(b.lat * r) *
        Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
    return s + 3440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }, 0);
}
export function airportStats(entries: Entry[]) {
  const m = new Map<
    string,
    {
      id: string;
      appearances: number;
      entries: number;
      first: string;
      last: string;
    }
  >();
  for (const e of entries) {
    const seen = new Set<string>();
    for (const id of e.route) {
      const a = m.get(id) || {
        id,
        appearances: 0,
        entries: 0,
        first: e.date,
        last: e.date,
      };
      a.appearances++;
      if (!seen.has(id)) a.entries++;
      seen.add(id);
      a.first = e.date < a.first ? e.date : a.first;
      a.last = e.date > a.last ? e.date : a.last;
      m.set(id, a);
    }
  }
  return [...m.values()].sort(
    (a, b) => b.entries - a.entries || a.id.localeCompare(b.id),
  );
}
export function timeSeries(entries: Entry[], group: "month" | "year") {
  const m = new Map<
    string,
    { label: string; hours: number; count: number; missing: number }
  >();
  for (const e of entries) {
    const label = e.date.slice(0, group === "month" ? 7 : 4);
    const b = m.get(label) || { label, hours: 0, count: 0, missing: 0 };
    b.count++;
    b.hours += e.totalHours ?? 0;
    if (e.totalHours === null) b.missing++;
    m.set(label, b);
  }
  let cumulative = 0;
  return [...m.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((b) => ({ ...b, cumulative: (cumulative += b.hours) }));
}
export const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
export const hours = (v: number | null) => (v === null ? "—" : v.toFixed(1));
