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
  const sections = [
    { type: 'cover' },
    { type: 'placeholder', id: 'regional-representatives', ...input.manifest.frontMatter?.regionalRepresentatives },
    { type: 'contents' },
    { type: 'placeholder', id: 'chairs-report', ...input.manifest.frontMatter?.chairsReport },
    { type: 'welcome', ...input.manifest.frontMatter?.welcomeAndLeadership },
  ];

  for (const department of input.departments) {
    sections.push({
      type: 'department',
      id: department.id,
      name: department.name,
      tocTitle: department.name,
    });

    for (const team of department.teams) {
      const content = team.selectedRevision.content;
      sections.push({
        type: 'team-report',
        id: team.id,
        teamName: team.name,
        departmentName: department.name,
        reportStage: team.selectedRevision.stage,
        authorName: content?.authorName ?? team.report.AuthorName,
        sections: REPORT_SECTIONS.map(([field, title]) => ({
          id: field,
          title,
          markdown: content?.[field] ?? '',
        })),
      });
    }

    for (const insert of imageInsertsAfterDepartment(input.inserts, department.id)) {
      sections.push({ type: 'image-insert', ...insert });
    }
  }

  sections.push({ type: 'financials', ...input.manifest.financials });

  return {
    document: input.manifest.document,
    sections,
    tableOfContents: input.departments.map(({ id, name }) => ({ id, name })),
    inputDirectory: input.inputDirectory,
  };
}
