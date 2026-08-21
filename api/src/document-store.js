import { randomUUID } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  DocumentValidationError,
  parseContentSection,
  serializeContentSection,
  stripSectionBodies,
  validateDocumentOutline,
} from './document-domain.js';
import { BlobReportStore } from './report-store.js';

const IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);
const MEDIA_ID_PATTERN = /^[a-f0-9-]{36}$/;
const IMAGE_TYPE_BY_EXTENSION = new Map([
  ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
]);

function slugDepartment(value) {
  return value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function uniqueDepartmentId(name, usedIds) {
  const base = slugDepartment(name) || 'department';
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base.slice(0, 95 - String(suffix).length)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

async function streamToBuffer(stream) {
  const chunks = [];
  if (stream) {
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function decodeMetadata(value = '') {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class DocumentNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocumentNotFoundError';
  }
}

export class BlobDocumentStore {
  constructor(containerClient, reportStore) {
    this.container = containerClient;
    this.reportStore = reportStore;
  }

  static fromEnvironment() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
    const service = BlobServiceClient.fromConnectionString(connectionString);
    return new BlobDocumentStore(
      service.getContainerClient(process.env.DOCUMENT_CONTAINER ?? 'afterburn-document'),
      BlobReportStore.fromEnvironment(),
    );
  }

  async ensureContainer() {
    await this.container.createIfNotExists();
  }

  async defaultOutline() {
    const reports = await this.reportStore.list();
    const departments = new Map();
    const departmentIds = new Set();
    for (const report of reports) {
      if (!departments.has(report.department)) departments.set(report.department, []);
      departments.get(report.department).push({ type: 'report', reportId: report.id });
    }
    return validateDocumentOutline({
      version: 1,
      items: [
        {
          type: 'section',
          id: 'regional-representatives',
          title: 'A word from our Regional Burning Man Representatives',
          body: 'Content will be supplied later.',
        },
        { type: 'contents', id: 'contents' },
        {
          type: 'section',
          id: 'chairs-report',
          title: "Chair's Report",
          body: 'Content will be supplied later.',
        },
        {
          type: 'section',
          id: 'welcome-and-leadership',
          title: 'Welcome and leadership structure',
          body: 'Content will be supplied later.',
        },
        ...[...departments.entries()].map(([name, items]) => ({
          type: 'department',
          id: uniqueDepartmentId(name, departmentIds),
          name,
          items,
        })),
      ],
    });
  }

  async get() {
    await this.ensureContainer();
    const client = this.container.getBlockBlobClient('manifest.json');
    if (!(await client.exists())) return this.defaultOutline();

    const response = await client.download();
    const manifest = JSON.parse((await streamToBuffer(response.readableStreamBody)).toString('utf8'));
    const items = [];
    for (const item of manifest.items ?? []) {
      if (item.type !== 'section') {
        items.push(item);
        continue;
      }
      const sectionClient = this.container.getBlockBlobClient(item.file);
      try {
        const sectionResponse = await sectionClient.download();
        const section = parseContentSection(
          (await streamToBuffer(sectionResponse.readableStreamBody)).toString('utf8'),
        );
        items.push({ type: 'section', id: item.id, ...section });
      } catch (error) {
        if (error?.statusCode === 404) {
          throw new DocumentNotFoundError(`Section "${item.id}" could not be found`);
        }
        throw error;
      }
    }
    return validateDocumentOutline({ version: 1, items });
  }

  async save(value) {
    await this.ensureContainer();
    const document = validateDocumentOutline(value);
    const reportsById = new Map(
      (await this.reportStore.list()).map((report) => [report.id, report]),
    );
    const referenceErrors = [];
    document.items.forEach((item, itemIndex) => {
      if (item.type !== 'department') return;
      item.items.forEach((child, childIndex) => {
        if (child.type === 'report' && !reportsById.has(child.reportId)) {
          referenceErrors.push({
            field: `items[${itemIndex}].items[${childIndex}].reportId`,
            message: `Report "${child.reportId}" does not exist`,
          });
        }
      });
    });
    if (referenceErrors.length > 0) throw new DocumentValidationError(referenceErrors);
    const saveId = randomUUID();
    const manifestDocument = stripSectionBodies(
      document,
      (section) => `sections/${section.id}/${saveId}.md`,
    );

    for (const section of document.items.filter(({ type }) => type === 'section')) {
      const file = manifestDocument.items.find(
        (item) => item.type === 'section' && item.id === section.id,
      ).file;
      const markdown = serializeContentSection(section);
      await this.container.getBlockBlobClient(file).upload(
        markdown,
        Buffer.byteLength(markdown),
        { blobHTTPHeaders: { blobContentType: 'text/markdown; charset=utf-8' } },
      );
    }

    const manifest = `${JSON.stringify(manifestDocument, null, 2)}\n`;
    await this.container.getBlockBlobClient('manifest.json').upload(
      manifest,
      Buffer.byteLength(manifest),
      { blobHTTPHeaders: { blobContentType: 'application/json; charset=utf-8' } },
    );
    return this.get();
  }

  async uploadMedia({ bytes, contentType, fileName, id: requestedId }) {
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    const normalizedContentType = IMAGE_TYPES.has(contentType)
      ? contentType
      : IMAGE_TYPE_BY_EXTENSION.get(extension);
    if (!normalizedContentType) throw new Error('Unsupported image type');
    if (bytes.length === 0) throw new Error('Images must not be empty');
    await this.ensureContainer();
    const id = requestedId ?? randomUUID();
    if (!MEDIA_ID_PATTERN.test(id)) throw new Error('Invalid media id');
    await this.container.getBlockBlobClient(`media/${id}`).upload(bytes, bytes.length, {
      blobHTTPHeaders: { blobContentType: normalizedContentType },
      metadata: {
        filename: encodeURIComponent(fileName),
        contenttype: encodeURIComponent(normalizedContentType),
      },
    });
    return { id, fileName, contentType: normalizedContentType, url: `/api/media/${id}` };
  }

  async getMedia(id) {
    if (!MEDIA_ID_PATTERN.test(id)) throw new Error('Invalid media id');
    const client = this.container.getBlockBlobClient(`media/${id}`);
    try {
      const response = await client.download();
      return {
        bytes: await streamToBuffer(response.readableStreamBody),
        contentType: response.contentType ?? decodeMetadata(response.metadata?.contenttype),
        fileName: decodeMetadata(response.metadata?.filename),
      };
    } catch (error) {
      if (error?.statusCode === 404) throw new DocumentNotFoundError(`Media "${id}" was not found`);
      throw error;
    }
  }
}
