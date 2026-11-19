import { useState } from "react";
import { BarChart3, TrendingUp, Plane } from "lucide-react";
import { timeSeries, hours, type Entry } from "./model";
export default function Insights({ entries }: { entries: Entry[] }) {
  const [period, setPeriod] = useState<"month" | "year">("month"),
    [group, setGroup] = useState<"type" | "tail">("type");
  const hasHours = entries.some((e) => e.totalHours !== null);
  const series = timeSeries(entries, period),
    max = Math.max(1, ...series.map((s) => (hasHours ? s.hours : s.count))),
    total = series.at(-1)?.cumulative || 1;
  const groups = new Map<
    string,
    { name: string; count: number; hours: number; missing: number }
  >();
  entries.forEach((e) => {
    const name =
      group === "type" ? e.aircraftType : e.tailNumber || "Unknown tail number";
    const g = groups.get(name) || { name, count: 0, hours: 0, missing: 0 };
    g.count++;
    g.hours += e.totalHours ?? 0;
    if (e.totalHours === null) g.missing++;
    groups.set(name, g);
  });
  const fleet = [...groups.values()].sort((a, b) => b.hours - a.hours),
    fleetMax = Math.max(1, ...fleet.map((g) => g.hours));
  return (
    <div className="insights-grid">
      <section className="chart-card wide">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TIME IN THE SKY</span>
            <h2>
              <BarChart3 size={20} />{" "}
              {hasHours ? "Recorded hours" : "Logged entries"}
            </h2>
          </div>
          <div className="segmented">
            <button
              className={period === "month" ? "active" : ""}
              onClick={() => setPeriod("month")}
            >
              Monthly
            </button>
            <button
              className={period === "year" ? "active" : ""}
              onClick={() => setPeriod("year")}
            >
              Yearly
            </button>
          </div>
        </div>
        {!entries.length ? (
          <p className="empty-inline">No entries match these filters.</p>
        ) : (
          <div
            className="bar-chart"
            role="img"
            aria-label={
              hasHours
                ? "Recorded flight hours over time"
                : "Logged entries over time"
            }
          >
            <div className="bars">
              {series.map((s) => (
                <div className="bar-column" key={s.label}>
                  <span className="bar-value">
                    {hasHours
                      ? hours(s.missing === s.count ? null : s.hours)
                      : s.count}
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar"
                      style={{
                        height: `${((hasHours ? s.hours : s.count) / max) * 100}%`,
                      }}
                      title={`${s.label}: ${hours(s.missing === s.count ? null : s.hours)} h · ${s.count} entries · ${s.missing} with missing hours`}
                    />
                  </div>
                  <span className="bar-label">
                    {period === "year"
                      ? s.label
                      : new Date(s.label + "-01T12:00:00Z").toLocaleDateString(
                          "en-US",
                          { month: "short", year: "2-digit", timeZone: "UTC" },
                        )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="chart-note">
          {!hasHours && entries.length > 0
            ? "Showing entry counts because total flight hours have not been supplied. "
            : ""}
          Recorded flight hours only. Blank hours are excluded; recorded
          categories may overlap.
        </p>
      </section>
      <section className="chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BUILDING EXPERIENCE</span>
            <h2>
              <TrendingUp size={20} /> Cumulative hours
            </h2>
          </div>
        </div>
        <div className="cumulative-value">
          {hours(
            hasHours || !entries.length
              ? (series.at(-1)?.cumulative ?? 0)
              : null,
          )}{" "}
          <span>hrs</span>
        </div>
        {series.length > 0 && hasHours && (
          <svg
            viewBox="0 0 600 170"
            role="img"
            aria-label="Cumulative recorded hours within current filters"
            className="line-chart"
          >
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#397b6d" stopOpacity=".22" />
                <stop offset="100%" stopColor="#397b6d" stopOpacity="0" />
              </linearGradient>
            </defs>
            {series.length > 1 && (
              <path
                d={`M 0 155 ${series.map((s, i) => `L ${series.length === 1 ? 300 : (i / (series.length - 1)) * 590 + 5} ${155 - (s.cumulative / total) * 140}`).join(" ")} L 595 160 Z`}
                fill="url(#area)"
              />
            )}
            <polyline
              points={series
                .map(
                  (s, i) =>
                    `${series.length === 1 ? 300 : (i / (series.length - 1)) * 590 + 5},${155 - (s.cumulative / total) * 140}`,
                )
                .join(" ")}
              fill="none"
              stroke="#397b6d"
              strokeWidth="3"
            />
            {series.map((s, i) => (
              <circle
                key={s.label}
                cx={
                  series.length === 1
                    ? 300
                    : (i / (series.length - 1)) * 590 + 5
                }
                cy={155 - (s.cumulative / total) * 140}
                r="4"
                fill="#397b6d"
              >
                <title>
                  {s.label}: {hours(s.cumulative)} hours
                </title>
              </circle>
            ))}
          </svg>
        )}
        <p className="chart-note">
          {!hasHours && entries.length > 0
            ? "Awaiting total-time transcription. "
            : ""}
          Cumulative hours for the filtered entries, not a certified lifetime
          total.
        </p>
      </section>
      <section className="chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE FLEET</span>
            <h2>
              <Plane size={20} /> Aircraft breakdown
            </h2>
          </div>
          <div className="segmented">
            <button
              className={group === "type" ? "active" : ""}
              onClick={() => setGroup("type")}
            >
              Type
            </button>
            <button
              className={group === "tail" ? "active" : ""}
              onClick={() => setGroup("tail")}
            >
              Tail
            </button>
          </div>
        </div>
        <div className="fleet-bars">
          {fleet.map((g) => (
            <div key={g.name}>
              <div className="fleet-label">
                <strong>{g.name}</strong>
                <span>
                  {g.count} entries ·{" "}
                  {hours(g.missing === g.count ? null : g.hours)} h
                  {g.missing ? ` · ${g.missing} missing` : ""}
                </span>
              </div>
              <div className="fleet-track">
                <span
                  style={{
                    width: `${((hasHours ? g.hours : g.count) / (hasHours ? fleetMax : Math.max(1, ...fleet.map((x) => x.count)))) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      <details className="chart-card wide">
        <summary>Accessible chart data</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Entries</th>
              <th>Recorded hours</th>
              <th>Missing hours</th>
              <th>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{s.count}</td>
                <td>{hours(s.missing === s.count ? null : s.hours)}</td>
                <td>{s.missing}</td>
                <td>{hours(hasHours ? s.cumulative : null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
