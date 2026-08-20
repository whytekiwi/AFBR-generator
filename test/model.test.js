import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadInput, selectReportRevision } from '../src/input.js';
import { createDocumentModel } from '../src/model.js';

test('selects the highest available report revision', () => {
  const report = {
    ReportDraft: { generalOverview: 'draft' },
    ReportSubmission: { generalOverview: 'submitted' },
    ReportFinal: { generalOverview: 'final' },
  };

  assert.deepEqual(selectReportRevision(report), {
    stage: 'final',
    content: report.ReportFinal,
  });
});

test('retains teams without reports without exposing the report author', () => {
  const model = createDocumentModel({
    inputDirectory: '/input',
    manifest: {
      document: { draft: { enabled: true } },
      frontMatter: {},
      financials: {},
    },
    inserts: [],
    departments: [
      {
        id: 'admin',
        name: 'Admin',
        teams: [
          {
            id: 'backburners',
            name: 'Backburners',
            report: { AuthorName: 'Taylor' },
            selectedRevision: { stage: 'not-started', content: null },
          },
        ],
      },
    ],
  });

  assert.equal(model.departments[0].teams[0].notReceived, true);
  assert.equal(model.departments[0].teams[0].authorName, null);
});

test('removes revision-status headings from selected report content', () => {
  const model = createDocumentModel({
    inputDirectory: '/input',
    manifest: {
      document: { draft: { enabled: true } },
      frontMatter: {},
      financials: {},
    },
    inserts: [],
    departments: [
      {
        id: 'admin',
        name: 'Admin',
        teams: [
          {
            id: 'it',
            name: 'IT Team',
            report: { AuthorName: 'Taylor' },
            selectedRevision: {
              content: {
                generalOverview: '## Draft overview\n\nCurrent report content.',
              },
            },
          },
        ],
      },
    ],
  });

  assert.equal(
    model.departments[0].teams[0].sections[0].markdown,
    'Current report content.',
  );
});

test('loads the complete sample fixture set', async () => {
  const input = await loadInput(fileURLToPath(new URL('../sample-data', import.meta.url)));

  assert.equal(input.departments.length, 14);
  assert.equal(
    input.departments.reduce((count, department) => count + department.teams.length, 0),
    89,
  );
});
