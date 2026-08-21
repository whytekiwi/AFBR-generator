import { DocumentValidationError } from './document-domain.js';
import { BlobDocumentStore, DocumentNotFoundError } from './document-store.js';

function json(status, body) {
  return { status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } };
}

function failure(error, context) {
  if (error instanceof DocumentValidationError) {
    return json(400, { error: error.message, fields: error.errors });
  }
  if (error instanceof DocumentNotFoundError) return json(404, { error: error.message });
  if (['Invalid media id', 'Unsupported image type', 'Images must be between 1 byte and 10 MB']
    .includes(error.message)) {
    return json(400, { error: error.message });
  }
  context.error(error);
  return json(500, { error: 'The document service could not complete the request' });
}

export async function handleDocument(request, context, store) {
  try {
    store ??= BlobDocumentStore.fromEnvironment();
    if (request.method === 'GET') return json(200, await store.get());
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Request body must be valid JSON' });
    }
    return json(200, await store.save(body));
  } catch (error) {
    return failure(error, context);
  }
}

export async function handleMediaCollection(request, context, store) {
  try {
    store ??= BlobDocumentStore.fromEnvironment();
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return json(400, { error: 'A file upload is required' });
    }
    return json(201, await store.uploadMedia({
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      fileName: file.name,
    }));
  } catch (error) {
    return failure(error, context);
  }
}

export async function handleMediaItem(request, context, store) {
  try {
    store ??= BlobDocumentStore.fromEnvironment();
    const media = await store.getMedia(request.params.id);
    return {
      status: 200,
      body: media.bytes,
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Type': media.contentType,
        'Content-Disposition': `inline; filename="${media.fileName.replaceAll('"', '')}"`,
      },
    };
  } catch (error) {
    return failure(error, context);
  }
}
