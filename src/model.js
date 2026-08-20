const REPORT_SECTIONS = [
  ['generalOverview', 'General overview'],
  ['crewPerformance', 'Crew performance'],
  ['resources', 'Resources and support'],
  ['budgetAnalysis', 'Budget analysis'],
  ['improvements', 'Recommendations and improvements'],
];

function stripRevisionStatusHeading(markdown) {
  return markdown.replace(/^#{1,6}\s+(?:draft|submitted|final)\s+overview\s*\r?\n(?:\r?\n)?/i, '');
}

export function createDocumentModel(input) {
  const departments = input.departments.map((department) => ({
    id: department.id,
    name: department.name,
    teams: department.teams.map((team) => {
      const content = team.selectedRevision.content;
      return {
        id: team.id,
        name: team.name,
        authorName: content === null ? null : content?.authorName ?? team.report.AuthorName,
        notReceived: content === null,
        sections: REPORT_SECTIONS.map(([field, title]) => ({
          id: field,
          title,
          markdown: stripRevisionStatusHeading(content?.[field] ?? ''),
        })),
      };
    }),
  }));

  return {
    document: input.manifest.document,
    departments,
    frontMatter: input.manifest.frontMatter ?? {},
    financials: input.manifest.financials ?? {},
    inserts: input.inserts,
    tableOfContents: departments.map(({ id, name }) => ({ id, name })),
    inputDirectory: input.inputDirectory,
  };
}
