# Afterburn Report Generator

This repository contains the existing PDF renderer plus a small web-based report
editor:

- `web/` is a mobile-first React application.
- `api/` is an Azure Functions v4 API backed by Azure Blob Storage.
- `src/` contains the existing PDF generation pipeline and its Markdown input
  adapter.

## Web editor

Install each application:

```powershell
npm install
npm install --prefix api
npm install --prefix web
```

For local storage, start Azurite and copy
`api/local.settings.example.json` to `api/local.settings.json`. Then run the
Functions API and Vite frontend in separate terminals:

```powershell
npm run api:start
npm run web:dev
```

For Azure Static Web Apps, use `web` as the application location, `dist` as the
output location, and `api` as the API location. Configure these application
settings:

- `AZURE_STORAGE_CONNECTION_STRING`
- `REPORTS_CONTAINER` (optional; defaults to `afterburn-reports`)
- `DOCUMENT_CONTAINER` (optional; defaults to `afterburn-document`)

The **Reports** workspace edits individual team reports. The **Document outline**
workspace controls the final order, custom Markdown sections, departments, team
reports, and uploaded images. Outline data is stored in `manifest.json`, custom
sections in immutable `sections/{sectionId}/{saveUuid}.md` blobs, and image
assets in `media/{uuid}` within the document container.

Authentication is intentionally not implemented by this application. Azure Easy
Auth can protect the deployed routes separately.

## Migrate the existing reports

Convert the current revision-based JSON reports into canonical Markdown while
preserving the manifest order:

```powershell
npm run migrate -- sample-data migrated-data
```

Each Markdown file contains identity fields in YAML front matter and the five
report sections as fixed level-two headings. The migrated directory remains a
valid input to the PDF renderer.

To migrate the raw JSON reports directly into Blob Storage, set the storage
connection and run:

```powershell
$env:AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"
npm run migrate:blob -- sample-data
```

The command uploads canonical Markdown reports and searchable metadata to
`REPORTS_CONTAINER`, then uploads custom sections and media before publishing
the ordered `manifest.json` to `DOCUMENT_CONTAINER`. Existing blobs with the
same report IDs are replaced. Set `REPORTS_CONTAINER` and `DOCUMENT_CONTAINER`
to target non-default containers. The script also accepts `--input`,
`--reports-container`, `--document-container`, and `--connection-string` when
invoked directly with Node.

## Render a PDF

The renderer requires Node.js 22 and Playwright. Install its dependencies and
browser once:

```powershell
npm install
npx playwright install chromium
```

Generate a PDF booklet from an input directory:

```powershell
node src\cli.js --input sample-data --output output\afterburn-report.pdf
```

To render the active document directly from private Blob Storage, configure the
same storage settings used by the editor and select the cycle and draft state
explicitly:

```powershell
$env:AZURE_STORAGE_CONNECTION_STRING = '<connection-string>'
$env:REPORTS_CONTAINER = 'afterburn-reports'   # optional default
$env:DOCUMENT_CONTAINER = 'afterburn-document' # optional default
node src\cli.js --blob --cycle 2026 --draft false --output output\afterburn-report.pdf
```

`--title` and `--watermark-text` are optional. The default title is
`Kiwiburn {cycle} Afterburn Report`; the default watermark text is `DRAFT`.
Blob input is downloaded through the Azure SDK into a private temporary
renderer-compatible tree and is removed after success or failure. It does not
use public blob URLs or SAS tokens.

The reports container contains canonical `{reportId}.md` blobs. The document
container contains `manifest.json`, the exact immutable section blobs referenced
by that manifest, and referenced `media/{uuid}` blobs. A missing or invalid
reference fails generation instead of being omitted.

The generator performs a two-pass render. It first measures final department
positions, then renders the table of contents with the resulting page numbers.

PDF rendering is intentionally a separate root CLI/background workload. It is
not included in the managed Azure Static Web Apps Functions artifact in `api/`,
which remains self-contained on Node.js 20 and does not install Playwright.

The stable pipeline lives in `src/`. Visual direction belongs in
`src/themes/default.js`; future design iterations can replace that module
without changing input validation, report selection, document sequencing, or
pagination.

See `AFTERBURN_REPORT_SPEC.md` for the input contract.
