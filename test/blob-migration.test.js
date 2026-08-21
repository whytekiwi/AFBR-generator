import test from 'node:test';
import assert from 'node:assert/strict';
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

  assert.deepEqual(result, {
    departmentCount: 14,
    mediaCount: 0,
    populatedReportCount: 66,
    reportCount: 89,
  });
  assert.equal(reports.size, 89);
  assert.equal(reports.get('004-admin-team').department, 'Admin');
  assert.equal(savedDocument.version, 1);
  assert.equal(
    savedDocument.items
      .filter((item) => item.type === 'department')
      .flatMap((department) => department.items)
      .filter((item) => item.type === 'report')
      .length,
    89,
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
