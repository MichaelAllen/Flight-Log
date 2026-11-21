# The Flight Log

An interactive archive of a pilot’s handwritten logbook, built with React and TypeScript. Explore flights on a map, search and filter entries, compare hours and landings, browse airports, and open the corresponding scanned page. Filters and selected entries can be shared by URL. Entry details also link to a correction form.

## Run locally

Use Node.js 24 and npm, matching the deployment build. Run commands from this directory:

```sh
npm ci
npm run build
npm run dev
```

Open [localhost:5173](http://localhost:5173). The initial build generates the dataset needed by the app. After editing source data, run `npm run import` or rebuild to refresh it.

```sh
npm test              # Automated tests
npm run validate      # Check source data and PDFs without writing output
npm run build         # Import data, check TypeScript, and build dist/
npm run preview       # Serve the production build locally
```

## Update the archive

Source data is stored in:

- `data/flights.csv` — flight entries.
- `data/catalog.json` — archive settings, book references, hours source, and airport aliases.
- `data/airports.json` — airport metadata.
- `data/airport-overrides.json` — reviewed airport corrections.
- `public/books/` — scanned logbook PDFs.

To replace the archive with a CSV and one complete source book:

```sh
npm run load -- /path/to/Logbook.csv /path/to/Logbook.pdf
npm run build
npm test
```

The loader replaces the canonical CSV and book catalog, copies the PDF, and resets privacy-review flags. Original input files are unchanged. For ordinary CSV edits, the loader is unnecessary. Do not edit generated `public/data/logbook.json`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the CSV schema, validation rules, and implementation details.

## Deploy

### GitHub Pages

The repository is configured to publish to [michaelallen.github.io/Flight-Log](https://michaelallen.github.io/Flight-Log/). Set **Settings → Pages → Source** to **GitHub Actions**.

Push changes to `main`, or run the Pages workflow manually. It installs dependencies, imports and validates data, builds, tests, and deploys `dist/`. Failed checks stop publication. Routine CSV updates can be committed directly on GitHub without a local build.

To check the repository subpath locally:

```sh
BASE_PATH=/Flight-Log/ npm run build
BASE_PATH=/Flight-Log/ npm run preview
```

Open the preview URL with `/Flight-Log/` appended. For another static host, deploy `dist/`; set `BASE_PATH` at build time if hosting under a subpath. The default is `/`.

### Docker

```sh
docker compose up -d --build
```

Open [localhost:8080](http://localhost:8080). Set `PORT` to change the host port, or `BIND_ADDRESS=127.0.0.1` to restrict access to the local host behind a reverse proxy. The supplied Docker setup serves at the domain root. Rebuild after changing code, data, or PDFs; no persistent volumes are needed.

```sh
docker compose logs -f logbook
docker compose down
```

### Publication and external services

All files in `public/`, including full scans and original CSV fields embedded in the generated dataset, are included in the published site. Review and redact them before public hosting. After review, set `meta.privacyReviewed` and each book’s `privacyReviewed` in `data/catalog.json`, then run:

```sh
npm run validate:publication
```

This audit is separate from the normal build and is not enforced by the Pages workflow.

The app runs as a static site without a backend or API keys. Map tiles use [OpenFreeMap](https://openfreemap.org/), fonts use Google Fonts, and the correction form uses Microsoft Forms, so those features require external services. Airport metadata comes from the [airport-codes dataset](https://github.com/datasets/airport-codes), derived from [OurAirports](https://ourairports.com/data/); historical identifiers require review.
