import { randomUUID } from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  createReportMetadata,
  parseReportMarkdown,
  reportSummaryFromMetadata,
  serializeReportMarkdown,
} from './report-document.js';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

function requireId(id) {
  if (!ID_PATTERN.test(id)) throw new Error('Invalid report id');
  return id;
}

function slug(value) {
  return value.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'report';
}

async function streamToText(stream) {
  if (!stream) return '';
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export class ReportNotFoundError extends Error {
  constructor(id) {
    super(`Report "${id}" was not found`);
    this.name = 'ReportNotFoundError';
  }
}

export class BlobReportStore {
  constructor(containerClient) {
    this.container = containerClient;
  }

  static fromEnvironment() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
    }
    const service = BlobServiceClient.fromConnectionString(connectionString);
    return new BlobReportStore(
      service.getContainerClient(process.env.REPORTS_CONTAINER ?? 'afterburn-reports'),
    );
  }

  async ensureContainer() {
    await this.container.createIfNotExists();
  }

  async list(query = '') {
    await this.ensureContainer();
    const normalizedQuery = query.trim().toLowerCase();
    const items = [];
    for await (const blob of this.container.listBlobsFlat({ includeMetadata: true })) {
      if (!blob.name.endsWith('.md')) continue;
      const summary = reportSummaryFromMetadata({
        id: blob.name.slice(0, -3),
        metadata: blob.metadata,
        lastModified: blob.properties.lastModified,
        etag: blob.properties.etag,
      });
      const haystack = `${summary.authorName} ${summary.team} ${summary.department}`.toLowerCase();
      if (!normalizedQuery || haystack.includes(normalizedQuery)) items.push(summary);
    }
    return items.sort((left, right) =>
      left.department.localeCompare(right.department) || left.team.localeCompare(right.team));
  }

  async get(id) {
    const client = this.container.getBlockBlobClient(`${requireId(id)}.md`);
    try {
      const response = await client.download();
      const report = parseReportMarkdown(await streamToText(response.readableStreamBody));
      return {
        id,
        ...report,
        lastModified: response.lastModified?.toISOString() ?? null,
        etag: response.etag ?? null,
      };
    } catch (error) {
      if (error?.statusCode === 404) throw new ReportNotFoundError(id);
      throw error;
    }
  }

  async create(report) {
    const id = `${slug(report.team)}-${randomUUID().slice(0, 8)}`;
    return this.save(id, report);
  }

  async save(id, report) {
    await this.ensureContainer();
    const client = this.container.getBlockBlobClient(`${requireId(id)}.md`);
    const markdown = serializeReportMarkdown(report);
    await client.upload(
      markdown,
      Buffer.byteLength(markdown),
      {
        blobHTTPHeaders: { blobContentType: 'text/markdown; charset=utf-8' },
        metadata: createReportMetadata(report),
      },
    );
    return this.get(id);
  }

  async delete(id) {
    const response = await this.container
      .getBlockBlobClient(`${requireId(id)}.md`)
      .deleteIfExists();
    if (!response.succeeded) throw new ReportNotFoundError(id);
  }
}
