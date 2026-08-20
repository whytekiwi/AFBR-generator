import { access, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

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

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(location, 'must be a non-empty string');
  }
  return value;
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
      const report = await readJson(reportPath);
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

  return { inputDirectory, manifest, departments, inserts };
}
