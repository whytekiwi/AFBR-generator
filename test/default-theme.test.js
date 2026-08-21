import test from 'node:test';
import assert from 'node:assert/strict';
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