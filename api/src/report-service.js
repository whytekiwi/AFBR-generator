import {
  ReportValidationError,
  validateReport,
} from './report-document.js';
import { BlobDocumentStore } from './document-store.js';
import { BlobReportStore, ReportNotFoundError } from './report-store.js';

function json(status, body) {
  return { status, jsonBody: body, headers: { 'Cache-Control': 'no-store' } };
}

async function requestReport(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { error: json(400, { error: 'Request body must be valid JSON' }) };
  }

  try {
    return { report: validateReport(body) };
  } catch (error) {
    if (error instanceof ReportValidationError) {
      return { error: json(400, { error: error.message, fields: error.errors }) };
    }
    throw error;
  }
}

function errorResponse(error, context) {
  if (error instanceof ReportNotFoundError) return json(404, { error: error.message });
  if (error.message === 'Invalid report id') return json(400, { error: error.message });
  context.error(error);
  return json(500, { error: 'The report service could not complete the request' });
}

export async function handleCollection(request, context, store) {
  try {
    store ??= BlobReportStore.fromEnvironment();
    if (request.method === 'GET') {
      return json(200, { items: await store.list(request.query.get('q') ?? '') });
    }
    const parsed = await requestReport(request);
    if (parsed.error) return parsed.error;
    return json(201, await store.create(parsed.report));
  } catch (error) {
    return errorResponse(error, context);
  }
}

export async function handleItem(request, context, store, documentStore) {
  try {
    store ??= BlobReportStore.fromEnvironment();
    const id = request.params.id;
    if (request.method === 'GET') return json(200, await store.get(id));
    if (request.method === 'DELETE') {
      documentStore ??= BlobDocumentStore.fromEnvironment();
      const outline = await documentStore.get();
      const nextOutline = {
        ...outline,
        items: outline.items.map((item) => item.type === 'department'
          ? {
              ...item,
              items: item.items.filter(
                (child) => child.type !== 'report' || child.reportId !== id,
              ),
            }
          : item),
      };
      if (JSON.stringify(nextOutline) !== JSON.stringify(outline)) {
        await documentStore.save(nextOutline);
      }
      await store.delete(id);
      return { status: 204 };
    }
    const parsed = await requestReport(request);
    if (parsed.error) return parsed.error;
    return json(200, await store.save(id, parsed.report));
  } catch (error) {
    return errorResponse(error, context);
  }
}
