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
top-level `Status` may be displayed as metadata but must not override a more
final available revision.

Teams with no available revision are still rendered. They must receive a
consistent, clearly labelled empty state rather than being omitted.

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
