# Working on The Flight Log

## Start here

- Run commands from this directory, which is the repository root.
- Read `README.md` for setup and deployment, and `ARCHITECTURE.md` for the source map, data contract, and implementation details.
- Use Node.js 24 and the committed npm lockfile (`npm ci`).
- Keep the app deployable as a static site, including GitHub Pages under `/Flight-Log/` and Docker at `/`.

## Documentation conventions

- Keep the README focused on what a human needs to understand, build, update, or host the project.
- Do not add archive counts, date ranges, page ranges, or snapshots of dataset configuration to the README. Point to the source files instead.
- Put detailed architecture and data semantics in `ARCHITECTURE.md`; keep this file focused on working conventions.
- Read source data and configuration for current values rather than relying on prose summaries or generated files.

## Commits and change scope

- Use Conventional Commits for every commit: `type(optional-scope): description`, for example `feat(map): add airport filtering` or `docs: clarify local setup`. Use `!` for breaking changes and explain them in a `BREAKING CHANGE:` footer.
- Work on one logical change at a time and commit it when complete and verified before starting an unrelated change.
- Keep each commit focused on a single feature, fix, or documentation change. Include its supporting tests and documentation together, but never bundle unrelated features or cleanup into the same commit.
- Review the staged diff before committing and stage only files or hunks belonging to that logical change. Leave unrelated work untouched.

## Preserve these behaviors

- Edit canonical inputs in `data/` and scans in `public/books/`. Never hand-edit or commit generated `public/data/logbook.json` or `dist/`.
- Keep entry IDs stable and preserve original source fields, ordered stops, and transcription uncertainties. Do not guess missing tails or historical airport identities.
- Derive hours only from the catalog's configured `totalTimeColumn`. Blank numeric values mean unknown; zero means recorded zero.
- Preserve shareable URL filters, selected entries, and browser back/forward navigation. Use `src/urls.ts` helpers for public asset URLs so subpath hosting works.
- Keep map connections schematic. Do not bridge unresolved airports or invent flown tracks.
- Preserve local PDF worker bundling and map attribution.

## Verification

- Generate the dataset with `npm run import` or `npm run build` before starting a fresh development checkout; `npm run dev` does not generate it.
- For code changes, run `npm run build` and `npm test`. The build imports data, checks TypeScript, and bundles the site.
- For source-data changes, run `npm run validate` and regenerate the dataset before testing behavior that reads it.
- For changes to asset URLs or hosting, also check `BASE_PATH=/Flight-Log/ npm run build` and preview that subpath.
- For UI changes, inspect the affected flows in a browser, including narrow layouts. Automated tests do not verify rendering.
- Documentation-only changes need a diff and link/path review, not an application rebuild.

## Deployment context

- Pushes to `main` trigger the GitHub Pages build, test, and deployment workflow.
- Everything in `public/` is published, including unreferenced scans and source fields retained in generated JSON.
- The publication privacy audit is explicit (`npm run validate:publication`), separate from normal builds and the Pages workflow. Do not mark review flags complete without an actual review.
- `npm run load` replaces the canonical CSV and single-book catalog; use ordinary CSV edits for incremental updates.
