import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Plane,
  Map as MapIcon,
  BarChart3,
  MapPin,
  Search,
  ChevronDown,
  SlidersHorizontal,
  X,
  BookOpen,
  ExternalLink,
  ArrowUpRight,
  Share2,
  Check,
  Navigation,
  Clock,
  Layers,
  Info,
  RotateCcw,
  Download,
} from "lucide-react";
import {
  aggregateConnections,
  airportStats,
  emptyFilters,
  estimatedDistance,
  filterEntries,
  formatDate,
  hours,
  parseState,
  serializeState,
  summarize,
  type Dataset,
  canonicalizeFilters,
  type Entry,
  type Filters,
} from "./model";
import MapView from "./MapView";
import Insights from "./Insights";
import { siteUrl } from "./urls";
const PdfViewer = lazy(() => import("./PdfViewer"));
const initial = parseState(window.location.search);
function MultiFilter({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <details className="multi-filter">
      <summary>
        {label}
        {selected.length > 0 && (
          <span className="filter-count">{selected.length}</span>
        )}
        <ChevronDown size={14} />
      </summary>
      <div className="multi-menu">
        <button className="text-button" onClick={() => onChange([])}>
          All {label.toLowerCase()}
        </button>
        {values.map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={() =>
                onChange(
                  selected.includes(v)
                    ? selected.filter((x) => x !== v)
                    : [...selected, v],
                )
              }
            />
            {v || "Unknown tail number"}
          </label>
        ))}
      </div>
    </details>
  );
}
function Route({ route }: { route: string[] }) {
  return (
    <span className="route-codes">
      {route.map((a, i) => (
        <span key={i}>
          {i > 0 && <span className="route-arrow">→</span>}
          {a}
        </span>
      ))}
    </span>
  );
}
function EntryDetails({
  entry,
  data,
  onClose,
  onPdf,
}: {
  entry: Entry;
  data: Dataset;
  onClose: () => void;
  onPdf: () => void;
}) {
  const book = data.books.find((b) => b.id === entry.bookId),
    distance = estimatedDistance(entry, data.airports);
  const unresolved = entry.route.filter((id) => !data.airports[id]);
  return (
    <aside className="entry-detail" aria-label="Selected entry details">
      <div className="detail-top">
        <span className="eyebrow">FROM THE LOGBOOK</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close entry details"
        >
          <X size={18} />
        </button>
      </div>
      <h2>{formatDate(entry.date)}</h2>
      <p className="detail-aircraft">
        <Plane size={17} />
        {entry.aircraftType}
        <span>·</span>
        <strong>{entry.tailNumber || "Unknown tail number"}</strong>
      </p>
      <div className="detail-route">
        <Route route={entry.route} />
      </div>
      <ol className="stop-list">
        {entry.route.map((id, i) => (
          <li key={`${id}-${i}`}>
            <span className="stop-number">{i + 1}</span>
            <div>
              <strong>{id}</strong>
              <span>{data.airports[id]?.name || "Unresolved airport"}</span>
            </div>
            {i === 0 ? (
              <small>DEPARTURE</small>
            ) : i === entry.route.length - 1 ? (
              <small>RETURN / ARRIVAL</small>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="detail-stats">
        <div>
          <span>RECORDED TIME</span>
          <strong>
            {hours(entry.totalHours)} <small>hrs</small>
          </strong>
        </div>
        <div>
          <span>EST. CONNECTION DISTANCE</span>
          <strong>
            {distance === null ? "—" : Math.round(distance)} <small>nm</small>
          </strong>
        </div>
      </div>
      <p className="tiny-note">
        Airport-to-airport estimate. Connections do not show the actual flight
        track.
      </p>
      {entry.totalHours === null && (
        <p className="notice">
          Total time was not recorded or has not been transcribed.
        </p>
      )}
      <div className="detail-section">
        <span className="eyebrow">REMARKS & ENDORSEMENTS</span>
        <p>{entry.remarks || "No remarks recorded."}</p>
      </div>
      {entry.notes && (
        <div className="notice">
          <Info size={16} />
          <div>
            <strong>
              Transcription note
              {entry.original.handwriting_confidence
                ? ` · ${entry.original.handwriting_confidence} confidence`
                : ""}
            </strong>
            <p>{entry.notes}</p>
          </div>
        </div>
      )}
      {unresolved.length > 0 && (
        <p className="notice">
          Unresolved: {[...new Set(unresolved)].join(", ")}. Connections
          touching these stops are omitted.
        </p>
      )}
      <details className="category-details">
        <summary>
          Recorded categories & original data <ChevronDown size={14} />
        </summary>
        <dl>
          {Object.entries(entry.original)
            .filter(([, v]) => v !== "")
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k.replaceAll("_", " ")}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </details>
      <div className="source-card">
        <BookOpen size={24} />
        <div>
          <strong>{book?.title || entry.bookId}</strong>
          <span>
            PDF page {entry.pdfPage}
            {entry.printedPage ? ` · Printed ${entry.printedPage}` : ""}
            {entry.sourceRow ? ` · Row ${entry.sourceRow}` : ""}
          </span>
        </div>
      </div>
      <button
        className="primary-button source-button"
        onClick={onPdf}
        disabled={!book}
      >
        <BookOpen size={17} />
        View original page
        <ExternalLink size={15} />
      </button>
    </aside>
  );
}
export default function App() {
  const [data, setData] = useState<Dataset | null>(null),
    [error, setError] = useState(""),
    [filters, setFilters] = useState<Filters>(initial.filters),
    [selectedId, setSelectedId] = useState(initial.selected),
    [view, setView] = useState(initial.view),
    [pdfOpen, setPdfOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [listLimit, setListLimit] = useState(60),
    [advanced, setAdvanced] = useState(false),
    [sort, setSort] = useState("newest");
  useEffect(() => {
    const c = new AbortController();
    fetch(siteUrl("data/logbook.json"), { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((loaded: Dataset) => {
        setData(loaded);
        setFilters((f) => canonicalizeFilters(f, loaded.meta.airportAliases));
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            "The logbook could not be loaded. Please refresh to try again.",
          );
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const handler = () => {
      const s = parseState(location.search);
      setFilters(canonicalizeFilters(s.filters, data?.meta.airportAliases));
      setSelectedId(s.selected);
      setView(s.view);
      setPdfOpen(false);
    };
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  }, [data]);
  useEffect(() => {
    const validId =
      data &&
      filterEntries(data.entries, filters, data.airports).some(
        (e) => e.id === selectedId,
      )
        ? selectedId
        : "";
    if (selectedId && !data) return;
    const query = serializeState(filters, validId, view);
    const url = location.pathname + (query ? "?" + query : "") + location.hash;
    if (location.pathname + location.search + location.hash !== url)
      history.pushState(null, "", url);
  }, [filters, selectedId, view, data]);
  const entries = useMemo(
    () => (data ? filterEntries(data.entries, filters, data.airports) : []),
    [data, filters],
  );
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) =>
        sort === "oldest"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
      ),
    [entries, sort],
  );
  const connections = useMemo(
    () =>
      data
        ? aggregateConnections(entries, data.airports).sort(
            (a, b) => b.count - a.count,
          )
        : [],
    [entries, data],
  );
  const selected = entries.find((e) => e.id === selectedId);
  const stats = summarize(entries);
  const airports = useMemo(() => airportStats(entries), [entries]);
  useEffect(() => {
    setListLimit(60);
    if (data && selectedId && !entries.some((e) => e.id === selectedId)) {
      setSelectedId("");
      setPdfOpen(false);
    }
  }, [entries, data, selectedId]);
  function update(p: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...p }));
  }
  function select(id: string) {
    setSelectedId(id);
    setPdfOpen(false);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      window.prompt("Copy this link to share this view:", location.href);
    }
  }
  if (error)
    return (
      <main className="loading-page">
        <Plane size={40} />
        <h1>The Flight Log</h1>
        <p role="alert">{error}</p>
        <button className="primary-button" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="loading-page">
        <Plane size={40} />
        <h1>The Flight Log</h1>
        <p role="status">Opening the logbook…</p>
      </main>
    );
  const allYears = [
      ...new Set(data.entries.map((e) => e.date.slice(0, 4))),
    ].sort(),
    types = [...new Set(data.entries.map((e) => e.aircraftType))].sort(),
    tails = [...new Set(data.entries.map((e) => e.tailNumber))].sort(),
    allAirports = [...new Set(data.entries.flatMap((e) => e.route))].sort();
  const hasFilters = Object.entries(filters).some(([, v]) =>
    Array.isArray(v) ? v.length : !!v,
  );
  const book = selected
    ? data.books.find((b) => b.id === selected.bookId)
    : undefined;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to logbook
      </a>
      <header className="site-header">
        <a
          href={siteUrl("")}
          className="brand"
          aria-label="The Flight Log home"
        >
          <span className="brand-symbol">
            <Plane size={24} strokeWidth={1.5} />
          </span>
          <span>
            The Flight Log<small>A LIFE IN THE SKY</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {[
            { id: "atlas", label: "Flight atlas", icon: MapIcon },
            { id: "insights", label: "Insights", icon: BarChart3 },
            { id: "airports", label: "Airports", icon: MapPin },
          ].map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "nav-link active" : "nav-link"}
              onClick={() => setView(n.id)}
            >
              <n.icon size={17} />
              {n.label}
            </button>
          ))}
        </nav>
        <button
          className="share-button"
          aria-label="Share current view"
          onClick={share}
        >
          {copied ? <Check size={16} /> : <Share2 size={16} />}
          <span>{copied ? "Link copied" : "Share view"}</span>
        </button>
      </header>
      <main id="main" className="page-shell">
        <section className="page-heading">
          <div>
            <div className="eyebrow heading-eyebrow">
              <span /> THE JOURNEYS, PRESERVED
            </div>
            <h1>
              {view === "atlas"
                ? "Every flight has a story."
                : view === "insights"
                  ? "A lifetime, in flight."
                  : "Places along the way."}
            </h1>
            <p>
              {view === "atlas"
                ? "Follow the routes. Explore the aircraft. Rediscover the memories."
                : view === "insights"
                  ? "A different perspective on the hours, aircraft, and years."
                  : "From familiar runways to first-time arrivals."}
            </p>
          </div>
          <div className="archive-mark">
            <BookOpen size={19} />
            <span>
              THE FAMILY ARCHIVE
              <small>
                {allYears[0]} — {allYears.at(-1)}
              </small>
            </span>
          </div>
        </section>
        {data.meta.demo && (
          <div className="demo-banner">
            <Info size={16} />
            <span>
              <strong>Demonstration archive.</strong> These illustrative entries
              and source pages are not a transcription of your dad’s logbook.
            </span>
            <a href={siteUrl("data/flights-template.csv")} download>
              CSV template <Download size={14} />
            </a>
          </div>
        )}
        {data.meta.importNotice && (
          <div className="demo-banner">
            <Info size={16} />
            <span>
              <strong>Logbook loaded.</strong> {data.meta.importNotice}
            </span>
          </div>
        )}
        <section className="filter-bar" aria-label="Logbook filters">
          <div className="filter-label">
            <SlidersHorizontal size={17} />
            <span>Explore</span>
          </div>
          <label className="select-wrap">
            <span className="sr-only">Year</span>
            <select
              value={filters.year}
              onChange={(e) => update({ year: e.target.value })}
            >
              <option value="">All years</option>
              {allYears.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <MultiFilter
            label="Aircraft type"
            values={types}
            selected={filters.types}
            onChange={(types) => update({ types })}
          />
          <MultiFilter
            label="Tail number"
            values={tails}
            selected={filters.tails}
            onChange={(tails) => update({ tails })}
          />
          <label className="select-wrap airport-select">
            <span className="sr-only">Airport visited</span>
            <select
              value={filters.airport}
              onChange={(e) => update({ airport: e.target.value })}
            >
              <option value="">All airports</option>
              {allAirports.map((id) => (
                <option key={id} value={id}>
                  {id} · {data.airports[id]?.city || "Unresolved"}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <button
            className={
              "filter-more " +
              (advanced || filters.from || filters.to ? "active" : "")
            }
            onClick={() => setAdvanced((v) => !v)}
            aria-expanded={advanced}
          >
            Dates
            <ChevronDown size={14} />
          </button>
          <label className="search-wrap">
            <Search size={16} />
            <input
              aria-label="Search entries"
              placeholder="Search the logbook…"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
            {filters.search && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => update({ search: "" })}
              >
                <X size={14} />
              </button>
            )}
          </label>
          {hasFilters && (
            <button
              className="clear-filters"
              onClick={() => setFilters({ ...emptyFilters })}
              title="Clear all filters"
              aria-label="Clear all filters"
            >
              <RotateCcw size={16} />
            </button>
          )}
        </section>
        {advanced && (
          <div className="date-filters">
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(e) => update({ from: e.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(e) => update({ to: e.target.value })}
              />
            </label>
            {filters.from && filters.to && filters.from > filters.to && (
              <span role="status">
                Choose an end date on or after the start date.
              </span>
            )}
          </div>
        )}
        {filters.connection && (
          <div className="connection-chip">
            Connection: {filters.connection.replace("|", " ↔ ")}
            <button
              aria-label="Clear connection filter"
              onClick={() => update({ connection: "" })}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <section className="stats-strip" aria-label="Filtered logbook totals">
          <div>
            <span className="stat-icon">
              <Navigation size={20} />
            </span>
            <div>
              <strong>{stats.count}</strong>
              <span>Logged entries</span>
            </div>
          </div>
          <div>
            <span className="stat-icon">
              <Clock size={20} />
            </span>
            <div>
              <strong>
                {hours(
                  stats.count > 0 && stats.missing === stats.count
                    ? null
                    : stats.hours,
                )}
                <small>hrs</small>
              </strong>
              <span>
                Recorded flight time
                {stats.missing > 0 ? ` · ${stats.missing} missing` : ""}
              </span>
            </div>
          </div>
          <div>
            <span className="stat-icon">
              <MapPin size={20} />
            </span>
            <div>
              <strong>{stats.airports}</strong>
              <span>
                Airport identifiers
                {airports.some((a) => !data.airports[a.id])
                  ? " · includes unresolved"
                  : ""}
              </span>
            </div>
          </div>
          <div>
            <span className="stat-icon">
              <Plane size={20} />
            </span>
            <div>
              <strong>{stats.aircraft}</strong>
              <span>
                Identified aircraft
                {entries.some((e) => !e.tailNumber)
                  ? " · unknown tail present"
                  : ""}
              </span>
            </div>
          </div>
        </section>
        {view === "atlas" && (
          <>
            <div className="atlas-layout">
              <div className="map-column">
                <MapView
                  entries={entries}
                  selected={selected}
                  airports={data.airports}
                  onAirport={(airport) => update({ airport })}
                  onConnection={(connection) => {
                    setSelectedId("");
                    update({ connection });
                  }}
                />
                <div className="map-caption">
                  <Info size={14} />
                  <span>
                    A map of recorded connections, not actual flight tracks.
                  </span>
                  <span className="caption-right">
                    SELECT A ROUTE TO EXPLORE
                  </span>
                </div>
                <details className="connection-list">
                  <summary>
                    Explore connections <span>{connections.length}</span>
                    <ChevronDown size={14} />
                  </summary>
                  <div>
                    {connections.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => {
                          setSelectedId("");
                          update({ connection: c.key });
                        }}
                      >
                        {c.from} ↔ {c.to}
                        <span>
                          {c.count} {c.count === 1 ? "entry" : "entries"}
                        </span>
                      </button>
                    ))}
                    {!connections.length && (
                      <p>No resolved connections in this selection.</p>
                    )}
                  </div>
                </details>
              </div>
              <section className="flight-list-panel">
                <div className="list-heading">
                  <div>
                    <span className="eyebrow">THE LOGBOOK</span>
                    <h2>
                      Flight entries <span>{entries.length}</span>
                    </h2>
                  </div>
                  <label className="select-wrap sort-select">
                    <span className="sr-only">Sort entries</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                    <ChevronDown size={12} />
                  </label>
                </div>
                <div className="flight-list" aria-live="polite">
                  {sorted.slice(0, listLimit).map((e) => (
                    <button
                      key={e.id}
                      className={
                        "flight-row " +
                        (selected?.id === e.id ? "selected" : "")
                      }
                      onClick={() => select(e.id)}
                      aria-pressed={selected?.id === e.id}
                    >
                      <div className="flight-date">
                        <span>{formatDate(e.date)}</span>
                        <span className="flight-hours">
                          {hours(e.totalHours)} <small>h</small>
                        </span>
                      </div>
                      <Route route={e.route} />
                      <div className="flight-meta">
                        <span>
                          <Plane size={13} />
                          {e.aircraftType}
                          <span className="meta-dot">·</span>
                          {e.tailNumber || "Unknown tail number"}
                        </span>
                        <ArrowUpRight size={16} />
                      </div>
                      {e.notes && (
                        <span className="review-tag">Transcription note</span>
                      )}
                    </button>
                  ))}
                  {!entries.length && (
                    <div className="empty-state">
                      <Search size={30} />
                      <h3>No entries found</h3>
                      <p>Try another year, aircraft, or airport.</p>
                      <button
                        className="text-button"
                        onClick={() => setFilters({ ...emptyFilters })}
                      >
                        Clear all filters
                      </button>
                    </div>
                  )}
                  {entries.length > listLimit && (
                    <button
                      className="load-more"
                      onClick={() => setListLimit((n) => n + 60)}
                    >
                      Show 60 more entries
                    </button>
                  )}
                </div>
                <div className="list-footer">
                  <span className="live-dot" />
                  {selected
                    ? "ENTRY SELECTED"
                    : "SELECT AN ENTRY TO SEE ITS STORY"}
                  <Layers size={15} />
                </div>
              </section>
            </div>
            {selected ? (
              <EntryDetails
                entry={selected}
                data={data}
                onClose={() => {
                  setSelectedId("");
                  setPdfOpen(false);
                }}
                onPdf={() => setPdfOpen(true)}
              />
            ) : (
              <section className="explore-prompt">
                <span className="prompt-icon">
                  <BookOpen size={25} strokeWidth={1.4} />
                </span>
                <div>
                  <h3>More than lines on a map.</h3>
                  <p>
                    Select a flight to discover its stops, handwritten remarks,
                    and original logbook page.
                  </p>
                </div>
                <span className="prompt-decoration">
                  60J <span>········</span> SUT <span>········</span> CRE
                </span>
              </section>
            )}
          </>
        )}
        {view === "insights" && <Insights entries={entries} />}{" "}
        {view === "airports" && (
          <section className="airports-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">THE AIRPORT EXPLORER</span>
                <h2>A collection of arrivals</h2>
              </div>
              <span>{airports.length} airport identifiers</span>
            </div>
            <p className="chart-note">
              Appearances count each recorded stop, including returns. Entries
              count each logbook row once per airport.
            </p>
            <div className="airport-grid">
              {airports.map((a) => {
                const place = data.airports[a.id];
                return (
                  <button
                    className="airport-card"
                    key={a.id}
                    onClick={() => {
                      update({ airport: a.id });
                      setView("atlas");
                    }}
                  >
                    <div className="airport-card-top">
                      <span>{a.id}</span>
                      <ArrowUpRight size={20} />
                    </div>
                    <h3>{place?.name || "Unresolved airport"}</h3>
                    <p>
                      {place
                        ? [place.city, place.state].filter(Boolean).join(", ")
                        : "Needs historical review"}
                    </p>
                    <div className="airport-card-stats">
                      <span>
                        <strong>{a.entries}</strong> entries
                      </span>
                      <span>
                        <strong>{a.appearances}</strong> appearances
                      </span>
                    </div>
                    <small>
                      {formatDate(a.first)} — {formatDate(a.last)}
                    </small>
                  </button>
                );
              })}
            </div>
            {!airports.length && (
              <p className="empty-inline">No airports match these filters.</p>
            )}
          </section>
        )}
        <footer className="site-footer">
          <span>
            <Plane size={15} />
            The Flight Log<span className="footer-divider">/</span>A family
            history, kept aloft.
          </span>
          <span>
            {data.meta.demo
              ? "ILLUSTRATIVE DATA · DEMO SOURCE PAGES"
              : "PRESERVED FROM THE ORIGINAL LOGBOOKS"}
          </span>
        </footer>
        <details className="about-data">
          <summary>About the data & map</summary>
          <p>
            {data.meta.airportSource}{" "}
            <a
              href="https://ourairports.com/data/"
              target="_blank"
              rel="noreferrer"
            >
              Airport data source
            </a>
            . Basemap by{" "}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>{" "}
            with{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap
            </a>{" "}
            contributors. Airports and aircraft are identified as transcribed;
            historical identifiers require review. Blank hours are excluded from
            totals.
          </p>
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </details>
      </main>
      {pdfOpen && selected && book && (
        <Suspense
          fallback={
            <div className="loading-overlay" role="status">
              Opening original record…
            </div>
          }
        >
          <PdfViewer
            entry={selected}
            book={book}
            onClose={() => setPdfOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
