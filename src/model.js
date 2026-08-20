const REPORT_SECTIONS = [
  ['generalOverview', 'General overview'],
  ['crewPerformance', 'Crew performance'],
  ['resources', 'Resources and support'],
  ['budgetAnalysis', 'Budget analysis'],
  ['improvements', 'Recommendations and improvements'],
];

function imageInsertsAfterDepartment(inserts, departmentId) {
  return inserts.filter(
    (insert) =>
      insert.type === 'image'
      && insert.placement?.after?.type === 'department'
      && insert.placement.after.id === departmentId,
  );
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
        authorName: content?.authorName ?? team.report.AuthorName,
        notReceived: content === null,
        sections: REPORT_SECTIONS.map(([field, title]) => ({
          id: field,
          title,
          markdown: content?.[field] ?? '',
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
