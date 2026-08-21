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
  const teamsById = new Map(
    departments.flatMap((department) => department.teams.map((team) => [team.id, team])),
  );
  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const outline = input.outline?.map((item) => {
    if (item.type === 'department') {
      return {
        type: 'department',
        department: departmentsById.get(item.department.id),
        items: item.items.map((child) => child.type === 'report'
          ? { type: 'report', team: teamsById.get(child.team.id) }
          : child),
      };
    }
    return item;
  }) ?? null;
  const tableOfContents = outline
    ? outline
        .filter((item) => item.type === 'section' || item.type === 'department')
        .map((item) => item.type === 'section'
          ? { id: item.id, name: item.title }
          : { id: item.department.id, name: item.department.name })
    : departments.map(({ id, name }) => ({ id, name }));

  return {
    document: input.manifest.document,
    departments,
    frontMatter: input.manifest.frontMatter ?? {},
    financials: input.manifest.financials ?? {},
    inserts: input.inserts,
    outline,
    tableOfContents,
    inputDirectory: input.inputDirectory,
  };
}
