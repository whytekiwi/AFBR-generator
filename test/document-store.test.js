import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentValidationError } from '../api/src/document-domain.js';
import { BlobDocumentStore } from '../api/src/document-store.js';

test('generates valid unique department ids for the default outline', async () => {
  const store = new BlobDocumentStore(null, {
    async list() {
      return [
        { id: 'one', department: '!!!' },
        { id: 'two', department: '???' },
        { id: 'three', department: 'Admin' },
        { id: 'four', department: 'Ádmin' },
      ];
    },
  });

  const outline = await store.defaultOutline();
  assert.deepEqual(
    outline.items
      .filter((item) => item.type === 'department')
      .map((item) => item.id),
    ['department', 'department-2', 'admin', 'admin-2'],
  );
});

test('rejects outline references to reports that do not exist', async () => {
  const store = new BlobDocumentStore(
    { async createIfNotExists() {} },
    { async list() { return []; } },
  );

  await assert.rejects(
    () => store.save({
      version: 1,
      items: [
        {
          type: 'department',
          id: 'admin',
          name: 'Admin',
          items: [{ type: 'report', reportId: 'missing' }],
        },
      ],
    }),
    DocumentValidationError,
  );
});
