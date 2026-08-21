import matter from 'gray-matter';

export const REPORT_SECTION_FIELDS = [
  ['generalOverview', 'General overview'],
  ['crewPerformance', 'Crew performance'],
  ['resources', 'Resources'],
  ['budgetAnalysis', 'Budget analysis'],
  ['improvements', 'Improvements'],
];

const SECTION_BY_HEADING = new Map(
  REPORT_SECTION_FIELDS.map(([field, heading]) => [heading.toLowerCase(), field]),
);

export class ReportValidationError extends Error {
  constructor(errors) {
    super('Report validation failed');
    this.name = 'ReportValidationError';
    this.errors = errors;
  }
}

function requireText(report, field, label, errors) {
  if (typeof report[field] !== 'string' || report[field].trim() === '') {
    errors.push({ field, message: `${label} is required` });
  }
}

export function validateReport(report) {
  const errors = [];
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new ReportValidationError([{ field: 'report', message: 'Report must be an object' }]);
  }

  requireText(report, 'authorName', 'Author name', errors);
  requireText(report, 'team', 'Team', errors);
  requireText(report, 'department', 'Department', errors);

  if (report.empty !== undefined && typeof report.empty !== 'boolean') {
    errors.push({ field: 'empty', message: 'Must be a Boolean' });
  }

  for (const [field] of REPORT_SECTION_FIELDS) {
    if (report[field] !== undefined && typeof report[field] !== 'string') {
      errors.push({ field, message: 'Must be text' });
    }
  }

  if (errors.length > 0) throw new ReportValidationError(errors);
  return {
    authorName: report.authorName.trim(),
    team: report.team.trim(),
    department: report.department.trim(),
    empty: report.empty ?? false,
    ...Object.fromEntries(
      REPORT_SECTION_FIELDS.map(([field]) => [field, report[field]?.trim() ?? '']),
    ),
  };
}

export function serializeReportMarkdown(report) {
  const normalized = validateReport(report);
  const body = REPORT_SECTION_FIELDS.map(
    ([field, heading]) =>
      `<!-- afterburn:${field} -->\n## ${heading}\n\n${normalized[field]}`,
  ).join('\n\n');

  return matter.stringify(`${body}\n`, {
    schemaVersion: 1,
    authorName: normalized.authorName,
    team: normalized.team,
    department: normalized.department,
    empty: normalized.empty,
  });
}

export function parseReportMarkdown(markdown) {
  const parsed = matter(markdown);
  const sections = Object.fromEntries(REPORT_SECTION_FIELDS.map(([field]) => [field, '']));
  const markerPattern = /^<!--\s*afterburn:([a-zA-Z]+)\s*-->\s*\r?\n##\s+.+?\s*$/gm;
  let matches = [...parsed.content.matchAll(markerPattern)]
    .map((match) => ({
      field: REPORT_SECTION_FIELDS.some(([field]) => field === match[1]) ? match[1] : undefined,
      index: match.index,
      length: match[0].length,
    }))
    .filter(({ field }) => field);

  if (matches.length === 0) {
    const headingPattern = /^##\s+(.+?)\s*$/gm;
    matches = [...parsed.content.matchAll(headingPattern)]
      .map((match) => ({
        field: SECTION_BY_HEADING.get(match[1].trim().toLowerCase()),
        index: match.index,
        length: match[0].length,
      }))
      .filter(({ field }) => field);
  }

  for (let index = 0; index < matches.length; index += 1) {
    const { field } = matches[index];
    const start = matches[index].index + matches[index].length;
    const end = matches[index + 1]?.index ?? parsed.content.length;
    sections[field] = parsed.content.slice(start, end).trim();
  }

  return validateReport({
    authorName: parsed.data.authorName,
    team: parsed.data.team,
    department: parsed.data.department,
    empty: parsed.data.empty ?? false,
    ...sections,
  });
}

function encodeMetadata(value) {
  return encodeURIComponent(value);
}

function decodeMetadata(value = '') {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function createReportMetadata(report) {
  const normalized = validateReport(report);
  return {
    schemaversion: '1',
    authorname: encodeMetadata(normalized.authorName),
    team: encodeMetadata(normalized.team),
    department: encodeMetadata(normalized.department),
    empty: String(normalized.empty),
    searchtext: encodeMetadata(
      `${normalized.authorName} ${normalized.team} ${normalized.department}`.toLowerCase(),
    ),
  };
}

export function reportSummaryFromMetadata({ id, metadata = {}, lastModified, etag }) {
  return {
    id,
    authorName: decodeMetadata(metadata.authorname),
    team: decodeMetadata(metadata.team),
    department: decodeMetadata(metadata.department),
    lastModified: lastModified instanceof Date ? lastModified.toISOString() : lastModified ?? null,
    etag: etag ?? null,
  };
}
