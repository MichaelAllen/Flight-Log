import { useState } from "react";
import { BarChart3, TrendingUp, Plane } from "lucide-react";
import { timeSeries, groupMetric, hours, type ChartMetric, type Entry } from "./model";
export default function Insights({ entries }: { entries: Entry[] }) {
  const [period, setPeriod] = useState<"month" | "year">("month"),
    [group, setGroup] = useState<"type" | "tail">("type");
  const [metric, setMetric] = useState<ChartMetric>("hours");
  const series = timeSeries(entries, period, metric);
  const hasValues = series.some((s) => s.missing < s.count);
  const showEntryCounts = metric === "hours" && !hasValues;
  const format = (value: number | null) =>
    metric === "hours" ? hours(value) : value?.toLocaleString() ?? "—";
  const barValue = (bucket: { count: number; value: number }) =>
    showEntryCounts ? bucket.count : bucket.value;
  const max = Math.max(1, ...series.map(barValue));
  const total = series.at(-1)?.cumulative || 1;
  const fleet = groupMetric(entries, metric, (e) =>
    group === "type" ? e.aircraftType : e.tailNumber || "Unknown tail number",
  ).sort((a, b) => barValue(b) - barValue(a));
  const fleetMax = Math.max(1, ...fleet.map(barValue));
  return (
    <div className="insights-grid">
      <div className="insights-metric segmented" role="group" aria-label="Insights chart metric">
        {(["hours", "landings"] as const).map((option) => (
          <button key={option} className={metric === option ? "active" : ""}
            aria-pressed={metric === option} onClick={() => setMetric(option)}>
            {option === "hours" ? "Hours" : "Landings"}
          </button>
        ))}
      </div>
      <section className="chart-card wide">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FLIGHT ACTIVITY</span>
            <h2>
              <BarChart3 size={20} />{" "}
              {showEntryCounts ? "Logged entries" : `Recorded ${metric}`}
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
              showEntryCounts ? "Logged entries over time" : `Recorded ${metric} over time`
            }
          >
            <div className="bars">
              {series.map((s) => (
                <div className="bar-column" key={s.label}>
                  <span className="bar-value">
                    {showEntryCounts ? s.count : format(s.missing === s.count ? null : s.value)}
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar"
                      style={{
                        height: `${(barValue(s) / max) * 100}%`,
                      }}
                      title={`${s.label}: ${format(s.missing === s.count ? null : s.value)} ${metric} · ${s.count} entries · ${s.missing} with missing ${metric}`}
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
          {showEntryCounts && entries.length > 0
            ? "Showing entry counts because total flight hours have not been supplied. "
            : ""}
          Blank {metric} are excluded.
        </p>
      </section>
      <section className="chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">BUILDING EXPERIENCE</span>
            <h2>
              <TrendingUp size={20} /> Cumulative {metric}
            </h2>
          </div>
        </div>
        <div className="cumulative-value">
          {format(
            hasValues || !entries.length
              ? (series.at(-1)?.cumulative ?? 0)
              : null,
          )}{" "}
          <span>{metric === "hours" ? "hrs" : "landings"}</span>
        </div>
        {series.length > 0 && hasValues && (
          <svg
            viewBox="0 0 600 170"
            role="img"
            aria-label={`Cumulative recorded ${metric} within current filters`}
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
                  {s.label}: {format(s.cumulative)} {metric}
                </title>
              </circle>
            ))}
          </svg>
        )}
        <p className="chart-note">
          {showEntryCounts && entries.length > 0
            ? "Awaiting total-time transcription. "
            : ""}
          Total recorded {metric} for the filtered entries.
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
            <div key={g.label}>
              <div className="fleet-label">
                <strong>{g.label}</strong>
                <span>
                  {g.count} entries ·{" "}
                  {format(g.missing === g.count ? null : g.value)} {metric === "hours" ? "h" : "landings"}
                  {g.missing ? ` · ${g.missing} missing` : ""}
                </span>
              </div>
              <div className="fleet-track">
                <span
                  style={{
                    width: `${(barValue(g) / fleetMax) * 100}%`,
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
              <th>Recorded {metric}</th>
              <th>Missing {metric}</th>
              <th>Cumulative {metric}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{s.count}</td>
                <td>{format(s.missing === s.count ? null : s.value)}</td>
                <td>{s.missing}</td>
                <td>{format(hasValues ? s.cumulative : null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
