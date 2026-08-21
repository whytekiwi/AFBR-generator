import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentValidationError,
  parseContentSection,
  serializeContentSection,
  stripSectionBodies,
  validateDocumentOutline,
} from '../src/document-domain.js';

const document = {
  version: 1,
  items: [
    { type: 'section', id: 'welcome', title: 'Welcome', body: 'Hello **everyone**.' },
    { type: 'contents', id: 'contents' },
    {
      type: 'department',
      id: 'admin',
      name: 'Admin',
      items: [
        { type: 'report', reportId: '001-backburners' },
        {
          type: 'image',
          id: 'admin-photo',
          mediaId: 'a-media-id',
          fileName: 'admin.jpg',
          contentType: 'image/jpeg',
          altText: 'Admin crew',
          caption: '',
        },
      ],
    },
  ],
};

test('validates and normalizes an ordered document outline', () => {
  assert.deepEqual(validateDocumentOutline(document), document);
});

test('rejects duplicate report placement', () => {
  assert.throws(
    () => validateDocumentOutline({
      version: 1,
      items: [
        { type: 'department', id: 'one', name: 'One', items: [{ type: 'report', reportId: 'r1' }] },
        { type: 'department', id: 'two', name: 'Two', items: [{ type: 'report', reportId: 'r1' }] },
      ],
    }),
    DocumentValidationError,
  );
});

test('round trips a title and Markdown body', () => {
  const section = document.items[0];
  assert.deepEqual(parseContentSection(serializeContentSection(section)), {
    title: section.title,
    body: section.body,
  });
});

test('manifest stores section file references instead of content', () => {
  assert.deepEqual(stripSectionBodies(document).items[0], {
    type: 'section',
    id: 'welcome',
    file: 'sections/welcome.md',
  });
});

test('manifest can use immutable section file versions', () => {
  assert.deepEqual(
    stripSectionBodies(document, (section) => `sections/${section.id}/save-id.md`).items[0],
    {
      type: 'section',
      id: 'welcome',
      file: 'sections/welcome/save-id.md',
    },
  );
});
