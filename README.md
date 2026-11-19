# The Flight Log

A static React + TypeScript logbook atlas with MapLibre, linked PDF.js source pages, shared URL filters, and build-time CSV validation. The archive now contains **42 supplied entries (1989-1995)** and the complete **37-page source PDF**, with linked entries on PDF pages 2-5. These are preliminary transcriptions with uncertainty notes. Flight hours use the supplied `single_engine_land` column, matching the physical logbook. The latest CSV uses `NC30` for Miller Air Park. The configured `8A2` to `60J` alias remains available for older identifiers and share links; original CSV values remain preserved.

## Run

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
npm test
npm run validate
npm run build
npm run preview
```

`dist/` can be deployed to any static HTTPS host. There is no database, authentication, or runtime upload endpoint. Vite serves development on port 5173. The app assumes deployment at the root of an origin. Unknown query parameters are ignored. State, including multiple type/tail values and selected entry, lives in query parameters and browser back/forward works.

## Host with Docker

Copy this directory to your server and run from it:

```sh
docker compose up -d --build
docker compose ps
```

Open `http://YOUR_SERVER:8080`. Change the host port with `PORT=8090 docker compose up -d --build`. The default binds port 8080 on all host interfaces. If a reverse proxy on the same host handles your public domain and HTTPS, use `BIND_ADDRESS=127.0.0.1 docker compose up -d --build` and point the proxy to `http://127.0.0.1:8080`. For a proxy running in Docker, place both services on a shared Docker network and proxy to `http://logbook:8080` instead. Serve at the domain root; path-prefix hosting is not configured.

The multi-stage Dockerfile installs locked dependencies, runs tests, validates/imports the CSV and PDFs, and builds the app with Node 24. Only the finished static output is copied into the Nginx runtime. Nginx runs as a non-root user on container port 8080; Compose uses a read-only filesystem with temporary files in `/tmp`. There are no ChatGPT Sites services, credentials, or authentication requirements. Docker runs natively on Linux ARM64 and AMD64 when built on the target server.

The app, normalized data, and book PDFs are baked into the image. After editing `data/flights.csv`, `data/catalog.json`, airport overrides, or `public/books/`, run `docker compose up -d --build` again. No persistent volumes are required. The supplied real archive is included; review it before exposing the container publicly. Pull updated base images periodically with `docker compose build --pull` followed by `docker compose up -d`.

```sh
# View runtime logs or stop this app
docker compose logs -f logbook
docker compose down

# Without Compose
docker build -t flight-logbook .
docker run -d --name flight-logbook --restart unless-stopped \
  -p 8080:8080 --read-only --tmpfs /tmp:size=16m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges:true flight-logbook
```

`/healthz` returns `ok` and is checked by Docker's healthcheck. JSON/HTML/PDF files revalidate on subsequent requests; fingerprinted assets are cached. PDF byte-range requests are supported. The map basemap and optional Google Fonts still use external public services; self-hosting the container does not make those assets available offline. App code and PDF workers are served from your own container.

Search matches route codes, visited airport names and cities, aircraft types/tails, dates, remarks, notes, and entry IDs. It is case-insensitive and supports partial phrases: both `Ocean Isle` and `Odell Williamson` find entries visiting `60J`. Airport text only matches airports on an entry's route, and all other active filters still apply. PDF scan contents are not searched.

## Load or update the logbook

From this project directory, load a supplied CSV and complete PDF with:

```sh
npm run load -- ../Logbook.csv ../Logbook.pdf
npm run build
docker compose up -d --build
```

The loader preserves the source CSV unchanged in `data/source/logbook.csv`, writes the canonical `data/flights.csv`, copies the PDF into `public/books/`, and updates the book catalog with its actual page count. It accepts ISO dates or US `M/D/YY` dates; two-digit years explicitly mean **19xx** for this historical archive. Original date strings are retained in `date_original`. It preserves the source IDs, route order, tail strings (without guessing an N prefix), remarks, categories, handwriting confidence, and transcription notes. Each load resets privacy-review flags to false.

The current input supplies tail numbers for all 42 entries. Unknown tails remain supported when documented in transcription notes, and are excluded from identified-aircraft counts. `totalTimeColumn` is configured as `single_engine_land` per user confirmation; its values are used directly as hours without adding other categories. `airportAliases` maps `8A2` to `60J` per user correction. The previous Miller Airport override has been removed. Aliases apply to each stop before aggregation and distance calculations, and historical share links are normalized to the canonical airport.

**Private/local use:** normal validation and builds work with review flags false. **Before public hosting:** review/redact the full PDF (including identifying details on page 1), review all CSV fields, then set `meta.privacyReviewed` and every book's `privacyReviewed` to true and run `npm run validate:publication`. This strict check blocks unreviewed publication. Neither the loader nor the build uploads or publishes your files. The full PDF includes untranscribed pages; the CSV determines which entries appear in the app.

### Canonical data maintenance

1. The supplied CSV columns match the canonical entry fields. Keep every original column; uncertain readings remain documented for review. Add additional numeric category names to `extraNumericColumns` in `data/catalog.json`; unrecognized columns are preserved verbatim in each entry's original data.
2. Replace `data/flights.csv`. Keep stable IDs even when correcting or reordering entries. One handwritten row remains one entry, regardless of stop count. Date: `YYYY-MM-DD`; route: ordered identifiers separated by `>` (e.g. `60J>SUT>CRE>60J`). Preserve original text in `route_original`. Never replace uncertainties with guesses.
3. Copy reviewed, complete book PDFs into `public/books/`. Update `data/catalog.json` with each book's unique ID, title, root-relative PDF URL, actual `pageCount`, and `privacyReviewed`. `pdf_page` is **1-based physical PDF page**; `printed_page` is optional text and may differ. `source_row` helps locate the handwritten line.
4. Review all remarks and scans for personal information before publication; redact source files where needed. Set `meta.privacyReviewed` and each book's flag to true only after review. Set `meta.demo` to false only after replacing the demonstration data. Demonstration files have been removed. All `public/` assets are publicly deployed, even when not referenced by the catalog.
5. Run `npm run validate`, resolve errors, review warnings, run tests/build, and republish `dist/`. Generated `public/data/logbook.json` is the normalized runtime dataset. It contains all original CSV columns; review those too. Only referenced airport metadata is included in it.

### CSV fields

Required columns: `id,date,aircraft_type,tail_number,route,source_book_id,pdf_page`. All must be nonblank except an unknown `tail_number`, which requires `transcription_notes` and generates a warning.

Optional: `route_original,total_hours,remarks,printed_page,source_row,transcription_notes` plus these non-negative numeric fields: `single_engine_land,multi_engine_land,night,actual_instrument,simulated_instrument,dual_received,pilot_in_command,solo,cross_country,landings,instrument_approaches`.

Keep airport identifiers and tail numbers as text in spreadsheets. Numeric cells use plain decimal numbers, no commas or time notation. Decimal hours: `1.4` = 1 hour 24 minutes. Blank = unknown/untranscribed; zero = recorded zero. Landings and approaches must be whole numbers. Totals use **only the configured `totalTimeColumn`** in `data/catalog.json` (currently `single_engine_land`), never a sum of categories. The importer defaults to `total_hours` when no column is configured. Blank values in the chosen column remain unknown; no fallback to another column occurs. The original CSV column values are preserved.

Validation blocks duplicate IDs, invalid dates/numbers, missing required fields, bad PDF references/page counts and undocumented unresolved airports. `npm run validate:publication` additionally blocks unreviewed publication data. A documented unresolved stop is allowed with a warning, and no line bridges that stop. PDF files are actually parsed at import time to verify page count. `npm run validate` does not overwrite generated data.

## Airport catalog and historical review

`data/airports.json` contains US airport metadata from the OurAirports-derived [airport-codes dataset](https://github.com/datasets/airport-codes), downloaded November 2026, with explicit local/GPS/ICAO aliases. See [OurAirports data and public-domain terms](https://ourairports.com/data/). No IATA guessing or automatic K-prefixing. Current coordinates/names do not prove historical identity; closed airports are not automatically resolved.

Add reviewed historical/missing identifiers in `data/airport-overrides.json`:

```json
{
  "OLD1": {
    "id": "OLD1", "name": "Historical airfield", "city": "Town", "state": "NC",
    "lat": 34.0, "lon": -78.0,
    "reviewNote": "Confirmed from [source], relevant years 1990-1998"
  }
}
```

An override requires `reviewNote` and valid coordinates. If uncertain, keep the route identifier and document the uncertainty in `transcription_notes`.

## Interpretation

- Connections are schematic airport-to-airport lines, not actual flown tracks. No paths are invented for local flights.
- Shared connections are undirected for aggregation; count each entry once per connection, even with a return over the same leg. Selected entries show ordered stop numbers and directional arrows.
- Airport appearances count each recorded occurrence, including returns; entry counts deduplicate the airport within each entry. Unique airport identifiers may include unresolved codes, explicitly labeled in the UI.
- Estimated distance uses great-circle nautical miles between recorded consecutive stops. If any stop is unresolved, the entry has no distance estimate. Missing time is excluded and counted separately.
- Cumulative hours describe the current filtered set, not a certified lifetime total. Flight-list pagination renders 60 rows at a time.

## Map and PDF hosting

The basemap uses the public [OpenFreeMap service](https://openfreemap.org/quick_start/) with OpenStreetMap attribution retained on the map and in the data notes. No API key is needed. `src/MapView.tsx` sets the style URL; switch providers there if usage requirements change. The route layers remain usable when basemap requests fail; without WebGL, the complete flight list and airport explorer remain available.

PDF.js worker assets are bundled locally; scans stay on the same origin and open only on demand. The viewer supports page-specific navigation, zoom, Escape/close, opening a new tab, and downloading. A bad scan does not hide entry details. Use a host supporting byte ranges for large book PDFs. Start with optimized scans preserving handwriting readability.

## Verification and publication

`npm test` covers CSV preservation/errors, route ordering, combined filters, share URLs, aggregation, unresolved/local routes, decimal/missing hours, source ranges, airport counts, cumulative totals, and a 20,000-entry processing check. Run `npm run build` for TypeScript and production bundling. Browser checks cover desktop/mobile, selected routes, filters, charts, airport navigation, PDF pages/zoom, browser history, and empty states.

Before public release, verify performance against the complete archive and review uncertain transcriptions against the original pages. A 20,000-entry synthetic processing test is not a substitute for profiling the full real dataset in a browser.
