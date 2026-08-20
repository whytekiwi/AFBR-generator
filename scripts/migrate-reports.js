import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { loadInput } from '../src/input.js';
import { serializeReportMarkdown } from '../src/report-document.js';

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    values.set(args[index], args[index + 1]);
  }
  const input = values.get('--input') ?? args[0];
  const output = values.get('--output') ?? args[1];
  if (!input || !output) {
    throw new Error('Usage: npm run migrate -- <input-directory> <output-directory>');
  }
  return {
    inputDirectory: resolve(input),
    outputDirectory: resolve(output),
  };
}

const { inputDirectory, outputDirectory } = parseArgs(process.argv.slice(2));
const input = await loadInput(inputDirectory);
const manifest = structuredClone(input.manifest);
let populated = 0;

for (const [departmentIndex, department] of input.departments.entries()) {
  for (const [teamIndex, team] of department.teams.entries()) {
    const content = team.selectedRevision.content ?? {};
    if (team.selectedRevision.content) populated += 1;
    const report = {
      authorName: content.authorName ?? team.report.AuthorName,
      team: team.name,
      department: department.name,
      generalOverview: content.generalOverview ?? '',
      crewPerformance: content.crewPerformance ?? '',
      resources: content.resources ?? '',
      budgetAnalysis: content.budgetAnalysis ?? '',
      improvements: content.improvements ?? '',
    };
    const oldReference = manifest.departments[departmentIndex].teams[teamIndex].reportFile;
    const relativeDirectory = dirname(oldReference);
    const filename = `${basename(oldReference, extname(oldReference))}.md`;
    const newReference = join(relativeDirectory, filename).replaceAll('\\', '/');
    manifest.departments[departmentIndex].teams[teamIndex].reportFile = newReference;

    const outputPath = join(outputDirectory, newReference);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serializeReportMarkdown(report), 'utf8');
  }
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  join(outputDirectory, 'report-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(
  `Migrated ${input.departments.flatMap((department) => department.teams).length} reports `
  + `(${populated} populated) to ${outputDirectory}`,
);
