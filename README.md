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

## Render a PDF

Generate a PDF booklet from an input directory:

```powershell
npm install
npx playwright install chromium
npm run render -- --input sample-data --output output/afterburn-report.pdf
```

The generator performs a two-pass render. It first measures final department
positions, then renders the table of contents with the resulting page numbers.

The stable pipeline lives in `src/`. Visual direction belongs in
`src/themes/default.js`; future design iterations can replace that module
without changing input validation, report selection, document sequencing, or
pagination.

See `AFTERBURN_REPORT_SPEC.md` for the input contract.
