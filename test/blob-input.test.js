import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  BlobInputError,
  materializeBlobInput,
  withMaterializedBlobInput,
} from '../src/blob-input.js';
import { loadInput } from '../src/input.js';
import { serializeContentSection } from '../src/document-domain.js';
import { serializeReportMarkdown } from '../src/report-document.js';

const SECTION_SAVE_ID = '123e4567-e89b-42d3-a456-426614174000';
const TOP_MEDIA_ID = '123e4567-e89b-42d3-a456-426614174001';
const DEPARTMENT_MEDIA_ID = '123e4567-e89b-42d3-a456-426614174002';
const documentConfig = {
  title: 'Kiwiburn 2026 Afterburn Report',
  cycle: '2026',
  draft: { enabled: false, watermarkText: 'DRAFT' },
};

function fakeContainer(name, blobs) {
  return {
    containerName: name,
    getBlockBlobClient(blobName) {
      return {
        async download() {
          if (!blobs.has(blobName)) {
            const error = new Error('Not found');
            error.statusCode = 404;
            error.code = 'BlobNotFound';
            throw error;
          }
          return {
            readableStreamBody: Readable.from([blobs.get(blobName)]),
          };
        },
      };
    },
  };
}

function fixtureContainers({ omit, transformManifest } = {}) {
  const sectionFile = `sections/welcome/${SECTION_SAVE_ID}.md`;
  const manifest = {
    version: 1,
    items: [
      { type: 'section', id: 'welcome', file: sectionFile },
      { type: 'contents', id: 'contents' },
      {
        type: 'image',
        id: 'cover-photo',
        mediaId: TOP_MEDIA_ID,
        fileName: 'cover.png',
        contentType: 'image/png',
        altText: 'Cover',
        caption: '',
      },
      {
        type: 'department',
        id: 'admin',
        name: 'Admin',
        items: [
          { type: 'report', reportId: 'backburners' },
          {
            type: 'image',
            id: 'admin-photo',
            mediaId: DEPARTMENT_MEDIA_ID,
            fileName: 'admin.jpg',
            contentType: 'image/jpeg',
            altText: 'Admin',
            caption: 'Admin team',
          },
        ],
      },
    ],
  };
  transformManifest?.(manifest);
  const documentBlobs = new Map([
    ['manifest.json', JSON.stringify(manifest)],
    [sectionFile, serializeContentSection({ title: 'Welcome', body: 'Hello **everyone**.' })],
    [`media/${TOP_MEDIA_ID}`, Buffer.from('top-image')],
    [`media/${DEPARTMENT_MEDIA_ID}`, Buffer.from('department-image')],
  ]);
  const reportBlobs = new Map([
    ['backburners.md', serializeReportMarkdown({
      authorName: 'Taylor',
      team: 'Backburners',
      department: 'Admin',
      generalOverview: 'A report.',
    })],
  ]);
  documentBlobs.delete(omit);
  reportBlobs.delete(omit);
  return {
    documentContainer: fakeContainer('documents', documentBlobs),
    reportsContainer: fakeContainer('reports', reportBlobs),
    document: documentConfig,
  };
}

test('materializes normalized Blob content in authoritative outline order', async () => {
  await withMaterializedBlobInput(fixtureContainers(), async (inputDirectory) => {
    const input = await loadInput(inputDirectory);

    assert.deepEqual(input.outline.map(({ type }) => type), [
      'section',
      'contents',
      'image',
      'department',
    ]);
    assert.equal(input.outline[0].title, 'Welcome');
    assert.equal(input.outline[0].body, 'Hello **everyone**.');
    assert.equal(input.departments[0].teams[0].name, 'Backburners');
    assert.equal(input.outline[3].items[0].team.id, 'backburners');
    assert.equal(input.outline[2].src, `media/${TOP_MEDIA_ID}`);
    assert.equal(input.outline[3].items[1].src, `media/${DEPARTMENT_MEDIA_ID}`);
    assert.equal(
      await readFile(join(inputDirectory, 'media', TOP_MEDIA_ID), 'utf8'),
      'top-image',
    );
  });
});

for (const [description, missingBlob, expectedMessage] of [
  ['manifest', 'manifest.json', 'Document manifest blob "manifest.json" was not found'],
  [
    'section',
    `sections/welcome/${SECTION_SAVE_ID}.md`,
    `Section "welcome" blob "sections/welcome/${SECTION_SAVE_ID}.md" was not found`,
  ],
  ['report', 'backburners.md', 'Report "backburners" blob "backburners.md" was not found'],
  [
    'media',
    `media/${TOP_MEDIA_ID}`,
    `Media "${TOP_MEDIA_ID}" blob "media/${TOP_MEDIA_ID}" was not found`,
  ],
]) {
  test(`reports an actionable missing ${description} error`, async () => {
    await assert.rejects(
      () => materializeBlobInput(fixtureContainers({ omit: missingBlob })),
      (error) => error instanceof BlobInputError && error.message.includes(expectedMessage),
    );
  });
}

test('rejects section paths that do not use immutable save UUIDs', async () => {
  await assert.rejects(
    () => materializeBlobInput(fixtureContainers({
      transformManifest(manifest) {
        manifest.items[0].file = 'sections/welcome/current.md';
      },
    })),
    /must match "sections\/welcome\/\{saveUuid\}\.md"/,
  );
});

test('supports normalized documents that do not yet contain departments', async () => {
  await withMaterializedBlobInput(
    fixtureContainers({
      transformManifest(manifest) {
        manifest.items = manifest.items.slice(0, 2);
      },
    }),
    async (inputDirectory) => {
      const input = await loadInput(inputDirectory);
      assert.deepEqual(input.departments, []);
      assert.deepEqual(input.outline.map(({ type }) => type), ['section', 'contents']);
    },
  );
});

test('always removes the temporary input directory after rendering work', async () => {
  let materializedDirectory;
  await assert.rejects(
    () => withMaterializedBlobInput(fixtureContainers(), async (inputDirectory) => {
      materializedDirectory = inputDirectory;
      await access(join(inputDirectory, 'report-manifest.json'));
      throw new Error('render failed');
    }),
    /render failed/,
  );
  await assert.rejects(() => access(materializedDirectory));
});

test('removes a partial temporary directory when adaptation fails', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'afterburn-blob-test-'));
  try {
    await assert.rejects(
      () => materializeBlobInput({
        ...fixtureContainers({ omit: 'backburners.md' }),
        temporaryRoot,
      }),
      BlobInputError,
    );
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
