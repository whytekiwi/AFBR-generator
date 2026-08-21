import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { selectReportRevision } from './input.js';
import { validateReport } from './report-document.js';

const IMAGE_CONTENT_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function reportFromSource(source) {
  const selectedRevision = selectReportRevision(source);
  const content = selectedRevision.content ?? {};
  const revisionAuthor = typeof content.authorName === 'string' ? content.authorName.trim() : '';
  return {
    report: validateReport({
      authorName: revisionAuthor || source.AuthorName,
      team: source.Team,
      department: source.Department,
      empty: source.Empty === true,
      generalOverview: content.generalOverview ?? '',
      crewPerformance: content.crewPerformance ?? '',
      resources: content.resources ?? '',
      budgetAnalysis: content.budgetAnalysis ?? '',
      improvements: content.improvements ?? '',
    }),
    populated: Boolean(selectedRevision.content),
  };
}

function identityKey(department, team) {
  return `${department.trim()}\0${team.trim()}`;
}

function slug(value, fallback) {
  return value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || fallback;
}

function deterministicSuffix(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

function uniqueDerivedId(base, identity, usedIds) {
  const normalizedBase = base.slice(0, 100);
  if (!usedIds.has(normalizedBase)) {
    usedIds.add(normalizedBase);
    return normalizedBase;
  }
  for (let attempt = 1; ; attempt += 1) {
    const hashInput = attempt === 1 ? identity : `${identity}:${attempt}`;
    const candidate = `${normalizedBase.slice(0, 91)}-${deterministicSuffix(hashInput)}`;
    if (!usedIds.has(candidate)) {
      usedIds.add(candidate);
      return candidate;
    }
  }
}

async function findJsonFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findJsonFiles(path));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function readJson(path, label) {
  let value;
  try {
    value = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${label} "${path}" contains invalid JSON: ${error.message}`);
  }
  return value;
}

function validateRawReport(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`JSON file "${path}" is not a report object`);
  }
  for (const field of ['Team', 'Department', 'AuthorName']) {
    if (typeof value[field] !== 'string' || value[field].trim() === '') {
      throw new Error(`JSON file "${path}" is not a valid report: ${field} is required`);
    }
  }
  if (value.Empty !== undefined && typeof value.Empty !== 'boolean') {
    throw new Error(`JSON file "${path}" is not a valid report: Empty must be a Boolean`);
  }
  const revisionFields = ['ReportFinal', 'ReportSubmission', 'ReportDraft'];
  if (!revisionFields.some((field) => Object.hasOwn(value, field))) {
    throw new Error(
      `JSON file "${path}" is not a valid report: at least one report revision field is required`,
    );
  }
  const contentFields = [
    'authorName',
    'generalOverview',
    'crewPerformance',
    'resources',
    'budgetAnalysis',
    'improvements',
  ];
  for (const field of revisionFields.filter((name) => Object.hasOwn(value, name))) {
    const revision = value[field];
    if (revision === '' || revision === null || revision === undefined) continue;
    if (!revision || typeof revision !== 'object' || Array.isArray(revision)) {
      throw new Error(
        `JSON file "${path}" is not a valid report: ${field} must be an object or empty`,
      );
    }
    for (const contentField of contentFields) {
      if (
        revision[contentField] !== undefined
        && typeof revision[contentField] !== 'string'
      ) {
        throw new Error(
          `JSON file "${path}" is not a valid report: `
          + `${field}.${contentField} must be text`,
        );
      }
    }
  }
  try {
    reportFromSource(value);
  } catch (error) {
    throw new Error(`JSON file "${path}" is not a valid report: ${error.message}`);
  }
  return value;
}

async function discoverReports(inputDirectory) {
  const files = (await findJsonFiles(inputDirectory)).filter(
    (path) => resolve(path) !== resolve(inputDirectory, 'report-manifest.json'),
  );
  const reports = [];
  const identities = new Map();
  for (const path of files) {
    const source = validateRawReport(
      await readJson(path, 'Report JSON'),
      relative(inputDirectory, path),
    );
    const key = identityKey(source.Department, source.Team);
    const existing = identities.get(key);
    if (existing) {
      throw new Error(
        `Duplicate report identity "${source.Department} / ${source.Team}" in `
        + `"${existing}" and "${relative(inputDirectory, path)}"`,
      );
    }
    identities.set(key, relative(inputDirectory, path));
    reports.push({ source, ...reportFromSource(source), identity: key });
  }
  if (reports.length === 0) {
    throw new Error(`No report JSON files were found beneath "${inputDirectory}"`);
  }
  return reports;
}

function manifestIndex(manifest) {
  const departments = Array.isArray(manifest.departments) ? manifest.departments : [];
  const departmentsByName = new Map();
  const reportsByIdentity = new Map();
  departments.forEach((department, departmentIndex) => {
    if (typeof department?.name !== 'string' || typeof department?.id !== 'string') return;
    const departmentKey = department.name.trim();
    if (!departmentsByName.has(departmentKey)) {
      departmentsByName.set(departmentKey, {
        id: department.id,
        order: departmentIndex,
      });
    } else {
      departmentsByName.set(departmentKey, null);
    }
    (Array.isArray(department.teams) ? department.teams : []).forEach((team, teamIndex) => {
      if (typeof team?.name !== 'string' || typeof team?.id !== 'string') return;
      const key = identityKey(department.name, team.name);
      const entries = reportsByIdentity.get(key) ?? [];
      entries.push({ id: team.id, order: teamIndex });
      reportsByIdentity.set(key, entries);
    });
  });
  return { departmentsByName, reportsByIdentity };
}

function assignReportIds(reports, reportsByIdentity) {
  const matchedIds = reports.map((item) => {
    const matches = reportsByIdentity.get(item.identity) ?? [];
    return matches.length === 1 ? matches[0].id : null;
  }).filter(Boolean);
  if (new Set(matchedIds).size !== matchedIds.length) {
    throw new Error('Legacy manifest assigns the same report id to multiple declarative identities');
  }
  const usedIds = new Set(matchedIds);
  const ordered = [...reports].sort((left, right) => left.identity.localeCompare(right.identity));
  for (const item of ordered) {
    const matches = reportsByIdentity.get(item.identity) ?? [];
    const manifestId = matches.length === 1 ? matches[0].id : null;
    const base = `${slug(item.report.department, 'department')}-${slug(item.report.team, 'report')}`;
    item.id = manifestId ?? uniqueDerivedId(base, item.identity, usedIds);
    item.manifestOrder = matches.length === 1 ? matches[0].order : Number.MAX_SAFE_INTEGER;
  }
}

function organizeDepartments(reports, index) {
  const groups = new Map();
  for (const report of reports) {
    if (!groups.has(report.report.department)) groups.set(report.report.department, []);
    groups.get(report.report.department).push(report);
  }
  const candidates = [...groups].sort(([left], [right]) => left.localeCompare(right));
  const matchedIds = candidates.map(([name]) =>
    index.departmentsByName.get(name.trim())?.id).filter(Boolean);
  if (new Set(matchedIds).size !== matchedIds.length) {
    throw new Error('Legacy manifest assigns the same department id to multiple departments');
  }
  const usedIds = new Set(matchedIds);
  return candidates.map(([name, departmentReports]) => {
    const manifestDepartment = index.departmentsByName.get(name.trim());
    const baseId = manifestDepartment?.id ?? slug(name, 'department');
    const id = manifestDepartment
      ? baseId
      : uniqueDerivedId(baseId, name, usedIds);
    return {
      id,
      name,
      order: manifestDepartment?.order ?? Number.MAX_SAFE_INTEGER,
      reports: departmentReports.sort((left, right) =>
        left.manifestOrder - right.manifestOrder
        || left.report.team.localeCompare(right.report.team)
        || left.id.localeCompare(right.id)),
    };
  }).sort((left, right) =>
    left.order - right.order || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
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
  const manifestPath = resolve(resolvedInput, 'report-manifest.json');
  const manifest = await readJson(manifestPath, 'Manifest');
  const index = manifestIndex(manifest);
  const reports = await discoverReports(resolvedInput);
  assignReportIds(reports, index.reportsByIdentity);
  const departments = organizeDepartments(reports, index);

  await forEachConcurrent(
    reports,
    8,
    ({ id, report }) => reportStore.save(id, report),
  );

  const items = leadingSections(manifest);
  let mediaCount = 0;
  const inserts = Array.isArray(manifest.inserts) ? manifest.inserts : [];
  for (const department of departments) {
    items.push({
      type: 'department',
      id: department.id,
      name: department.name,
      items: department.reports.map((report) => ({
        type: 'report',
        reportId: report.id,
      })),
    });

    for (const insert of inserts.filter(
      (item) => item?.placement?.after?.type === 'department'
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
    title: manifest.financials?.title ?? 'Financials',
    body: 'Financial information will be supplied later.',
  });

  await documentStore.save({ version: 1, items });
  return {
    departmentCount: departments.length,
    mediaCount,
    populatedReportCount: reports.filter(({ populated }) => populated).length,
    reportCount: reports.length,
  };
}

export { imageContentType, mediaIdForInsert };
