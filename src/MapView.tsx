import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(mapWorkerUrl);
import { Compass, Maximize, MapPin } from "lucide-react";
import type { FeatureCollection } from "geojson";
import {
  airportLabel,
  aggregateConnections,
  resolvedLegs,
  type Entry,
  type Airport,
} from "./model";
interface Props {
  entries: Entry[];
  selected?: Entry;
  airports: Record<string, Airport>;
  onAirport: (id: string) => void;
  onConnection: (id: string) => void;
}
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
export default function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    markers = useRef<maplibregl.Marker[]>([]),
    latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [tileWarning, setTileWarning] = useState(false);
  function fit() {
    const ids = [
      ...new Set(
        (latest.current.selected
          ? [latest.current.selected]
          : latest.current.entries
        ).flatMap((e) => e.route),
      ),
    ];
    const coords = ids.map((id) => latest.current.airports[id]).filter(Boolean);
    if (!coords.length) return;
    const bounds = new maplibregl.LngLatBounds();
    coords.forEach((a) => bounds.extend([a.lon, a.lat]));
    map.current?.fitBounds(bounds, { padding: 80, maxZoom: 9, duration: 600 });
  }
  useEffect(() => {
    if (!host.current) return;
    let m: maplibregl.Map;
    let alive = true;
    try {
      m = new maplibregl.Map({
        container: host.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#e7eee9" },
            },
          ],
        },
        center: [-78.6, 34.4],
        zoom: 6.3,
        attributionControl: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = m;
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    m.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    m.on("error", () => {
      if (alive) setTileWarning(true);
    });
    const controller = new AbortController();
    m.on("load", () => {
      if (!alive) return;
      // Add the basemap under the route layers. Failed tiles never prevent route interaction.
      fetch("https://tiles.openfreemap.org/styles/positron", {
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((style) => {
          if (!alive) return;
          for (const [id, source] of Object.entries(style.sources))
            if (!m.getSource(id))
              m.addSource(id, source as maplibregl.SourceSpecification);
          if (style.glyphs) m.setGlyphs(style.glyphs);
          for (const layer of style.layers) {
            if (
              layer.type === "background" ||
              (layer.type === "symbol" &&
                (!layer.layout?.["text-field"] || layer.layout?.["icon-image"]))
            )
              continue;
            try {
              m.addLayer(layer, "route-halo");
            } catch {
              /* optional basemap detail */
            }
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError" && alive) setTileWarning(true);
        });
      for (const id of ["connections", "selected", "airports"])
        m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({
        id: "route-halo",
        type: "line",
        source: "connections",
        paint: {
          "line-color": "#fff",
          "line-width": ["+", 3, ["*", 1.5, ["sqrt", ["get", "count"]]]],
          "line-opacity": 0.65,
        },
      });
      m.addLayer({
        id: "routes",
        type: "line",
        source: "connections",
        paint: {
          "line-color": "#33776c",
          "line-width": ["+", 1.3, ["*", 1.2, ["sqrt", ["get", "count"]]]],
          "line-opacity": 0.65,
        },
      });
      m.addLayer({
        id: "route-hit",
        type: "line",
        source: "connections",
        paint: { "line-width": 20, "line-opacity": 0 },
      });
      m.addLayer({
        id: "selected-halo",
        type: "line",
        source: "selected",
        paint: { "line-color": "#fff", "line-width": 7 },
      });
      m.addLayer({
        id: "selected-route",
        type: "line",
        source: "selected",
        paint: { "line-color": "#d17743", "line-width": 3.5 },
      });
      m.addLayer({
        id: "airport-dot",
        type: "circle",
        source: "airports",
        paint: {
          "circle-color": "#fff",
          "circle-stroke-color": "#285d55",
          "circle-stroke-width": 2.5,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 9, 7],
        },
      });
      m.on("click", "route-hit", (e) => {
        const key = e.features?.[0]?.properties?.key;
        if (key) latest.current.onConnection(key);
      });
      m.on("mouseenter", "route-hit", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "route-hit", () => {
        m.getCanvas().style.cursor = "";
      });
      m.on("click", "airport-dot", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) latest.current.onAirport(id);
      });
      setReady(true);
    });
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(host.current);
    return () => {
      alive = false;
      controller.abort();
      observer.disconnect();
      markers.current.forEach((x) => x.remove());
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const groups = aggregateConnections(props.entries, props.airports);
    (m.getSource("connections") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: groups.map((g) => ({
        type: "Feature",
        properties: { ...g, entryIds: g.entryIds.join(",") },
        geometry: {
          type: "LineString",
          coordinates: [
            [props.airports[g.from].lon, props.airports[g.from].lat],
            [props.airports[g.to].lon, props.airports[g.to].lat],
          ],
        },
      })),
    });
    const selected = props.selected;
    const legs = selected ? resolvedLegs(selected, props.airports) : [];
    (m.getSource("selected") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: legs.map((l) => ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [l.from.lon, l.from.lat],
            [l.to.lon, l.to.lat],
          ],
        },
      })),
    });
    const ids = [...new Set(props.entries.flatMap((e) => e.route))];
    (m.getSource("airports") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: ids
        .filter((id) => props.airports[id])
        .map((id) => ({
          type: "Feature",
          properties: { id },
          geometry: {
            type: "Point",
            coordinates: [props.airports[id].lon, props.airports[id].lat],
          },
        })),
    });
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const labels = selected ? [...new Set(selected.route)] : ids;
    labels.forEach((id) => {
      const a = props.airports[id];
      if (!a) return;
      const el = document.createElement("button");
      el.className = "airport-label" + (selected ? " selected" : "");
      const stops = selected
        ? selected.route.flatMap((x, i) => (x === id ? [i + 1] : []))
        : [];
      el.textContent = stops.length ? `${stops.join(" / ")} · ${id}` : id;
      el.title = `${airportLabel(a, "name")} — filter entries at ${id}`;
      el.setAttribute("aria-label", el.title);
      el.onclick = (e) => {
        e.stopPropagation();
        latest.current.onAirport(id);
      };
      markers.current.push(
        new maplibregl.Marker({
          element: el,
          anchor: "bottom",
          offset: [0, -10],
        })
          .setLngLat([a.lon, a.lat])
          .addTo(m),
      );
    });
    legs.forEach((l) => {
      const el = document.createElement("div");
      el.className = "direction-arrow";
      el.setAttribute("aria-hidden", "true");
      el.textContent = "➤";
      const angle =
        (Math.atan2(
          -(l.to.lat - l.from.lat),
          (l.to.lon - l.from.lon) * Math.cos((l.from.lat * Math.PI) / 180),
        ) *
          180) /
        Math.PI;
      const inner = document.createElement("span");
      inner.textContent = "➤";
      inner.style.transform = `rotate(${angle}deg)`;
      el.replaceChildren(inner);
      markers.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([(l.from.lon + l.to.lon) / 2, (l.from.lat + l.to.lat) / 2])
          .addTo(m),
      );
    });
    fit();
  }, [props.entries, props.selected, props.airports, ready]);
  return (
    <section className="map-panel" aria-label="Interactive flight route map">
      <div ref={host} className="map-canvas" />
      {failed && (
        <div className="map-failure">
          <MapPin size={30} />
          <h3>Map unavailable</h3>
          <p>
            Your browser could not initialize the map. Explore all routes in the
            flight list and airport explorer.
          </p>
        </div>
      )}
      <div className="map-badge">
        <span className="live-dot" />
        {props.selected ? "SELECTED ENTRY" : "ROUTE ATLAS"}
        <span className="badge-divider" />
        {props.selected
          ? props.selected.route.join(" → ")
          : `${props.entries.length} logged entries`}
      </div>
      <button
        className="map-fit icon-button"
        onClick={fit}
        aria-label="Fit routes to map"
        title="Fit routes"
      >
        <Maximize size={18} />
      </button>
      <div className="map-compass">
        <Compass size={32} strokeWidth={1} />
        <span>N</span>
      </div>
      <div className="map-legend">
        <span className="legend-line" /> Recorded airport connections{" "}
        <span className="legend-note">Thicker lines · more entries</span>
      </div>
      {tileWarning && !failed && (
        <div className="tile-warning" role="status">
          Some basemap details could not load. Airport routes remain available.
        </div>
      )}
    </section>
  );
}
