const REPORT_SECTIONS = [
  ['generalOverview', 'General overview'],
  ['crewPerformance', 'Crew performance'],
  ['resources', 'Resources and support'],
  ['budgetAnalysis', 'Budget analysis'],
  ['improvements', 'Recommendations and improvements'],
];

const PX_PER_MM = 96 / 25.4;

export const BOOKLET_LAYOUT = {
  coverPages: 1,
  continuationContentHeight: 171 * PX_PER_MM,
  startContentHeight: 152 * PX_PER_MM,
};

function splitOversizedBlock(value) {
  const maximumLength = 450;
  const chunks = [];
  let remaining = value;

  while (remaining.length > maximumLength) {
    const whitespaceIndex = remaining.lastIndexOf(' ', maximumLength);
    const boundary = whitespaceIndex > maximumLength / 2 ? whitespaceIndex : maximumLength;
    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitMarkdownBlocks(markdown) {
  const blocks = [];
  let current = [];

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push(...splitOversizedBlock(current.join('\n')));
        current = [];
      }
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) blocks.push(...splitOversizedBlock(current.join('\n')));
  return blocks;
}

function addBlock(blocks, block) {
  blocks[block.id] = block;
  return block.id;
}

function createTeamUnits(team, blocks) {
  const units = [];
  const teamHeadingId = addBlock(blocks, {
    id: `team:${team.id}:heading`,
    type: 'team-heading',
    team,
  });

  if (team.notReceived) {
    const notReceivedId = addBlock(blocks, {
      id: `team:${team.id}:not-received`,
      type: 'not-received',
    });
    return [{ id: `team:${team.id}:not-received`, blockIds: [teamHeadingId, notReceivedId] }];
  }

  let isFirstUnit = true;
  for (const section of team.sections) {
    const sectionHeadingId = addBlock(blocks, {
      id: `team:${team.id}:section:${section.id}:heading`,
      type: 'report-section-heading',
      title: section.title,
    });
    const content = section.markdown.trim()
      ? splitMarkdownBlocks(section.markdown)
      : [null];

    content.forEach((markdown, index) => {
      const contentId = addBlock(blocks, {
        id: `team:${team.id}:section:${section.id}:content:${index}`,
        type: markdown === null ? 'report-empty' : 'report-markdown',
        markdown,
      });
      const blockIds = index === 0 ? [sectionHeadingId, contentId] : [contentId];
      if (isFirstUnit) {
        blockIds.unshift(teamHeadingId);
        isFirstUnit = false;
      }
      units.push({
        id: `team:${team.id}:section:${section.id}:${index}`,
        blockIds,
      });
    });
  }
  return units;
}

function createDepartmentUnits(department, blocks) {
  return department.teams.flatMap((team) => createTeamUnits(team, blocks));
}

function createContentSectionUnits(section, blocks) {
  const headingId = addBlock(blocks, {
    id: `content:${section.id}:heading`,
    type: 'content-section-heading',
    title: section.title,
  });
  const content = section.body.trim() ? splitMarkdownBlocks(section.body) : [null];
  return content.map((markdown, index) => {
    const contentId = addBlock(blocks, {
      id: `content:${section.id}:content:${index}`,
      type: markdown === null ? 'report-empty' : 'report-markdown',
      markdown,
    });
    return {
      id: `content:${section.id}:${index}`,
      blockIds: index === 0 ? [headingId, contentId] : [contentId],
    };
  });
}

export function createLayoutBlocks(model) {
  const blocks = {};
  const departmentUnits = new Map(
    model.departments.map((department) => [
      department.id,
      createDepartmentUnits(department, blocks),
    ]),
  );
  const teamUnits = new Map(
    model.departments.flatMap((department) =>
      department.teams.map((team) => [team.id, createTeamUnits(team, blocks)])),
  );
  const contentSectionUnits = new Map(
    (model.outline ?? [])
      .filter(({ type }) => type === 'section')
      .map((section) => [section.id, createContentSectionUnits(section, blocks)]),
  );

  return { blocks, contentSectionUnits, departmentUnits, teamUnits };
}

function unitHeight(unit, measurements) {
  return unit.blockIds.reduce((height, id) => height + measurements[id], 0);
}

function fillVirtualPage(units, measurements, capacity) {
  const pageUnits = [];
  let used = 0;

  while (units.length > 0) {
    const next = units[0];
    const height = unitHeight(next, measurements);

    if (height > capacity) {
      throw new Error(`Layout block "${next.id}" exceeds the virtual-page height`);
    }
    if (used > 0 && used + height > capacity) break;

    pageUnits.push(units.shift());
    used += height;
  }

  return { units: pageUnits, used };
}

function createFrontMatterSpreads(model) {
  return [
    {
      type: 'front-matter',
      slots: [
        { type: 'placeholder', section: model.frontMatter.regionalRepresentatives },
        { type: 'contents' },
      ],
    },
    {
      type: 'front-matter',
      slots: [
        { type: 'placeholder', section: model.frontMatter.chairsReport },
        { type: 'welcome', pageIndex: 1 },
      ],
    },
    {
      type: 'front-matter',
      slots: [{ type: 'welcome', pageIndex: 2 }, { type: 'blank' }],
    },
  ];
}

export function createSpreadPlan(model, measurements) {
  const {
    blocks,
    contentSectionUnits,
    departmentUnits,
    teamUnits,
  } = createLayoutBlocks(model);
  if (model.outline) {
    const spreads = [];
    const copyUnits = (units) => units.map((unit) => ({
      ...unit,
      blockIds: [...unit.blockIds],
    }));
    const appendUnits = (units, createSpread, firstCapacity = BOOKLET_LAYOUT.continuationContentHeight) => {
      let first = true;
      while (units.length > 0) {
        const capacity = first ? firstCapacity : BOOKLET_LAYOUT.continuationContentHeight;
        const left = fillVirtualPage(units, measurements, capacity);
        const right = fillVirtualPage(units, measurements, capacity);
        spreads.push(createSpread([left, right], first));
        first = false;
      }
    };

    for (const item of model.outline) {
      if (item.type === 'contents') {
        spreads.push({
          type: 'front-matter',
          slots: [{ type: 'contents' }, { type: 'blank' }],
        });
      } else if (item.type === 'section') {
        appendUnits(
          copyUnits(contentSectionUnits.get(item.id)),
          (slots) => ({ type: 'content-section', section: item, slots }),
        );
      } else if (item.type === 'image') {
        spreads.push({ type: 'image-insert', insert: item });
      } else if (item.type === 'department') {
        let isDepartmentStart = true;
        let pending = [];
        const flush = () => {
          if (pending.length === 0) return;
          appendUnits(
            pending,
            (slots) => {
              const spread = {
                type: isDepartmentStart ? 'department-start' : 'department-continuation',
                department: item.department,
                slots,
              };
              isDepartmentStart = false;
              return spread;
            },
            isDepartmentStart
              ? BOOKLET_LAYOUT.startContentHeight
              : BOOKLET_LAYOUT.continuationContentHeight,
          );
          pending = [];
        };
        for (const child of item.items) {
          if (child.type === 'report') {
            pending.push(...copyUnits(teamUnits.get(child.team.id)));
          } else {
            flush();
            spreads.push({
              type: 'image-insert',
              insert: child,
              department: item.department,
              departmentStart: isDepartmentStart,
            });
            isDepartmentStart = false;
          }
        }
        flush();
      }
    }

    const pageNumbers = {};
    spreads.forEach((spread, index) => {
      spread.pdfPageNumber = BOOKLET_LAYOUT.coverPages + index + 1;
      if (spread.section && pageNumbers[spread.section.id] === undefined) {
        pageNumbers[spread.section.id] = spread.pdfPageNumber;
      }
      if (spread.department && pageNumbers[spread.department.id] === undefined) {
        pageNumbers[spread.department.id] = spread.pdfPageNumber;
      }
    });
    return { blocks, pageNumbers, spreads };
  }

  const spreads = createFrontMatterSpreads(model);

  for (const department of model.departments) {
    const units = departmentUnits.get(department.id).map((unit) => ({
      ...unit,
      blockIds: [...unit.blockIds],
    }));
    let isStart = true;

    do {
      const capacity = isStart
        ? BOOKLET_LAYOUT.startContentHeight
        : BOOKLET_LAYOUT.continuationContentHeight;
      const left = fillVirtualPage(units, measurements, capacity);
      const right = fillVirtualPage(units, measurements, capacity);

      spreads.push({
        type: isStart ? 'department-start' : 'department-continuation',
        department,
        slots: [left, right],
      });
      isStart = false;
    } while (units.length > 0);

    for (const insert of model.inserts.filter(
      (item) => item.placement.after.type === 'department' && item.placement.after.id === department.id,
    )) {
      spreads.push({ type: 'image-insert', insert, department });
    }
  }

  spreads.push({ type: 'financials', financials: model.financials });

  const pageNumbers = {};
  spreads.forEach((spread, index) => {
    spread.pdfPageNumber = BOOKLET_LAYOUT.coverPages + index + 1;
    if (spread.type === 'department-start') {
      pageNumbers[spread.department.id] = spread.pdfPageNumber;
    }
  });

  return { blocks, pageNumbers, spreads };
}
