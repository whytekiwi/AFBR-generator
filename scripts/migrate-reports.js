import { copyFile, mkdir, writeFile } from 'node:fs/promises';
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
manifest.items = [];
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

const contentSections = [
  {
    id: 'regional-representatives',
    title: manifest.frontMatter?.regionalRepresentatives?.title
      ?? 'A word from our Regional Burning Man Representatives',
    body: 'Content will be supplied later.',
  },
  {
    id: 'chairs-report',
    title: manifest.frontMatter?.chairsReport?.title ?? "Chair's Report",
    body: 'Content will be supplied later.',
  },
  {
    id: 'welcome-and-leadership',
    title: 'Welcome and leadership structure',
    body: 'Content will be supplied later.',
  },
];

for (const section of contentSections) {
  const file = `sections/${section.id}.md`;
  await mkdir(join(outputDirectory, 'sections'), { recursive: true });
  await writeFile(join(outputDirectory, file), `# ${section.title}\n\n${section.body}\n`, 'utf8');
}

manifest.items.push(
  { type: 'section', id: contentSections[0].id, file: `sections/${contentSections[0].id}.md` },
  { type: 'contents', id: 'contents' },
  ...contentSections.slice(1).map((section) => ({
    type: 'section',
    id: section.id,
    file: `sections/${section.id}.md`,
  })),
);

for (const department of manifest.departments) {
  manifest.items.push({
    type: 'department',
    id: department.id,
    name: department.name,
    items: department.teams.map((team) => ({
      type: 'report',
      reportId: team.id,
      name: team.name,
      reportFile: team.reportFile,
    })),
  });
  for (const insert of (manifest.inserts ?? []).filter(
    (item) => item.placement?.after?.type === 'department'
      && item.placement.after.id === department.id,
  )) {
    const assetOutputPath = join(outputDirectory, ...insert.src.split('/'));
    await mkdir(dirname(assetOutputPath), { recursive: true });
    await copyFile(join(inputDirectory, ...insert.src.split('/')), assetOutputPath);
    manifest.items.push({
      type: 'image',
      id: insert.id,
      src: insert.src,
      altText: insert.altText ?? '',
      caption: insert.caption ?? '',
    });
  }
}

const financialSection = {
  id: 'financials',
  title: manifest.financials?.title ?? 'Financials',
  body: 'Financial information will be supplied later.',
};
await writeFile(
  join(outputDirectory, 'sections', `${financialSection.id}.md`),
  `# ${financialSection.title}\n\n${financialSection.body}\n`,
  'utf8',
);
manifest.items.push({
  type: 'section',
  id: financialSection.id,
  file: `sections/${financialSection.id}.md`,
});

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
