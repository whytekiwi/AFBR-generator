# Afterburn Report PDF Generator Specification

## Purpose

Generate a polished, device-independent PDF booklet for the current Kiwiburn
cycle. The booklet collates supplied afterburn reports from team leads,
documents the leadership structure, and includes a financial review.

The generator is a Node.js service that accepts an input directory containing
structured data and static assets, then renders a single PDF. It lays out
provided content only: it must not summarise, rewrite, infer, or generate
report content.

## Document Structure

The PDF is produced in this order:

1. **Cover**
   - Full-page artwork and Kiwiburn branding.
   - Document title and cycle/year.
   - Decorative HTML/CSS elements as required by the design.
2. **Regional Burning Man Representatives**
   - Placeholder page titled “A word from our Regional Burning Man
     Representatives”.
   - Content is not yet supplied.
3. **Contents**
   - Generated table of contents with accurate page numbers.
   - Lists departments and the first page of each department.
   - Does not list individual teams.
4. **Chair’s Report**
   - One-page placeholder until chair content is supplied.
5. **Welcome and Leadership Structure**
   - Two pages of supplied, fixed content.
   - This content may initially be hardcoded rather than read from the input
     directory.
6. **Department Reports**
   - One section for each department, in the explicit order provided by the
     input manifest.
   - Every department has a visible header/divider and is listed in the table
     of contents.
   - Every department must begin on a new physical PDF page. No page may
     contain the start of more than one department.
   - Every team belonging to the department is rendered, including teams that
     have not started a report.
7. **Financials**
   - Placeholder section until financial data is supplied.
   - Must support supplied financial screenshots as full-width or captioned
     figures when that data becomes available.

## Input Directory Contract

The input directory is the complete source for cycle-specific data and assets.
Suggested layout:

```text
input/
  report-manifest.json
  reports/
    <team-id>.json
  assets/
    images/
    fonts/
```

`report-manifest.json` must provide:

- document title, cycle/year, and global branding configuration;
- ordered departments;
- ordered teams within each department;
- the filename or identifier of each team report; and
- any per-document asset references.

The manifest order is authoritative. The renderer must not derive department or
team ordering from filenames or filesystem order.

## Azure Blob Input Contract

The same rendering pipeline can materialize a temporary input directory directly
from Azure Blob Storage. This is a separate Node.js 22 CLI/background workload,
not part of the Node.js 20 managed Static Web Apps Functions artifact.

Invoke it with:

```powershell
$env:AZURE_STORAGE_CONNECTION_STRING = '<connection-string>'
node src\cli.js --blob --cycle 2026 --draft false --output output\afterburn-report.pdf
```

`AZURE_STORAGE_CONNECTION_STRING` is required. `REPORTS_CONTAINER` defaults to
`afterburn-reports`, and `DOCUMENT_CONTAINER` defaults to
`afterburn-document`. `--cycle` and `--draft true|false` are required so the
renderer never infers publication state. `--title` and `--watermark-text` may
override their derived defaults.

The reports container stores one canonical `{reportId}.md` blob per report. The
document container stores:

```text
manifest.json
sections/{sectionId}/{saveUuid}.md
media/{uuid}
```

`manifest.json` is normalized version 1. Its top-level ordered items are
sections, contents, images, and departments. Department children are reports or
images. Section items reference their exact immutable Markdown blob. Image
items reference `mediaId`; their `fileName`, `contentType`, `altText`, and
`caption` remain in the manifest. The renderer downloads only placed reports
and referenced sections/media, preserves manifest order, and validates report
identity against its containing department.

Blob bytes are read privately with the Azure SDK and written to a secure
temporary renderer-compatible tree. Temporary files are always removed. The
renderer does not expose containers publicly and does not require SAS URLs.
Missing or malformed manifests, sections, reports, and media fail with the
container, blob reference, and affected manifest location where applicable.

### Static Image Inserts

Static images are declared in the manifest as semantic inserts. They are placed
in document flow, not at an absolute page number, so changing report lengths
does not alter their intended position. For example, this inserts a half-page
image after the final Arts report and before the next department:

```json
{
  "id": "arts-closing-photo",
  "type": "image",
  "src": "assets/images/src_a.jpg",
  "placement": {
    "after": {
      "type": "department",
      "id": "arts"
    }
  },
  "layout": "half-page",
  "altText": "Description of the image",
  "caption": "Optional caption"
}
```

`id`, `type`, `src`, and `placement` are required. `src` must resolve inside
the input directory and be readable. `altText` and `caption` are optional but
strongly encouraged. Supported layouts are defined by the active theme.

## Team Afterburn Report Data

Each report contains team identity, review metadata, multiple report revisions,
status, and last-modified metadata. The known shape includes:

```json
{
  "Team": "IT Team",
  "Department": "Testing",
  "AuthorName": "Megan",
  "ReviewerRole": "Tester",
  "ReviewerName": "Matias",
  "ReportSubmission": {},
  "ReportDraft": {},
  "ReportFinal": {},
  "Status": "Final",
  "LastModified": "4/30/2026 3:28pm"
}
```

The final contract will define which identity and review metadata is displayed
and which is retained as internal metadata.

### Revision Selection

For each team, select the most finalised available revision in this order:

1. `ReportFinal`
2. `ReportSubmission`
3. `ReportDraft`
4. `NotStarted`

A revision is available when its supplied object contains report content. The
top-level `Status` is internal source metadata: it must not be shown in the PDF
and must not override a more-final available revision.

Teams with no available revision are still rendered. They must receive a
single, clearly labelled “Not received” state rather than being omitted. Do not
render their individual report-section headings or empty section states.

### Report Sections

The selected revision may include:

- `generalOverview`
- `crewPerformance`
- `resources`
- `budgetAnalysis`
- `improvements`

Each populated field is rendered under its corresponding section heading. An
empty or absent field must use a consistent “No response provided” treatment;
it must not be hidden if the report template requires that section.

`authorName` identifies the revision author and may be rendered according to
the visual design.

### Report Layout

- A report's source status must never be displayed; the selected revision is
  rendered as a completed report regardless of whether it originated as a
  draft, submission, or final.
- The landscape PDF is a two-page, vertically oriented booklet spread. The
  left and right halves are virtual booklet pages.
- Report content must fill the left virtual page first, then overflow to the
  right virtual page only when the left page is full. It may continue onto the
  next physical PDF spread when both virtual pages are full.
- Reports form one continuous reading flow within a department. Short reports
  may stack vertically in the remaining space of a virtual page; they must not
  be moved to the right virtual page merely to start a new report.

### Text Formatting

Report field values may contain Markdown. The supported Markdown subset must
be explicitly defined during implementation. At minimum, it should support:

- headings;
- paragraphs and line breaks;
- ordered and unordered lists;
- emphasis; and
- links.

The renderer must safely handle malformed Markdown and literal text. Form
prompts or example text embedded in submissions are source content and must be
preserved unless removed upstream; the PDF service does not edit report prose.

## Rendering and Navigation

- Render a portable PDF that opens on common desktop and mobile PDF viewers.
- Use a stable page size and consistent margins defined by the visual design.
- Generate page numbers and the contents page after final layout, so contents
  page references are accurate.
- Use a two-pass HTML-to-PDF render: first measure department start positions,
  then render the contents page with those measured numbers.
- Add PDF bookmarks for document-level sections, departments, and teams where
  supported by the selected rendering stack.
- Individual teams are available through bookmarks but are not listed in the
  printed contents.
- Department section headers/dividers establish the page reference used in the
  table of contents.
- Department page breaks are a document invariant, not a theme choice. Themes
  may style the department divider but must preserve the rule that every
  department starts on a new physical page.
- The final design will determine whether page numbering starts in front
  matter or at the department reports.

### Draft Watermark

Draft state is controlled by `document.draft.enabled` in the input manifest.
When enabled, the renderer must apply a large diagonal `DRAFT` watermark to
every generated page, including the cover, front matter, department dividers,
team reports, and financials. The watermark must remain clearly visible without
obscuring readable content.

The watermark text is configured by `document.draft.watermarkText` and defaults
to `DRAFT`. Setting `document.draft.enabled` to `false` produces a
publication-ready PDF with no watermark. The service must not silently enable
or disable draft mode.

## Assets and Branding

All static images and fonts are supplied beneath `assets/`. The service must:

- resolve asset paths relative to the input directory;
- validate missing or unreadable referenced assets with actionable errors;
- embed supplied fonts where the PDF renderer supports it;
- use explicit font fallbacks; and
- preserve image aspect ratios without unintended cropping.

The cover supports full-page art, branding, title text, and decorative
HTML/CSS elements.

## Placeholder Content

Until actual data is supplied, render explicit placeholders for:

- Regional Burning Man Representatives’ message;
- Chair’s report; and
- Financials.

Placeholders must retain their final document positions and styling so the
booklet’s navigation and pagination can be reviewed before source content
arrives.

## Validation and Errors

Before rendering, validate:

- manifest syntax and required cycle metadata;
- draft configuration, including a Boolean `document.draft.enabled` value;
- department and team identifiers;
- manifest references to report files;
- duplicate departments or team identifiers;
- report-to-department assignment consistency;
- supported report status values;
- asset existence and readability; and
- data needed for deterministic ordering.

Invalid input must cause a clear failure describing the affected file, field,
and expected value. The service must not silently omit reports, teams,
departments, or assets.

## Non-Goals

- Writing, summarising, editing, or interpreting report content.
- Inferring missing reports or organisational structure.
- Maintaining team ordering outside the manifest.
- Replacing the PDF viewer or delivering a custom cross-device reader.

## Outstanding Design Decisions

The following are required before implementation is complete:

- exact page size, orientation, margins, colour palette, typography, and
  branding assets;
- whether every team starts on a new page;
- department divider layout and any optional department introduction;
- displayed metadata for teams and report revisions;
- exact placeholder copy and visual treatment;
- fixed Welcome and Leadership Structure copy;
- final Markdown subset and heading mappings;
- page numbering convention; and
- financial screenshot layout, captions, and source-data format.

## Template Redesign Baseline

The selected implementation checkpoint before the template redesign is commit
`3367141` (`Bootstrap afterburn report generator`). The next template should be
rebuilt from that bootstrap rather than incrementally adapting experimental
layout code.

### Selected Format Direction

- The document begins with a single A5 portrait cover page.
- All following PDF pages are A4 landscape.
- Each landscape PDF page represents two vertical virtual booklet pages: a left
  page and a right page.
- Report content reads through those virtual pages in order: left page, right
  page, then the next physical PDF spread.
- Use a subtle rain-and-rainbow aesthetic. Rainbow treatment is restrained;
  every department receives a distinct, accessible flat colour.
- Department identity uses one horizontal hero header at the department start
  and a vertical continuation rail on subsequent department spreads.

### Structural Requirements

- Separate document structure from visual styling. The rendering pipeline owns
  pagination, virtual-page geometry, department boundaries, contents anchors,
  and header placement. Themes own only visual tokens and markup within
  defined template slots.
- Model the virtual left and right pages explicitly. Do not rely on generic CSS
  multi-column fragmentation to decide how content crosses the virtual-page
  boundary.
- Calculate page-specific elements, including continuation rails, from a
  deterministic final spread plan before rendering. Do not infer their
  placement from browser element positions after layout.
- Render the A5 cover and A4 landscape body as separate segments, then merge
  them into a single PDF. Apply a defined page-number offset so contents
  references use final document page numbers.
- Derive each department's hero header, continuation rail, and contents cue
  from the same department identity token. Colour must supplement readable
  text and never be the only means of identification.
- A team without a selected report revision renders one “Not received” state.
  Do not display internal lifecycle status or empty report-section scaffolding.
- Preserve natural reading order and efficient density. Keep section blocks
  intact where practical, avoid wasteful divider pages, and do not invent
  summaries or other prose.

### Accessibility Requirements

- Body text, headings, links, captions, empty states, and watermarks must meet
  readable contrast expectations.
- Decorative texture, rain, and rainbow effects must not sit behind body text
  or otherwise interfere with reading.
- Maintain a clear typographic hierarchy and readable type sizes.
- Do not encode meaning through colour alone.
- Preserve image alternative text in source HTML and provide visible captions
  where supplied.

### Fixed Template Vocabulary

The redesigned template should use explicit, reusable templates for:

1. A5 cover.
2. Front-matter pages.
3. Contents.
4. Department-start spread.
5. Department-continuation spread.
6. Team report.
7. Static image insert.
8. Financials.
