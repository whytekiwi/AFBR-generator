import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  imageContentType,
  mediaIdForInsert,
  migrateLegacyReportsToBlob,
} from '../src/blob-migration.js';

test('migrates raw JSON reports into Blob report and document stores', async () => {
  const reports = new Map();
  let savedDocument;
  const result = await migrateLegacyReportsToBlob({
    inputDirectory: fileURLToPath(new URL('../sample-data', import.meta.url)),
    reportStore: {
      async save(id, report) {
        reports.set(id, report);
      },
    },
    documentStore: {
      async uploadMedia() {
        throw new Error('Sample data should not upload media');
      },
      async save(document) {
        savedDocument = document;
      },
    },
  });

  assert.equal(result.reportCount, reports.size);
  assert.equal(result.departmentCount, savedDocument.items.filter(
    (item) => item.type === 'department',
  ).length);
  assert.equal(result.mediaCount, 0);
  assert.ok(result.populatedReportCount > 0);
  assert.equal(reports.get('004-admin-team').department, 'Admin');
  assert.equal(savedDocument.version, 1);
  assert.equal(
    savedDocument.items
      .filter((item) => item.type === 'department')
      .flatMap((department) => department.items)
      .filter((item) => item.type === 'report')
      .length,
    reports.size,
  );
  assert.deepEqual(
    savedDocument.items
      .filter((item) => item.type === 'section')
      .map((item) => item.id),
    [
      'regional-representatives',
      'chairs-report',
      'welcome-and-leadership',
      'financials',
    ],
  );
});

async function withMigrationFixture(files, operation) {
  const directory = await mkdtemp(join(tmpdir(), 'afterburn-migration-'));
  try {
    for (const [relativePath, value] of Object.entries(files)) {
      const path = join(directory, ...relativePath.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
        'utf8',
      );
    }
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function rawReport(team, department, overview = '') {
  return {
    Team: team,
    Department: department,
    AuthorName: 'Reporter',
    ReportFinal: overview ? { generalOverview: overview } : '',
    ReportSubmission: '',
    ReportDraft: '',
  };
}

async function migrateFixture(files) {
  const reports = new Map();
  let document;
  const result = await withMigrationFixture(files, async (inputDirectory) =>
    migrateLegacyReportsToBlob({
      inputDirectory,
      reportStore: {
        async save(id, report) {
          reports.set(id, report);
        },
      },
      documentStore: {
        async uploadMedia() {
          throw new Error('Fixture should not upload media');
        },
        async save(value) {
          document = value;
        },
      },
    }));
  return { document, reports, result };
}

test('discovers moved reports and uses manifest ids only for declarative identity matches', async () => {
  const manifest = {
    departments: [
      {
        id: 'admin',
        name: 'Admin',
        teams: [
          { id: '001-admin', name: 'Admin Team', reportFile: 'reports/stale.json' },
        ],
      },
      {
        id: 'arts',
        name: 'Arts',
        teams: [
          { id: '002-artery', name: 'ARTery', reportFile: 'also-stale.json' },
        ],
      },
    ],
  };
  const { document, reports, result } = await migrateFixture({
    'report-manifest.json': manifest,
    'renamed/deep/arbitrary-name.json': rawReport('ARTery', 'Arts'),
    'uploads/not-the-manifest-name.json': rawReport('Admin Team', 'Admin', 'Done'),
    'uploads/new-team.json': rawReport('New Team', 'Admin'),
  });

  assert.equal(result.reportCount, 3);
  assert.deepEqual([...reports.keys()].sort(), ['001-admin', '002-artery', 'admin-new-team']);
  assert.deepEqual(
    document.items.filter(({ type }) => type === 'department').map((department) => ({
      id: department.id,
      reports: department.items.map(({ reportId }) => reportId),
    })),
    [
      { id: 'admin', reports: ['001-admin', 'admin-new-team'] },
      { id: 'arts', reports: ['002-artery'] },
    ],
  );
});

test('rejects duplicate declarative report identities', async () => {
  await assert.rejects(
    () => migrateFixture({
      'report-manifest.json': { departments: [] },
      'one.json': rawReport('Same Team', 'Admin'),
      'nested/two.json': rawReport('Same Team', 'Admin'),
    }),
    (error) => error.message.includes('Duplicate report identity "Admin / Same Team"')
      && error.message.includes('one.json')
      && error.message.includes(`nested${process.platform === 'win32' ? '\\' : '/'}two.json`),
  );
});

test('rejects unrelated or invalid JSON files instead of silently skipping them', async () => {
  await assert.rejects(
    () => migrateFixture({
      'report-manifest.json': { departments: [] },
      'reports/valid.json': rawReport('Valid Team', 'Admin'),
      'metadata.json': { application: 'not a report' },
    }),
    /JSON file "metadata\.json" is not a valid report: Team is required/,
  );
});

test('rejects malformed report revision values', async () => {
  await assert.rejects(
    () => migrateFixture({
      'report-manifest.json': { departments: [] },
      'reports/bad.json': {
        ...rawReport('Bad Team', 'Admin'),
        ReportFinal: { generalOverview: 42 },
      },
    }),
    /ReportFinal\.generalOverview must be text/,
  );
});

test('derives collision-safe ids deterministically', async () => {
  const files = {
    'report-manifest.json': {
      departments: [
        {
          id: 'a-b',
          name: 'Reserved',
          teams: [{ id: 'a-b-team', name: 'Reserved Team' }],
        },
      ],
    },
    'one.json': rawReport('Team', 'A & B'),
    'two.json': rawReport('Team', 'A B'),
    'reserved.json': rawReport('Reserved Team', 'Reserved'),
  };
  const first = await migrateFixture(files);
  const second = await migrateFixture(files);
  const firstDepartments = first.document.items.filter(({ type }) => type === 'department');
  const secondDepartments = second.document.items.filter(({ type }) => type === 'department');

  assert.deepEqual(firstDepartments, secondDepartments);
  assert.equal(new Set(firstDepartments.map(({ id }) => id)).size, 3);
  assert.equal(
    new Set(firstDepartments.flatMap(({ items }) => items.map(({ reportId }) => reportId))).size,
    3,
  );
});

test('maps supported media extensions and rejects unsupported files', () => {
  assert.equal(imageContentType('crew.PNG'), 'image/png');
  assert.equal(imageContentType('photo.jpeg'), 'image/jpeg');
  assert.throws(() => imageContentType('notes.txt'), /Unsupported image type/);
});

test('uses stable UUID-shaped ids for migrated media', () => {
  const firstId = mediaIdForInsert('site-map');
  assert.match(firstId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(mediaIdForInsert('site-map'), firstId);
  assert.notEqual(mediaIdForInsert('crew-photo'), firstId);
});
