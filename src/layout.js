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
    const lineIndex = remaining.lastIndexOf('\n', maximumLength);
    const whitespaceIndex = remaining.lastIndexOf(' ', maximumLength);
    const boundary = lineIndex > maximumLength / 2
      ? lineIndex
      : whitespaceIndex > maximumLength / 2 ? whitespaceIndex : maximumLength;
    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitMarkdownBlocks(markdown) {
  const blocks = [];
  let current = [];

  const flush = () => {
    if (current.length === 0) return;
    // fragments beyond the first are continuations of the same source paragraph, split only to fit pagination
    splitOversizedBlock(current.join('\n')).forEach((text, index) => {
      blocks.push({ text, continuation: index > 0 });
    });
    current = [];
  };

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim() === '') {
      flush();
      continue;
    }
    current.push(line);
  }

  flush();
  return blocks;
}

function addBlock(blocks, block) {
  blocks[block.id] = block;
  return block.id;
}

function addDepartmentImageBlocks(outline, blocks) {
  for (const item of outline ?? []) {
    if (item.type !== 'department') continue;
    for (const child of item.items) {
      if (child.type === 'image') {
        addBlock(blocks, {
          id: `image:${child.id}`,
          type: child.fullWidth ? 'department-image-full' : 'department-image',
          insert: child,
        });
      }
    }
  }
}

function createTeamUnits(team, blocks) {
  const units = [];
  const teamHeadingId = addBlock(blocks, {
    id: `team:${team.id}:heading`,
    type: 'team-heading',
    team,
  });

  if (team.notReceived || team.empty) {
    const statusId = addBlock(blocks, {
      id: `team:${team.id}:${team.empty ? 'empty' : 'not-received'}`,
      type: team.empty ? 'empty' : 'not-received',
    });
    return [{ id: `team:${team.id}:${team.empty ? 'empty' : 'not-received'}`, blockIds: [teamHeadingId, statusId] }];
  }

  let isFirstUnit = true;
  for (const section of team.sections) {
    if (!section.markdown.trim()) continue; // empty sections are skipped entirely, not shown

    // generalOverview usually carries its own embedded heading, so it never gets a section label
    const showHeading = section.id !== 'generalOverview';
    const sectionHeadingId = showHeading
      ? addBlock(blocks, {
        id: `team:${team.id}:section:${section.id}:heading`,
        type: 'report-section-heading',
        title: section.title,
      })
      : null;
    const content = splitMarkdownBlocks(section.markdown);

    content.forEach(({ text: markdown, continuation }, index) => {
      const contentId = addBlock(blocks, {
        id: `team:${team.id}:section:${section.id}:content:${index}`,
        type: 'report-markdown',
        markdown,
        continuation,
      });
      const blockIds = index === 0 && sectionHeadingId
        ? [sectionHeadingId, contentId]
        : [contentId];
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

  if (isFirstUnit) {
    // no populated sections at all: still show the team name/author with the "empty" toggle
    units.push({ id: `team:${team.id}:heading-only`, blockIds: [teamHeadingId] });
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
  const content = section.body.trim() ? splitMarkdownBlocks(section.body) : [{ text: null, continuation: false }];
  return content.map(({ text: markdown, continuation }, index) => {
    const contentId = addBlock(blocks, {
      id: `content:${section.id}:content:${index}`,
      type: markdown === null ? 'report-empty' : 'report-markdown',
      markdown,
      continuation,
    });
    return {
      id: `content:${section.id}:${index}`,
      blockIds: index === 0 ? [headingId, contentId] : [contentId],
    };
  });
}

function frontMatterBody(section) {
  return section?.body?.trim() ? section.body : 'Content will be supplied later.';
}

function createFrontMatterUnits(model, blocks) {
  if (model.outline || !model.frontMatter) return { regionalRepresentatives: [], chairsReport: [] };

  return {
    regionalRepresentatives: createContentSectionUnits(
      {
        id: 'front-matter:regional-representatives',
        title: model.frontMatter.regionalRepresentatives?.title
          ?? 'A word from our Regional Burning Man Representatives',
        body: frontMatterBody(model.frontMatter.regionalRepresentatives),
      },
      blocks,
    ),
    chairsReport: createContentSectionUnits(
      {
        id: 'front-matter:chairs-report',
        title: model.frontMatter.chairsReport?.title ?? "Chair's Report",
        body: frontMatterBody(model.frontMatter.chairsReport),
      },
      blocks,
    ),
  };
}

export function createLayoutBlocks(model) {
  const blocks = {};
  addDepartmentImageBlocks(model.outline, blocks);
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
  const frontMatterUnits = createFrontMatterUnits(model, blocks);

  return { blocks, contentSectionUnits, departmentUnits, frontMatterUnits, teamUnits };
}

function unitHeight(unit, measurements) {
  return unit.blockIds.reduce((height, id) => height + measurements[id], 0);
}

// Fragments of an oversized paragraph that land together on the same virtual page are
// rejoined into one block, so a mid-sentence split is only ever visible at a real page break.
function mergeContinuations(pageUnits, blocks) {
  const merged = [];
  for (const unit of pageUnits) {
    const block = unit.blockIds.length === 1 ? blocks[unit.blockIds[0]] : null;
    const previousUnit = merged.at(-1);
    const previousBlock = previousUnit ? blocks[previousUnit.blockIds.at(-1)] : null;

    if (block?.type === 'report-markdown' && block.continuation && previousBlock?.type === 'report-markdown') {
      previousBlock.markdown = `${previousBlock.markdown} ${block.markdown}`;
      continue;
    }
    merged.push(unit);
  }
  return merged;
}

function fillVirtualPage(units, measurements, capacity, blocks) {
  const pageUnits = [];
  let used = 0;

  while (units.length > 0) {
    const next = units[0];

    // solo units (full-page images) always occupy an entire virtual page on their own
    if (next.solo) {
      if (used > 0) break;
      pageUnits.push(units.shift());
      used = capacity;
      break;
    }

    const height = unitHeight(next, measurements);

    if (height > capacity) {
      throw new Error(`Layout block "${next.id}" exceeds the virtual-page height`);
    }
    if (used > 0 && used + height > capacity) break;

    pageUnits.push(units.shift());
    used += height;

    // a manual break forces whatever comes next onto a fresh virtual page
    if (next.breakAfter) break;
  }

  return { units: mergeContinuations(pageUnits, blocks), used };
}

function welcomeVirtualPages(section) {
  const pageCount = section?.pageCount ?? 2;
  return Array.from({ length: pageCount }, (_, index) => ({
    type: 'welcome',
    pageIndex: index + 1,
    pageCount,
  }));
}

function paginateFrontMatterUnits(units, measurements, blocks) {
  const remaining = units.map((unit) => ({ ...unit, blockIds: [...unit.blockIds] }));
  const pages = [];
  while (remaining.length > 0) {
    const page = fillVirtualPage(remaining, measurements, BOOKLET_LAYOUT.continuationContentHeight, blocks);
    pages.push({ type: 'content', units: page.units });
  }
  return pages;
}

// Front-matter elements only ever break on their own virtual-page boundaries;
// two consecutive virtual pages are then packed onto each physical page.
function createFrontMatterSpreads(model, frontMatterUnits, measurements, blocks) {
  const virtualPages = [
    ...paginateFrontMatterUnits(frontMatterUnits.regionalRepresentatives, measurements, blocks),
    { type: 'contents' },
    ...paginateFrontMatterUnits(frontMatterUnits.chairsReport, measurements, blocks),
    ...welcomeVirtualPages(model.frontMatter.welcomeAndLeadership),
  ];

  const spreads = [];
  for (let index = 0; index < virtualPages.length; index += 2) {
    spreads.push({
      type: 'front-matter',
      slots: [virtualPages[index], virtualPages[index + 1] ?? { type: 'blank' }],
    });
  }
  return spreads;
}

export function createSpreadPlan(model, measurements) {
  const {
    blocks,
    contentSectionUnits,
    departmentUnits,
    frontMatterUnits,
    teamUnits,
  } = createLayoutBlocks(model);
  if (model.outline) {
    const spreads = [];
    const copyUnits = (units) => units.map((unit) => ({
      ...unit,
      blockIds: [...unit.blockIds],
    }));

    // Front-matter items (contents + sections) only break on their own virtual-page
    // boundaries; two consecutive virtual pages are then packed onto each physical page.
    let frontMatterQueue = [];
    const paginateSection = (section) => {
      const units = copyUnits(contentSectionUnits.get(section.id));
      const pages = [];
      while (units.length > 0) {
        const page = fillVirtualPage(units, measurements, BOOKLET_LAYOUT.continuationContentHeight, blocks);
        pages.push({ type: 'content', section, units: page.units });
      }
      return pages;
    };
    const flushFrontMatter = () => {
      for (let index = 0; index < frontMatterQueue.length; index += 2) {
        spreads.push({
          type: 'front-matter',
          slots: [frontMatterQueue[index], frontMatterQueue[index + 1] ?? { type: 'blank' }],
        });
      }
      frontMatterQueue = [];
    };

    const appendUnits = (units, createSpread, firstCapacity = BOOKLET_LAYOUT.continuationContentHeight) => {
      let first = true;
      while (units.length > 0) {
        const capacity = first ? firstCapacity : BOOKLET_LAYOUT.continuationContentHeight;
        const left = fillVirtualPage(units, measurements, capacity, blocks);
        const right = fillVirtualPage(units, measurements, capacity, blocks);
        spreads.push(createSpread([left, right], first));
        first = false;
      }
    };

    for (const item of model.outline) {
      if (item.type === 'contents') {
        frontMatterQueue.push({ type: 'contents' });
      } else if (item.type === 'section') {
        frontMatterQueue.push(...paginateSection(item));
      } else if (item.type === 'image') {
        flushFrontMatter();
        spreads.push({ type: 'image-insert', insert: item });
      } else if (item.type === 'department') {
        flushFrontMatter();
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
        for (let childIndex = 0; childIndex < item.items.length; childIndex += 1) {
          const child = item.items[childIndex];
          if (child.type === 'report') {
            const teamPendingUnits = copyUnits(teamUnits.get(child.team.id));
            if (child.pageBreakAfter) teamPendingUnits.at(-1).breakAfter = true;
            pending.push(...teamPendingUnits);
          } else {
            pending.push({
              id: `department-image:${child.id}`,
              blockIds: [`image:${child.id}`],
              ...(child.fullWidth ? { solo: true } : {}),
            });
          }
        }
        flush();
      }
    }
    flushFrontMatter();

    const pageNumbers = {};
    spreads.forEach((spread, index) => {
      spread.pdfPageNumber = BOOKLET_LAYOUT.coverPages + index + 1;
      for (const slot of spread.slots ?? []) {
        if (slot.section && pageNumbers[slot.section.id] === undefined) {
          pageNumbers[slot.section.id] = spread.pdfPageNumber;
        }
      }
      if (spread.department && pageNumbers[spread.department.id] === undefined) {
        pageNumbers[spread.department.id] = spread.pdfPageNumber;
      }
    });
    return { blocks, pageNumbers, spreads };
  }

  const spreads = createFrontMatterSpreads(model, frontMatterUnits, measurements, blocks);

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
      const left = fillVirtualPage(units, measurements, capacity, blocks);
      const right = fillVirtualPage(units, measurements, capacity, blocks);

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
