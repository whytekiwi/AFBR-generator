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

test('retains teams that have not started reports', () => {
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

  assert.equal(
    model.sections.find((section) => section.type === 'team-report').reportStage,
    'not-started',
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
