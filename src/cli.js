import { resolve } from 'node:path';
import {
  createBlobContainerClients,
  withMaterializedBlobInput,
} from './blob-input.js';
import { generatePdf } from './generator.js';
import { loadInput } from './input.js';
import { createDocumentModel } from './model.js';
import { defaultTheme } from './themes/default.js';

const FILESYSTEM_USAGE = 'node src\\cli.js --input <directory> --output <file.pdf>';
const BLOB_USAGE = 'node src\\cli.js --blob --cycle <year> --draft <true|false> --output <file.pdf>';

function parseArgs(args) {
  const values = new Map();
  let blob = false;

  for (let index = 0; index < args.length;) {
    const flag = args[index];
    if (flag === '--blob') {
      blob = true;
      index += 1;
      continue;
    }
    const value = args[index + 1];

    if (
      !['--input', '--output', '--cycle', '--title', '--draft', '--watermark-text'].includes(flag)
      || !value
    ) {
      throw new Error(`Usage:\n  ${FILESYSTEM_USAGE}\n  ${BLOB_USAGE}`);
    }

    values.set(flag, value);
    index += 2;
  }

  if (!values.has('--output')) {
    throw new Error(`Usage:\n  ${FILESYSTEM_USAGE}\n  ${BLOB_USAGE}`);
  }
  if (!blob && !values.has('--input')) {
    throw new Error(`Usage: ${FILESYSTEM_USAGE}`);
  }
  if (blob && values.has('--input')) {
    throw new Error('--blob and --input cannot be used together');
  }
  if (blob && (!values.has('--cycle') || !values.has('--draft'))) {
    throw new Error(`Usage: ${BLOB_USAGE}`);
  }
  if (values.has('--draft') && !['true', 'false'].includes(values.get('--draft'))) {
    throw new Error('--draft must be either "true" or "false"');
  }

  return {
    blob,
    inputDirectory: values.has('--input') ? resolve(values.get('--input')) : null,
    outputFile: resolve(values.get('--output')),
    document: blob
      ? {
          title: values.get('--title') ?? `Kiwiburn ${values.get('--cycle')} Afterburn Report`,
          cycle: values.get('--cycle'),
          draft: {
            enabled: values.get('--draft') === 'true',
            watermarkText: values.get('--watermark-text') ?? 'DRAFT',
          },
        }
      : null,
  };
}

async function renderInput(inputDirectory, outputFile) {
  const input = await loadInput(inputDirectory);
  const documentModel = createDocumentModel(input);
  return generatePdf({
    documentModel,
    outputFile,
    theme: defaultTheme,
  });
}

try {
  const options = parseArgs(process.argv.slice(2));
  const pageNumbers = options.blob
    ? await withMaterializedBlobInput(
        { ...createBlobContainerClients(), document: options.document },
        (inputDirectory) => renderInput(inputDirectory, options.outputFile),
      )
    : await renderInput(options.inputDirectory, options.outputFile);

  console.log(`Generated ${options.outputFile}`);
  console.log(
    `Contents pages: ${Object.entries(pageNumbers)
      .map(([id, page]) => `${id}=${page}`)
      .join(', ')}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
