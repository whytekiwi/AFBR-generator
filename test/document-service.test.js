import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDocument,
  handleMediaCollection,
  handleMediaItem,
} from '../api/src/document-service.js';

const context = { error() {} };
const document = {
  version: 1,
  items: [{ type: 'contents', id: 'contents' }],
};

test('loads the ordered document outline', async () => {
  const response = await handleDocument(
    { method: 'GET' },
    context,
    { async get() { return document; } },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, document);
});

test('saves the ordered document outline', async () => {
  const store = {
    async save(value) {
      assert.deepEqual(value, document);
      return value;
    },
  };
  const response = await handleDocument(
    { method: 'PUT', async json() { return document; } },
    context,
    store,
  );
  assert.equal(response.status, 200);
});

test('uploads an image from multipart form data', async () => {
  const file = {
    name: 'crew.png',
    type: 'image/png',
    async arrayBuffer() { return Uint8Array.from([1, 2, 3]).buffer; },
  };
  const store = {
    async uploadMedia(value) {
      assert.equal(value.fileName, 'crew.png');
      assert.equal(value.contentType, 'image/png');
      assert.deepEqual([...value.bytes], [1, 2, 3]);
      return { id: 'media-id' };
    },
  };
  const response = await handleMediaCollection(
    { async formData() { return new Map([['file', file]]); } },
    context,
    store,
  );
  assert.equal(response.status, 201);
  assert.equal(response.jsonBody.id, 'media-id');
});

test('serves uploaded image bytes', async () => {
  const response = await handleMediaItem(
    { params: { id: 'media-id' } },
    context,
    {
      async getMedia() {
        return {
          bytes: Buffer.from([1, 2, 3]),
          contentType: 'image/png',
          fileName: 'crew.png',
        };
      },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.deepEqual([...response.body], [1, 2, 3]);
});
