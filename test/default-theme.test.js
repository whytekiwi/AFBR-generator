import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { defaultTheme } from '../src/themes/default.js';

test('assigns department colors in department order', async () => {
  const departments = [
    { id: 'first', name: 'First', teams: [] },
    { id: 'second', name: 'Second', teams: [] },
    { id: 'third', name: 'Third', teams: [] },
  ];
  const model = {
    departments,
    document: { cycle: '2026', draft: { enabled: false } },
    outline: [],
    tableOfContents: [],
    inputDirectory: '.',
  };
  const plan = {
    blocks: {},
    pageNumbers: {},
    spreads: departments.map((department, index) => ({
      type: 'department-start',
      department,
      pdfPageNumber: index + 1,
      slots: [{ units: [] }, { units: [] }],
    })),
  };

  const html = await defaultTheme.renderBody(model, plan);

  assert.match(html, /--department-colour: #BE5555/);
  assert.match(html, /--department-colour: #AA6441/);
  assert.match(html, /--department-colour: #907237/);
  assert.ok(html.indexOf('#BE5555') < html.indexOf('#AA6441'));
  assert.ok(html.indexOf('#AA6441') < html.indexOf('#907237'));
});

test('renders a front-matter image slot inline alongside other virtual pages', async () => {
  const model = {
    departments: [],
    document: { cycle: '2026', draft: { enabled: false } },
    outline: [
      {
        type: 'image',
        id: 'poster',
        src: 'afterburn-report-hero.jpg',
        altText: 'Poster alt text',
        caption: 'Poster caption',
        fullWidth: false,
        fullPage: false,
      },
    ],
    tableOfContents: [],
    inputDirectory: fileURLToPath(new URL('../assets', import.meta.url)),
  };
  const plan = {
    blocks: {},
    pageNumbers: {},
    spreads: [
      {
        type: 'front-matter',
        pdfPageNumber: 1,
        slots: [
          { type: 'image', insert: model.outline[0] },
          { type: 'blank' },
        ],
      },
    ],
  };

  const html = await defaultTheme.renderBody(model, plan);

  assert.match(html, /class="frontmatter-image"/);
  assert.match(html, /alt="Poster alt text"/);
  assert.match(html, /<figcaption>Poster caption<\/figcaption>/);
});

test('renders a department-table block as a markdown table', async () => {
  const department = { id: 'admin', name: 'Admin', teams: [] };
  const model = {
    departments: [department],
    document: { cycle: '2026', draft: { enabled: false } },
    outline: [],
    tableOfContents: [],
    inputDirectory: '.',
  };
  const plan = {
    blocks: {
      'table:budget-table': {
        id: 'table:budget-table',
        type: 'department-table',
        markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |',
      },
    },
    pageNumbers: {},
    spreads: [
      {
        type: 'department-start',
        department,
        pdfPageNumber: 1,
        slots: [
          { units: [{ blockIds: ['table:budget-table'] }] },
          { units: [] },
        ],
      },
    ],
  };

  const html = await defaultTheme.renderBody(model, plan);

  assert.match(html, /class="layout-block department-table"/);
  assert.match(html, /<table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
});

test('renders a department-table-heading block with the table title', async () => {
  const department = { id: 'admin', name: 'Admin', teams: [] };
  const model = {
    departments: [department],
    document: { cycle: '2026', draft: { enabled: false } },
    outline: [],
    tableOfContents: [],
    inputDirectory: '.',
  };
  const plan = {
    blocks: {
      'table-heading:budget-table': {
        id: 'table-heading:budget-table',
        type: 'department-table-heading',
        title: 'Budget breakdown',
      },
    },
    pageNumbers: {},
    spreads: [
      {
        type: 'department-start',
        department,
        pdfPageNumber: 1,
        slots: [
          { units: [{ blockIds: ['table-heading:budget-table'] }] },
          { units: [] },
        ],
      },
    ],
  };

  const html = await defaultTheme.renderBody(model, plan);

  assert.match(html, /class="layout-block department-table-heading"/);
  assert.match(html, /<h3>Budget breakdown<\/h3>/);
});