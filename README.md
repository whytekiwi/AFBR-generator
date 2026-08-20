# Afterburn Report Generator

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
