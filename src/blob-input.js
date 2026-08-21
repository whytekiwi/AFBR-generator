import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  DocumentValidationError,
  parseContentSection,
  validateDocumentOutline,
} from './document-domain.js';
import { parseReportMarkdown } from './report-document.js';

const REPORT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const MEDIA_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SAVE_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export class BlobInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlobInputError';
  }
}

async function streamToBuffer(stream) {
  if (!stream) return Buffer.alloc(0);
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function containerName(container, fallback) {
  return container.containerName ?? fallback;
}

async function downloadBlob(container, blobName, description, fallbackContainerName) {
  try {
    const response = await container.getBlockBlobClient(blobName).download();
    return {
      bytes: await streamToBuffer(response.readableStreamBody),
      contentType: response.contentType,
    };
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === 'BlobNotFound') {
      throw new BlobInputError(
        `${description} blob "${blobName}" was not found in container `
        + `"${containerName(container, fallbackContainerName)}"`,
      );
    }
    throw error;
  }
}

function parseManifest(bytes, container) {
  try {
    return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new BlobInputError(
      `Document manifest blob "manifest.json" in container `
      + `"${containerName(container, 'afterburn-document')}" contains invalid JSON: ${error.message}`,
    );
  }
}

function requireReportId(value, location) {
  if (typeof value !== 'string' || !REPORT_ID_PATTERN.test(value)) {
    throw new BlobInputError(
      `${location} must contain a valid lowercase report id (letters, numbers, and hyphens)`,
    );
  }
  return value;
}

function requireOutlineId(value, location) {
  if (typeof value !== 'string' || !REPORT_ID_PATTERN.test(value)) {
    throw new BlobInputError(
      `${location} must contain lowercase letters, numbers, and hyphens only`,
    );
  }
  return value;
}

function requireMediaId(value, location) {
  if (typeof value !== 'string' || !MEDIA_ID_PATTERN.test(value)) {
    throw new BlobInputError(`${location} must contain a valid UUID media id`);
  }
  return value;
}

function requireSectionFile(value, sectionId, location) {
  if (typeof value !== 'string') {
    throw new BlobInputError(`${location} must be a section blob path`);
  }
  const parts = value.split('/');
  if (
    parts.length !== 3
    || parts[0] !== 'sections'
    || parts[1] !== sectionId
    || !parts[2].endsWith('.md')
    || !SAVE_ID_PATTERN.test(parts[2].slice(0, -3))
  ) {
    throw new BlobInputError(
      `${location} must match "sections/${sectionId}/{saveUuid}.md"`,
    );
  }
  return value;
}

function formatDocumentValidation(error) {
  if (!(error instanceof DocumentValidationError)) return error.message;
  return error.errors.map(({ field, message }) => `${field}: ${message}`).join('; ');
}

async function writeRelativeFile(root, relativePath, bytes) {
  const path = join(root, ...relativePath.split('/'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

export function createBlobContainerClients({
  connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING,
  reportsContainerName = process.env.REPORTS_CONTAINER ?? 'afterburn-reports',
  documentContainerName = process.env.DOCUMENT_CONTAINER ?? 'afterburn-document',
} = {}) {
  if (!connectionString) {
    throw new BlobInputError('AZURE_STORAGE_CONNECTION_STRING is not configured');
  }
  const service = BlobServiceClient.fromConnectionString(connectionString);
  return {
    reportsContainer: service.getContainerClient(reportsContainerName),
    documentContainer: service.getContainerClient(documentContainerName),
  };
}

export async function materializeBlobInput({
  documentContainer,
  reportsContainer,
  document,
  temporaryRoot = tmpdir(),
}) {
  const inputDirectory = await mkdtemp(join(temporaryRoot, 'afterburn-blob-input-'));
  try {
    const manifestDownload = await downloadBlob(
      documentContainer,
      'manifest.json',
      'Document manifest',
      'afterburn-document',
    );
    const storedManifest = parseManifest(manifestDownload.bytes, documentContainer);
    if (storedManifest?.version !== 1 || !Array.isArray(storedManifest.items)) {
      throw new BlobInputError(
        'Document manifest blob "manifest.json" must be a normalized version 1 manifest',
      );
    }

    const hydratedItems = [];
    const sectionFiles = new Map();
    for (const [index, item] of storedManifest.items.entries()) {
      if (item?.type !== 'section') {
        hydratedItems.push(item);
        continue;
      }
      const sectionId = requireOutlineId(item.id, `manifest.items[${index}].id`);
      const file = requireSectionFile(item.file, sectionId, `manifest.items[${index}].file`);
      const sectionDownload = await downloadBlob(
        documentContainer,
        file,
        `Section "${sectionId}"`,
        'afterburn-document',
      );
      let section;
      try {
        section = parseContentSection(sectionDownload.bytes.toString('utf8'));
      } catch (error) {
        throw new BlobInputError(`Section blob "${file}" is invalid: ${error.message}`);
      }
      hydratedItems.push({ type: 'section', id: sectionId, ...section });
      sectionFiles.set(sectionId, { file, bytes: sectionDownload.bytes });
    }

    let outline;
    try {
      outline = validateDocumentOutline({ version: 1, items: hydratedItems });
    } catch (error) {
      throw new BlobInputError(`Document manifest validation failed: ${formatDocumentValidation(error)}`);
    }

    const departments = [];
    const reportFiles = new Map();
    const mediaIds = new Set();
    for (const [itemIndex, item] of outline.items.entries()) {
      if (item.type === 'image') {
        mediaIds.add(requireMediaId(item.mediaId, `manifest.items[${itemIndex}].mediaId`));
      }
      if (item.type !== 'department') continue;

      const teams = [];
      for (const [childIndex, child] of item.items.entries()) {
        const location = `manifest.items[${itemIndex}].items[${childIndex}]`;
        if (child.type === 'image') {
          mediaIds.add(requireMediaId(child.mediaId, `${location}.mediaId`));
          continue;
        }
        const reportId = requireReportId(child.reportId, `${location}.reportId`);
        const reportBlobName = `${reportId}.md`;
        const reportDownload = await downloadBlob(
          reportsContainer,
          reportBlobName,
          `Report "${reportId}"`,
          'afterburn-reports',
        );
        let report;
        try {
          report = parseReportMarkdown(reportDownload.bytes.toString('utf8'));
        } catch (error) {
          throw new BlobInputError(`Report blob "${reportBlobName}" is invalid: ${error.message}`);
        }
        if (report.department !== item.name) {
          throw new BlobInputError(
            `Report blob "${reportBlobName}" belongs to department "${report.department}", `
            + `but manifest department "${item.id}" is "${item.name}"`,
          );
        }
        const reportFile = `reports/${reportBlobName}`;
        reportFiles.set(reportId, { file: reportFile, bytes: reportDownload.bytes });
        teams.push({ id: reportId, name: report.team, reportFile });
      }
      departments.push({ id: item.id, name: item.name, teams });
    }

    const mediaFiles = new Map();
    for (const mediaId of mediaIds) {
      const blobName = `media/${mediaId}`;
      const mediaDownload = await downloadBlob(
        documentContainer,
        blobName,
        `Media "${mediaId}"`,
        'afterburn-document',
      );
      mediaFiles.set(mediaId, mediaDownload.bytes);
    }

    const rendererItems = storedManifest.items.map((item) => {
      if (item.type === 'section') {
        return { type: 'section', id: item.id, file: sectionFiles.get(item.id).file };
      }
      return item;
    });
    const rendererManifest = {
      document,
      frontMatter: {},
      financials: {},
      departments,
      items: rendererItems,
    };

    await Promise.all([
      writeFile(
        join(inputDirectory, 'report-manifest.json'),
        `${JSON.stringify(rendererManifest, null, 2)}\n`,
        'utf8',
      ),
      ...[...sectionFiles.values()].map(({ file, bytes }) =>
        writeRelativeFile(inputDirectory, file, bytes)),
      ...[...reportFiles.values()].map(({ file, bytes }) =>
        writeRelativeFile(inputDirectory, file, bytes)),
      ...[...mediaFiles].map(([mediaId, bytes]) =>
        writeRelativeFile(inputDirectory, `media/${mediaId}`, bytes)),
    ]);

    return inputDirectory;
  } catch (error) {
    await rm(inputDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function withMaterializedBlobInput(options, callback) {
  const inputDirectory = await materializeBlobInput(options);
  try {
    return await callback(inputDirectory);
  } finally {
    await rm(inputDirectory, { recursive: true, force: true });
  }
}
