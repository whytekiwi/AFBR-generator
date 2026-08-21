import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { loadInput } from './input.js';

const IMAGE_CONTENT_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function reportFromTeam(team, department) {
  const content = team.selectedRevision.content ?? {};
  return {
    authorName: content.authorName ?? team.report.AuthorName,
    team: team.name,
    department: department.name,
    generalOverview: content.generalOverview ?? '',
    crewPerformance: content.crewPerformance ?? '',
    resources: content.resources ?? '',
    budgetAnalysis: content.budgetAnalysis ?? '',
    improvements: content.improvements ?? '',
  };
}

function leadingSections(manifest) {
  return [
    {
      type: 'section',
      id: 'regional-representatives',
      title: manifest.frontMatter?.regionalRepresentatives?.title
        ?? 'A word from our Regional Burning Man Representatives',
      body: 'Content will be supplied later.',
    },
    { type: 'contents', id: 'contents' },
    {
      type: 'section',
      id: 'chairs-report',
      title: manifest.frontMatter?.chairsReport?.title ?? "Chair's Report",
      body: 'Content will be supplied later.',
    },
    {
      type: 'section',
      id: 'welcome-and-leadership',
      title: 'Welcome and leadership structure',
      body: 'Content will be supplied later.',
    },
  ];
}

function imageContentType(path) {
  const contentType = IMAGE_CONTENT_TYPES.get(extname(path).toLowerCase());
  if (!contentType) {
    throw new Error(`Unsupported image type for "${path}"`);
  }
  return contentType;
}

function mediaIdForInsert(insertId) {
  const hex = createHash('sha256').update(`afterburn-legacy-media:${insertId}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

async function forEachConcurrent(items, concurrency, operation) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await operation(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

export async function migrateLegacyReportsToBlob({
  documentStore,
  inputDirectory,
  reportStore,
}) {
  const resolvedInput = resolve(inputDirectory);
  const input = await loadInput(resolvedInput);
  const reports = input.departments.flatMap((department) =>
    department.teams.map((team) => ({
      id: team.id,
      report: reportFromTeam(team, department),
      populated: Boolean(team.selectedRevision.content),
    })));

  await forEachConcurrent(
    reports,
    8,
    ({ id, report }) => reportStore.save(id, report),
  );

  const items = leadingSections(input.manifest);
  let mediaCount = 0;
  for (const department of input.departments) {
    items.push({
      type: 'department',
      id: department.id,
      name: department.name,
      items: department.teams.map((team) => ({
        type: 'report',
        reportId: team.id,
      })),
    });

    for (const insert of input.inserts.filter(
      (item) => item.placement.after.type === 'department'
        && item.placement.after.id === department.id,
    )) {
      const bytes = await readFile(resolve(resolvedInput, insert.src));
      const media = await documentStore.uploadMedia({
        bytes,
        contentType: imageContentType(insert.src),
        fileName: basename(insert.src),
        id: mediaIdForInsert(insert.id),
      });
      mediaCount += 1;
      items.push({
        type: 'image',
        id: insert.id,
        mediaId: media.id,
        fileName: media.fileName,
        contentType: media.contentType,
        altText: insert.altText ?? '',
        caption: insert.caption ?? '',
      });
    }
  }

  items.push({
    type: 'section',
    id: 'financials',
    title: input.manifest.financials?.title ?? 'Financials',
    body: 'Financial information will be supplied later.',
  });

  await documentStore.save({ version: 1, items });
  return {
    departmentCount: input.departments.length,
    mediaCount,
    populatedReportCount: reports.filter(({ populated }) => populated).length,
    reportCount: reports.length,
  };
}

export { imageContentType, mediaIdForInsert };
