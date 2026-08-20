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

export type Report = ReportSummary & ReportBodyFields;

export type ReportUpsert = {
  authorName: string;
  team: string;
  department: string;
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
  generalOverview: report.generalOverview,
  crewPerformance: report.crewPerformance,
  resources: report.resources,
  budgetAnalysis: report.budgetAnalysis,
  improvements: report.improvements,
});

export const editableSignature = (report: EditableReport | null): string =>
  JSON.stringify(report ? toUpsertPayload(report) : null);
