import { access, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { parseReportMarkdown } from './report-document.js';

const REPORT_STAGES = [
  ['ReportFinal', 'final'],
  ['ReportSubmission', 'submission'],
  ['ReportDraft', 'draft'],
];

function fail(location, message) {
  throw new Error(`${location}: ${message}`);
}

async function readJson(path) {
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    fail(path, 'could not be read');
  }

  try {
    return JSON.parse(contents.replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(path, `invalid JSON (${error.message})`);
  }
}

async function readReport(path) {
  if (extname(path).toLowerCase() !== '.md') return readJson(path);

  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    fail(path, 'could not be read');
  }

  try {
    const report = parseReportMarkdown(contents.replace(/^\uFEFF/, ''));
    return {
      Team: report.team,
      Department: report.department,
      AuthorName: report.authorName,
      ReportFinal: report,
    };
  } catch (error) {
    fail(path, error instanceof Error ? error.message : 'invalid Markdown report');
  }
}

async function readContentSection(path) {
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    fail(path, 'could not be read');
  }
  const match = contents.replace(/^\uFEFF/, '').match(/^#\s+(.+?)\s*\r?\n(?:\r?\n)?([\s\S]*)$/);
  if (!match) fail(path, 'must begin with one level-one title');
  return { title: match[1].trim(), body: match[2].trim() };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(location, 'must be a non-empty string');
  }
  return value;
}

function imagePath(item, location) {
  if (typeof item.src === 'string' && item.src.trim() !== '') return item.src;
  const mediaId = requireString(item.mediaId, `${location}.mediaId`);
  if (!/^[a-zA-Z0-9._-]+$/.test(mediaId)) {
    fail(`${location}.mediaId`, 'must contain letters, numbers, dots, underscores, or hyphens only');
  }
  return `media/${mediaId}`;
}

function resolveWithin(directory, relativePath, location) {
  const resolvedPath = resolve(directory, relativePath);
  if (resolvedPath !== directory && !resolvedPath.startsWith(`${directory}${sep}`)) {
    fail(location, 'must resolve inside the input directory');
  }
  return resolvedPath;
}

function hasReportContent(revision) {
  return isObject(revision)
    && ['generalOverview', 'crewPerformance', 'resources', 'budgetAnalysis', 'improvements']
      .some((field) => typeof revision[field] === 'string' && revision[field].trim() !== '');
}

export function selectReportRevision(report) {
  for (const [field, stage] of REPORT_STAGES) {
    if (hasReportContent(report[field])) {
      return { stage, content: report[field] };
    }
  }

  return { stage: 'not-started', content: null };
}

function validateManifest(manifest, manifestPath) {
  if (!isObject(manifest)) {
    fail(manifestPath, 'must contain an object');
  }

  const document = manifest.document;
  if (!isObject(document)) {
    fail(`${manifestPath}.document`, 'must contain an object');
  }

  requireString(document.title, `${manifestPath}.document.title`);
  requireString(document.cycle, `${manifestPath}.document.cycle`);

  if (!isObject(document.draft) || typeof document.draft.enabled !== 'boolean') {
    fail(`${manifestPath}.document.draft.enabled`, 'must be a Boolean');
  }

  if (
    document.draft.watermarkText !== undefined
    && typeof document.draft.watermarkText !== 'string'
  ) {
    fail(`${manifestPath}.document.draft.watermarkText`, 'must be a string');
  }

  if (!Array.isArray(manifest.departments) || manifest.departments.length === 0) {
    fail(`${manifestPath}.departments`, 'must be a non-empty array');
  }
}

export async function loadInput(inputDirectory) {
  const manifestPath = resolve(inputDirectory, 'report-manifest.json');
  const manifest = await readJson(manifestPath);
  validateManifest(manifest, manifestPath);

  const departmentIds = new Set();
  const teamIds = new Set();
  const departments = [];

  for (const [departmentIndex, department] of manifest.departments.entries()) {
    const location = `${manifestPath}.departments[${departmentIndex}]`;
    if (!isObject(department)) fail(location, 'must contain an object');

    const id = requireString(department.id, `${location}.id`);
    const name = requireString(department.name, `${location}.name`);
    if (departmentIds.has(id)) fail(`${location}.id`, `duplicate department id "${id}"`);
    departmentIds.add(id);

    if (!Array.isArray(department.teams)) {
      fail(`${location}.teams`, 'must be an array');
    }

    const teams = [];
    for (const [teamIndex, team] of department.teams.entries()) {
      const teamLocation = `${location}.teams[${teamIndex}]`;
      if (!isObject(team)) fail(teamLocation, 'must contain an object');

      const teamId = requireString(team.id, `${teamLocation}.id`);
      const teamName = requireString(team.name, `${teamLocation}.name`);
      const reportFile = requireString(team.reportFile, `${teamLocation}.reportFile`);
      if (teamIds.has(teamId)) fail(`${teamLocation}.id`, `duplicate team id "${teamId}"`);
      teamIds.add(teamId);

      const reportPath = resolveWithin(inputDirectory, reportFile, `${teamLocation}.reportFile`);
      const report = await readReport(reportPath);
      if (!isObject(report)) fail(reportPath, 'must contain an object');
      if (report.Team !== teamName) fail(reportPath, `Team must equal "${teamName}"`);
      if (report.Department !== name) fail(reportPath, `Department must equal "${name}"`);

      teams.push({
        id: teamId,
        name: teamName,
        report,
        selectedRevision: selectReportRevision(report),
      });
    }

    departments.push({ id, name, teams });
  }

  const inserts = Array.isArray(manifest.inserts) ? manifest.inserts : [];
  for (const [index, insert] of inserts.entries()) {
    const location = `${manifestPath}.inserts[${index}]`;
    if (!isObject(insert)) fail(location, 'must contain an object');
    requireString(insert.id, `${location}.id`);
    if (insert.type !== 'image') fail(`${location}.type`, 'must equal "image"');
    requireString(insert.src, `${location}.src`);
    const assetPath = resolveWithin(inputDirectory, insert.src, `${location}.src`);
    try {
      await access(assetPath);
    } catch {
      fail(`${location}.src`, `references unreadable asset "${insert.src}"`);
    }

    if (
      !isObject(insert.placement)
      || !isObject(insert.placement.after)
      || insert.placement.after.type !== 'department'
    ) {
      fail(`${location}.placement`, 'must anchor after a department');
    }

    const departmentId = requireString(
      insert.placement.after.id,
      `${location}.placement.after.id`,
    );
    if (!departmentIds.has(departmentId)) {
      fail(`${location}.placement.after.id`, `references unknown department "${departmentId}"`);
    }
  }

  let outline = null;
  if (Array.isArray(manifest.items)) {
    const teamsById = new Map(
      departments.flatMap((department) => department.teams.map((team) => [team.id, team])),
    );
    outline = [];
    for (const [index, item] of manifest.items.entries()) {
      const location = `${manifestPath}.items[${index}]`;
      if (!isObject(item)) fail(location, 'must contain an object');
      if (item.type === 'contents') {
        outline.push({ type: 'contents', id: requireString(item.id, `${location}.id`) });
        continue;
      }
      if (item.type === 'section') {
        const id = requireString(item.id, `${location}.id`);
        const file = requireString(item.file, `${location}.file`);
        const section = await readContentSection(
          resolveWithin(inputDirectory, file, `${location}.file`),
        );
        outline.push({ type: 'section', id, ...section });
        continue;
      }
      if (item.type === 'image') {
        const src = imagePath(item, location);
        await access(resolveWithin(inputDirectory, src, `${location}.src`));
        outline.push({ ...item, src });
        continue;
      }
      if (item.type === 'department') {
        const departmentId = requireString(item.id, `${location}.id`);
        const department = departments.find(({ id }) => id === departmentId);
        if (!department) fail(`${location}.id`, `references unknown department "${departmentId}"`);
        const children = [];
        for (const [childIndex, child] of (item.items ?? []).entries()) {
          const childLocation = `${location}.items[${childIndex}]`;
          if (child.type === 'report') {
            const reportId = requireString(child.reportId, `${childLocation}.reportId`);
            const team = teamsById.get(reportId);
            if (!team || !department.teams.some(({ id }) => id === reportId)) {
              fail(`${childLocation}.reportId`, `references unknown report "${reportId}"`);
            }
            children.push({ type: 'report', team });
          } else if (child.type === 'image') {
            const src = imagePath(child, childLocation);
            await access(resolveWithin(inputDirectory, src, `${childLocation}.src`));
            children.push({ ...child, src });
          } else {
            fail(`${childLocation}.type`, 'must equal "report" or "image"');
          }
        }
        outline.push({ type: 'department', department, items: children });
        continue;
      }
      fail(`${location}.type`, 'must equal "section", "contents", "image", or "department"');
    }
  }

  return { inputDirectory, manifest, departments, inserts, outline };
}
