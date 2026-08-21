export type ReportSummary = {
  id: string;
  authorName: string;
  team: string;
  department: string;
  lastModified: string;
  etag: string;
};

export const markdownFieldLabels = {
  generalOverview: 'General overview',
  crewPerformance: 'Crew performance',
  resources: 'Resources',
  budgetAnalysis: 'Budget analysis',
  improvements: 'Improvements',
} as const;

export type MarkdownFieldKey = keyof typeof markdownFieldLabels;

export type ReportBodyFields = Record<MarkdownFieldKey, string>;

export type Report = ReportSummary & ReportBodyFields & { empty: boolean };

export type ReportUpsert = {
  authorName: string;
  team: string;
  department: string;
  empty: boolean;
} & ReportBodyFields;

export type EditableReport = ReportUpsert &
  Partial<Pick<ReportSummary, 'id' | 'etag' | 'lastModified'>>;

export const markdownFieldKeys = Object.keys(
  markdownFieldLabels,
) as MarkdownFieldKey[];

export const createEmptyReport = (): EditableReport => ({
  authorName: '',
  team: '',
  department: '',
  empty: false,
  generalOverview: '',
  crewPerformance: '',
  resources: '',
  budgetAnalysis: '',
  improvements: '',
});

export const createEditableFromReport = (report: Report): EditableReport => ({
  id: report.id,
  authorName: report.authorName,
  team: report.team,
  department: report.department,
  empty: report.empty,
  lastModified: report.lastModified,
  etag: report.etag,
  generalOverview: report.generalOverview,
  crewPerformance: report.crewPerformance,
  resources: report.resources,
  budgetAnalysis: report.budgetAnalysis,
  improvements: report.improvements,
});

export const toUpsertPayload = (report: EditableReport): ReportUpsert => ({
  authorName: report.authorName,
  team: report.team,
  department: report.department,
  empty: report.empty,
  generalOverview: report.generalOverview,
  crewPerformance: report.crewPerformance,
  resources: report.resources,
  budgetAnalysis: report.budgetAnalysis,
  improvements: report.improvements,
});

export const editableSignature = (report: EditableReport | null): string =>
  JSON.stringify(report ? toUpsertPayload(report) : null);

export type UploadedMedia = {
  id: string;
  fileName: string;
  contentType: string;
  url: string;
};

export type SectionItem = {
  type: 'section';
  id: string;
  title: string;
  body: string;
};

export type ContentsItem = {
  type: 'contents';
  id: string;
};

export type ImageItem = {
  type: 'image';
  id: string;
  mediaId: string;
  fileName: string;
  contentType: string;
  altText: string;
  caption: string;
};

export type ReportItem = {
  type: 'report';
  reportId: string;
};

export type DepartmentChildItem = ReportItem | ImageItem;

export type DepartmentItem = {
  type: 'department';
  id: string;
  name: string;
  items: DepartmentChildItem[];
};

export type OutlineItem = SectionItem | ContentsItem | ImageItem | DepartmentItem;

export type DocumentOutline = {
  version: 1;
  items: OutlineItem[];
};

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

const outlineIdMaxLength = 100;
const outlineIdSuffixLength = 36;
const outlineIdPrefixMaxLength = outlineIdMaxLength - outlineIdSuffixLength - 1;

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

export const createOutlineNodeId = (
  label: string,
  fallback = 'item',
): string => {
  const suffix = crypto.randomUUID().toLowerCase();
  const baseSlug = slugify(label) || slugify(fallback) || 'item';
  const prefix =
    baseSlug.slice(0, outlineIdPrefixMaxLength).replace(/-+$/g, '') || 'item';

  return `${prefix}-${suffix}`;
};

export const outlineSignature = (outline: DocumentOutline | null): string =>
  JSON.stringify(outline);

export const getMediaAssetUrl = (mediaId: string): string =>
  `/api/media/${encodeURIComponent(mediaId)}`;
