# The Flight Log

A static React + TypeScript logbook atlas with MapLibre, linked PDF.js source pages, shared URL filters, and build-time CSV validation. The included **30 entries and three-page PDF are illustrative demonstration material**, not a transcription of the supplied image or a real pilot history.

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

## Replace demonstration data

1. **Confirm columns against a complete scanned sample page.** No full page/CSV has been supplied yet, so the current canonical field mapping is provisional. Keep every original column. Add additional numeric category names to `extraNumericColumns` in `data/catalog.json`; unrecognized columns are preserved verbatim in each entry's original data.
2. Replace `data/flights.csv`. Keep stable IDs even when correcting or reordering entries. One handwritten row remains one entry, regardless of stop count. Date: `YYYY-MM-DD`; route: ordered identifiers separated by `>` (e.g. `60J>SUT>CRE>60J`). Preserve original text in `route_original`. Never replace uncertainties with guesses.
3. Copy reviewed, complete book PDFs into `public/books/`. Update `data/catalog.json` with each book's unique ID, title, root-relative PDF URL, actual `pageCount`, and `privacyReviewed`. `pdf_page` is **1-based physical PDF page**; `printed_page` is optional text and may differ. `source_row` helps locate the handwritten line.
4. Review all remarks and scans for personal information before publication; redact source files where needed. Set `meta.privacyReviewed` and each book's flag to true only after review. Set `meta.demo` to false only after replacing the demonstration data. **Delete `public/books/demo-logbook.pdf`, `public/data/flights-template.csv`, and the demo PDF generation script when switching to real records.** All `public/` assets are publicly deployed, even when not referenced by the catalog.
5. Run `npm run validate`, resolve errors, review warnings, run tests/build, and republish `dist/`. Generated `public/data/logbook.json` is the normalized runtime dataset. It contains all original CSV columns; review those too. Only referenced airport metadata is included in it.

### CSV fields

Required nonblank: `id,date,aircraft_type,tail_number,route,source_book_id,pdf_page`.

Optional: `route_original,total_hours,remarks,printed_page,source_row,transcription_notes` plus these non-negative numeric fields: `single_engine_land,multi_engine_land,night,actual_instrument,simulated_instrument,dual_received,pilot_in_command,solo,cross_country,landings,instrument_approaches`.

Keep airport identifiers and tail numbers as text in spreadsheets. Numeric cells use plain decimal numbers, no commas or time notation. Decimal hours: `1.4` = 1 hour 24 minutes. Blank = unknown/untranscribed; zero = recorded zero. Landings and approaches must be whole numbers. Totals use **only `total_hours`**, never the sum of categories. If the original lacks total time, leave it blank until a reviewed transcription rule is agreed.

Validation blocks duplicate IDs, invalid dates/numbers, missing required fields, bad PDF references/page counts, unreviewed publication data, and undocumented unresolved airports. A documented unresolved stop is allowed with a warning, and no line bridges that stop. PDF files are actually parsed at import time to verify page count. `npm run validate` does not overwrite generated data.

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

Before replacing the demo in production, verify performance against the complete archive and confirm the final CSV column mapping against the original pages. A 20,000-entry synthetic processing test is not a substitute for profiling the full real dataset in a browser.
