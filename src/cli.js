import { resolve } from 'node:path';
import { generatePdf } from './generator.js';
import { loadInput } from './input.js';
import { createDocumentModel } from './model.js';
import { defaultTheme } from './themes/default.js';

function parseArgs(args) {
  const values = new Map();

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];

    if (!['--input', '--output'].includes(flag) || !value) {
      throw new Error(
        'Usage: npm run render -- --input <directory> --output <file.pdf>',
      );
    }

    values.set(flag, value);
  }

  if (!values.has('--input') || !values.has('--output')) {
    throw new Error(
      'Usage: npm run render -- --input <directory> --output <file.pdf>',
    );
  }

  return {
    inputDirectory: resolve(values.get('--input')),
    outputFile: resolve(values.get('--output')),
  };
}

try {
  const { inputDirectory, outputFile } = parseArgs(process.argv.slice(2));
  const input = await loadInput(inputDirectory);
  const documentModel = createDocumentModel(input);
  const pageNumbers = await generatePdf({
    documentModel,
    outputFile,
    theme: defaultTheme,
  });

  console.log(`Generated ${outputFile}`);
  console.log(
    `Department pages: ${Object.entries(pageNumbers)
      .map(([id, page]) => `${id}=${page}`)
      .join(', ')}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
