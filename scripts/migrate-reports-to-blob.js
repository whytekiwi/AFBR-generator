import { BlobDocumentStore } from '../api/src/document-store.js';
import { BlobReportStore } from '../api/src/report-store.js';
import { migrateLegacyReportsToBlob } from '../src/blob-migration.js';

function commandLine(args) {
  const options = new Map();
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const equalsIndex = value.indexOf('=');
    if (equalsIndex !== -1) {
      options.set(value.slice(0, equalsIndex), value.slice(equalsIndex + 1));
      continue;
    }
    options.set(value, args[index + 1]);
    index += 1;
  }
  return { options, positional };
}

function parseArgs(args) {
  const { options, positional } = commandLine(args);
  if (positional.length > 1 && options.size === 0) {
    throw new Error(
      'Only the input directory may be positional. Set container overrides with '
      + 'REPORTS_CONTAINER and DOCUMENT_CONTAINER when invoking through npm, '
      + 'or invoke this script directly with named options.',
    );
  }
  const npmOptionValues = new Set([
    process.env.npm_config_connection_string,
    process.env.npm_config_document_container,
    process.env.npm_config_reports_container,
  ].filter(Boolean));
  const inputDirectory = options.get('--input')
    ?? process.env.npm_config_input
    ?? positional.find((value) => !npmOptionValues.has(value));
  if (!inputDirectory) {
    throw new Error(
      'Usage: npm run migrate:blob -- <raw-json-directory>',
    );
  }
  return {
    connectionString: options.get('--connection-string')
      ?? process.env.npm_config_connection_string,
    documentContainer: options.get('--document-container')
      ?? process.env.npm_config_document_container,
    inputDirectory,
    reportsContainer: options.get('--reports-container')
      ?? process.env.npm_config_reports_container,
  };
}

const options = parseArgs(process.argv.slice(2));
if (options.connectionString) {
  process.env.AZURE_STORAGE_CONNECTION_STRING = options.connectionString;
}
if (options.reportsContainer) process.env.REPORTS_CONTAINER = options.reportsContainer;
if (options.documentContainer) process.env.DOCUMENT_CONTAINER = options.documentContainer;
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error(
    'AZURE_STORAGE_CONNECTION_STRING is required. Set it in the environment '
    + 'or pass --connection-string.',
  );
}

const result = await migrateLegacyReportsToBlob({
  inputDirectory: options.inputDirectory,
  reportStore: BlobReportStore.fromEnvironment(),
  documentStore: BlobDocumentStore.fromEnvironment(),
});

console.log(
  `Uploaded ${result.reportCount} reports (${result.populatedReportCount} populated), `
  + `${result.departmentCount} departments, and ${result.mediaCount} media assets.`,
);
