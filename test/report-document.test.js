import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReportValidationError,
  createReportMetadata,
  parseReportMarkdown,
  serializeReportMarkdown,
} from '../src/report-document.js';

const report = {
  authorName: 'Āri Example',
  team: 'IT Team',
  department: 'Admin',
  generalOverview: 'A **useful** overview.',
  crewPerformance: '- One\n- Two',
  resources: '',
  budgetAnalysis: 'On budget.',
  improvements: '1. Start earlier',
};

test('round trips a canonical Markdown report', () => {
  assert.deepEqual(parseReportMarkdown(serializeReportMarkdown(report)), report);
});

test('preserves non-schema headings inside report content', () => {
  const withHeading = {
    ...report,
    generalOverview: '### Highlights\n\nUseful detail.\n\n## Resources\n\nMore detail.',
  };
  assert.deepEqual(parseReportMarkdown(serializeReportMarkdown(withHeading)), withHeading);
});

test('encodes searchable metadata without losing Unicode', () => {
  const metadata = createReportMetadata(report);
  assert.equal(decodeURIComponent(metadata.authorname), report.authorName);
  assert.match(decodeURIComponent(metadata.searchtext), /āri example it team admin/);
});

test('requires report identity fields', () => {
  assert.throws(
    () => serializeReportMarkdown({ ...report, team: '' }),
    (error) => error instanceof ReportValidationError
      && error.errors.some(({ field }) => field === 'team'),
  );
});
