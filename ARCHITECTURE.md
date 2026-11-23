# Architecture and data reference

## Build and runtime

The application is a static React 19 + TypeScript site bundled by Vite. There is no database, authentication layer, or runtime data editor. Source CSV, catalog settings, airport metadata, and PDF scans are repository files.

`npm run build` runs this pipeline:

1. `scripts/import-data.ts` loads the catalog, airport data, overrides, CSV, and PDFs.
2. `scripts/normalize-source.ts` normalizes dates; `scripts/importer.ts` validates and converts rows into entries.
3. The importer writes `public/data/logbook.json` with entries, referenced airport metadata, books, archive metadata, and warnings.
4. TypeScript checks the project, then Vite bundles the app and copies public assets into `dist/`.

`npm run validate` performs the import checks without writing JSON. `npm run import` regenerates JSON without building the app. The generated dataset is ignored by Git. Vite development alone does not generate it.

## Source files

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Dataset loading, filters, navigation, flight list, entry details, airport explorer, sharing, and correction-form link |
| `src/model.ts` | Shared types, URL state, filtering, aggregation, chart series, and distance calculations |
| `src/MapView.tsx` | MapLibre map, airport markers, aggregated connections, and selected route arrows |
| `src/Insights.tsx` | Monthly/yearly hours and landings charts and aircraft summaries |
| `src/PdfViewer.tsx` | Lazy-loaded PDF.js dialog, page navigation, zoom, opening, and downloading |
| `src/pdfSource.ts` | Cached PDF downloads, shared by background prefetch and the viewer |
| `src/urls.ts` | Resolves public asset URLs against Vite’s deployment base |
| `scripts/load-source.ts` | Replaces the canonical CSV and single-book catalog from supplied files |
| `tests/logbook.test.ts` | Import, model, archive, URL, and processing checks |

## Data contract

`data/flights.csv` is the canonical entry source. One handwritten row remains one entry, regardless of stop count.

Required columns:

```text
id,date,aircraft_type,tail_number,route,source_book_id,pdf_page
```

Required values must be nonblank, except an unknown `tail_number` is allowed with `transcription_notes` and produces a warning. IDs must be unique and stable. Routes are ordered identifiers separated by `>`; identifiers are trimmed and uppercased before configured aliases are applied.

Optional descriptive columns are `date_original`, `route_original`, `remarks`, `printed_page`, `source_row`, and `transcription_notes`. Additional source columns are retained in each entry’s `original` object.

Built-in numeric columns:

```text
total_hours,single_engine_land,multi_engine_land,night,actual_instrument,
simulated_instrument,dual_received,pilot_in_command,solo,cross_country,
landings,instrument_approaches
```

Values must be non-negative plain decimals; landings and instrument approaches must be integers. Blank values become `null`. Add other validated numeric categories to `extraNumericColumns` in `data/catalog.json`.

`totalTimeColumn` selects the sole hours source, currently `single_engine_land`. If omitted, it defaults to `total_hours`. Missing values never fall back to another column, and categories are never summed to derive time. Unknown aircraft tails are excluded from identified-aircraft counts.

Dates accept ISO `YYYY-MM-DD` and US `M/D/YY` or `M/D/YYYY`. Two-digit years `00`–`88` map to 2000–2088; `89`–`99` map to 1989–1999. Normalization retains source date text in `date_original`.

### Books and validation

`data/catalog.json` contains archive metadata, books, extra numeric columns, the hours source, and airport aliases. Each book has a unique `id`, title, `/books/...pdf` path, actual `pageCount`, and privacy-review flag. Each entry’s `source_book_id` must match a book, and `pdf_page` must be within its physical page range. The importer parses the PDF to verify its page count.

Validation rejects duplicate IDs, invalid dates/numbers/routes, missing required values, invalid aliases, bad book references, and undocumented unresolved airports. Unresolved airports with transcription notes produce warnings. `validate:publication` additionally requires archive and book privacy-review flags. Normal builds warn about unset flags but allow them.

The local loader expects one book ID across its input CSV. It replaces the book catalog rather than merging books; it does not remove arbitrary older files from `public/books/`. All public assets are copied into the deployment, even if no catalog entry references them.

### Airport resolution

`data/airports.json` contains US airport metadata with explicit identifier aliases from the OurAirports-derived airport-codes dataset. There is no IATA guessing or automatic K-prefixing. Current names and coordinates do not establish historical identity.

`data/airport-overrides.json` overlays reviewed corrections. Each override requires a `reviewNote` and valid coordinates:

```json
{
  "OLD1": {
    "id": "OLD1",
    "name": "Historical airfield",
    "city": "Town",
    "state": "NC",
    "lat": 34.0,
    "lon": -78.0,
    "reviewNote": "Confirmed from a historical source for the relevant years"
  }
}
```

Catalog `airportAliases` canonicalizes route stops before aggregation and distance calculations. Alias targets must resolve to an airport and cannot themselves be aliases. The current `8A2` → `60J` correction also applies to airport and connection URL filters; original CSV fields remain available.

## Interaction and interpretation

The browser fetches the generated dataset at startup. Filters, selected entry, and active view use query parameters: `year`, `from`, `to`, repeated `type` and `tail`, `airport`, `q`, `connection`, `entry`, and `view`. Browser back/forward restores this state. Unknown parameters are ignored.

Search is case-insensitive substring matching across entry IDs, dates, routes, aircraft types/tails, remarks, transcription notes, and names/cities of airports on the entry’s route. It combines with other filters and does not search scanned PDF text. The flight list renders batches of 60 entries.

Connections aggregate as undirected airport pairs, counting each entry once per pair. A selected entry shows ordered stops and directional arrows. Local flights do not create invented paths; unresolved stops are never bridged. Distance sums great-circle nautical miles between consecutive resolved stops; any unresolved stop makes the whole entry’s distance unknown.

Airport appearances count each occurrence in a route, while airport entry counts deduplicate within each entry. Landing totals belong to entries rather than individual airports. Unique airport counts can include unresolved identifiers. Charts and cumulative totals use the filtered set, with missing values tracked separately.

## Maps and PDFs

MapLibre uses OpenFreeMap’s Positron style, with OpenStreetMap attribution. If basemap requests fail, route layers remain available; if WebGL is unavailable, the flight list and airport explorer remain usable.

After loading the dataset, the app starts a low-priority download of the first book. `src/pdfSource.ts` caches each PDF as a Blob and removes failed downloads from its cache so they can be retried. PDF.js and its worker are bundled locally; the viewer code loads when opened and reuses the download. Scans are served from the same origin. PDF errors do not hide entry details.

## Deployment and verification

Vite’s `BASE_PATH` controls both bundled asset paths and runtime public-file URLs. GitHub Pages reads its configured base path in `.github/workflows/pages.yml`; pushes to `main` and manual runs build, test, and deploy only `dist/`.

The Dockerfile runs tests and builds with Node 24, then copies static output into Nginx. Nginx runs as a non-root user on port 8080. Compose uses a read-only filesystem and temporary storage under `/tmp`. `/healthz` is the healthcheck endpoint; HTML/JSON/PDF responses revalidate, fingerprinted assets are cached, and PDF byte ranges are supported.

`npm test` covers import preservation and rejection cases, filters, URL state, aggregation, missing values, airport resolution, archive checks, and a 20,000-entry synthetic processing check. `npm run build` checks TypeScript and production bundling. These do not replace browser checks of map rendering, responsive layout, navigation, PDFs, or performance with a complete archive.
