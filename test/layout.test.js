import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKLET_LAYOUT, createLayoutBlocks, createSpreadPlan } from '../src/layout.js';

function department(id, name, teamId) {
  return {
    id,
    name,
    teams: [
      {
        id: teamId,
        name: `${name} Team`,
        authorName: null,
        notReceived: true,
        sections: [],
      },
    ],
  };
}

test('skips empty report sections and never headings generalOverview', () => {
  const model = {
    departments: [
      {
        id: 'admin',
        name: 'Admin',
        teams: [
          {
            id: 'admin-team',
            name: 'Admin Team',
            authorName: 'Someone',
            notReceived: false,
            empty: false,
            sections: [
              { id: 'generalOverview', title: 'General overview', markdown: 'Only this is filled in.' },
              { id: 'crewPerformance', title: 'Crew performance', markdown: '' },
              { id: 'resources', title: 'Resources and support', markdown: '' },
              { id: 'budgetAnalysis', title: 'Budget analysis', markdown: '' },
              { id: 'improvements', title: 'Recommendations and improvements', markdown: '' },
            ],
          },
        ],
      },
    ],
  };

  const { blocks } = createLayoutBlocks(model);
  const headings = Object.values(blocks).filter((block) => block.type === 'report-section-heading');
  const markdownBlocks = Object.values(blocks).filter((block) => block.type === 'report-markdown');

  assert.equal(headings.length, 0);
  assert.equal(markdownBlocks.length, 1);
  assert.equal(markdownBlocks[0].markdown, 'Only this is filled in.');
});

test('assigns physical page numbers from an explicit virtual-page plan', () => {
  const model = {
    departments: [
      department('admin', 'Admin', 'admin-team'),
      department('arts', 'Arts', 'arts-team'),
    ],
    frontMatter: {},
    financials: {},
    inserts: [],
  };
  const measurements = {
    'team:admin-team:heading': 100,
    'team:admin-team:not-received': 100,
    'team:arts-team:heading': 100,
    'team:arts-team:not-received': 100,
  };

  const plan = createSpreadPlan(model, measurements);

  assert.equal(plan.spreads.length, 6);
  assert.deepEqual(plan.pageNumbers, { admin: 5, arts: 6 });
  assert.equal(plan.spreads[3].type, 'department-start');
  assert.equal(plan.spreads[3].slots.length, 2);
  assert.equal(plan.spreads[4].type, 'department-start');
});

test('splits oversized Markdown into pageable content blocks', () => {
  const model = {
    departments: [
      {
        id: 'admin',
        name: 'Admin',
        teams: [
          {
            id: 'admin-team',
            name: 'Admin Team',
            authorName: null,
            notReceived: false,
            sections: [
              {
                id: 'overview',
                title: 'Overview',
                markdown: 'word '.repeat(300),
              },
            ],
          },
        ],
      },
    ],
  };

  const { blocks } = createLayoutBlocks(model);
  const markdownBlocks = Object.values(blocks).filter(
    (block) => block.type === 'report-markdown',
  );

  assert.ok(markdownBlocks.length > 1);
  assert.ok(markdownBlocks.every((block) => block.markdown.length <= 450));
});

test('marks mid-paragraph splits as continuations so no gap is rendered between them', () => {
  const model = {
    departments: [
      {
        id: 'admin',
        name: 'Admin',
        teams: [
          {
            id: 'admin-team',
            name: 'Admin Team',
            authorName: null,
            notReceived: false,
            sections: [
              {
                id: 'overview',
                title: 'Overview',
                markdown: `${'word '.repeat(300)}\n\nA separate paragraph.`,
              },
            ],
          },
        ],
      },
    ],
  };

  const { blocks } = createLayoutBlocks(model);
  const markdownBlocks = Object.values(blocks).filter(
    (block) => block.type === 'report-markdown',
  );

  assert.ok(markdownBlocks.length >= 3);
  assert.equal(markdownBlocks[0].continuation, false);
  assert.equal(markdownBlocks[1].continuation, true);
  assert.equal(markdownBlocks.at(-1).continuation, false);
});

test('rejoins oversized-paragraph fragments sharing a virtual page, but keeps a real page break split', () => {
  const admin = {
    id: 'admin',
    name: 'Admin',
    teams: [
      {
        id: 'admin-team',
        name: 'Admin Team',
        authorName: null,
        notReceived: false,
        sections: [
          {
            id: 'overview',
            title: 'Overview',
            markdown: 'word '.repeat(100),
          },
        ],
      },
    ],
  };
  const model = { departments: [admin], frontMatter: {}, financials: {}, inserts: [] };

  const { blocks } = createLayoutBlocks(model);
  const fragmentIds = Object.keys(blocks).filter(
    (id) => id.startsWith('team:admin-team:section:overview:content:'),
  );
  assert.equal(fragmentIds.length, 2);

  const renderedFragmentIds = (plan) => plan.spreads
    .flatMap((spread) => spread.slots ?? [])
    .flatMap((slot) => slot.units ?? [])
    .flatMap((unit) => unit.blockIds)
    .filter((id) => id.startsWith('team:admin-team:section:overview:content:'));

  const roomyMeasurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 10]));
  const roomyPlan = createSpreadPlan(model, roomyMeasurements);
  const roomyFragmentIds = renderedFragmentIds(roomyPlan);

  assert.equal(roomyFragmentIds.length, 1);
  assert.equal(
    roomyPlan.blocks[roomyFragmentIds[0]].markdown,
    `${blocks[fragmentIds[0]].markdown} ${blocks[fragmentIds[1]].markdown}`,
  );

  const tightMeasurements = {
    ...roomyMeasurements,
    [fragmentIds[0]]: BOOKLET_LAYOUT.startContentHeight - 20,
  };
  const tightPlan = createSpreadPlan(model, tightMeasurements);
  const tightFragmentIds = renderedFragmentIds(tightPlan);

  assert.equal(tightFragmentIds.length, 2);
});

test('preserves a list marker when rejoining paginated Markdown fragments', () => {
  const admin = {
    id: 'admin',
    name: 'Admin',
    teams: [
      {
        id: 'admin-team',
        name: 'Admin Team',
        authorName: null,
        notReceived: false,
        sections: [
          {
            id: 'overview',
            title: 'Overview',
            markdown: `Introduction\n${'- A list item that adds enough length to cross a block boundary.\n'.repeat(10)}`,
          },
        ],
      },
    ],
  };
  const model = { departments: [admin], frontMatter: {}, financials: {}, inserts: [] };
  const { blocks } = createLayoutBlocks(model);
  const measurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 10]));
  const plan = createSpreadPlan(model, measurements);
  const markdown = Object.values(plan.blocks)
    .filter((block) => block.type === 'report-markdown')
    .map((block) => block.markdown)
    .join('\n');

  assert.match(markdown, /\n- A list item/);
});

test('uses the normalized outline order for sections, departments, and images', () => {
  const admin = {
    id: 'admin',
    name: 'Admin',
    teams: [
      {
        id: 'one',
        name: 'One',
        authorName: null,
        notReceived: true,
        sections: [],
      },
      {
        id: 'two',
        name: 'Two',
        authorName: null,
        notReceived: true,
        sections: [],
      },
    ],
  };
  const model = {
    departments: [admin],
    outline: [
      { type: 'section', id: 'welcome', title: 'Welcome', body: 'Hello.' },
      { type: 'contents', id: 'contents' },
      {
        type: 'department',
        department: admin,
        items: [
          { type: 'report', team: admin.teams[0] },
          { type: 'image', id: 'photo', src: 'photo.jpg' },
          { type: 'report', team: admin.teams[1] },
        ],
      },
    ],
  };
  const { blocks } = createLayoutBlocks(model);
  const measurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 100]));
  const plan = createSpreadPlan(model, measurements);

  assert.deepEqual(
    plan.spreads.map(({ type }) => type),
    [
      'front-matter',
      'department-start',
      'image-insert',
      'department-continuation',
    ],
  );
  assert.equal(plan.pageNumbers.welcome, 2);
  assert.equal(plan.pageNumbers.admin, 3);
});

test('uses fullPage for top-level image spreads and fullWidth for department-image blocks', () => {
  const department = {
    id: 'admin',
    name: 'Admin',
    teams: [
      {
        id: 'admin-team',
        name: 'Admin Team',
        authorName: null,
        notReceived: true,
        sections: [],
      },
    ],
  };

  const model = {
    departments: [department],
    outline: [
      {
        type: 'image',
        id: 'hero-image',
        src: 'hero.jpg',
        altText: 'Hero',
        caption: 'Hero caption',
        fullWidth: false,
        fullPage: true,
      },
      {
        type: 'department',
        department,
        items: [
          {
            type: 'image',
            id: 'department-image',
            src: 'dept.jpg',
            altText: 'Department',
            caption: 'Department caption',
            fullWidth: true,
          },
        ],
      },
    ],
    frontMatter: {},
    financials: {},
    inserts: [],
  };

  const plan = createSpreadPlan(model, {});
  assert.equal(plan.spreads[0].insert.fullPage, true);

  const { blocks } = createLayoutBlocks(model);
  assert.equal(blocks['image:department-image'].type, 'department-image-full');
});

test('queues a non-fullPage top-level image inline as its own virtual page instead of a dedicated spread', () => {
  const model = {
    departments: [],
    outline: [
      { type: 'section', id: 'welcome', title: 'Welcome', body: 'Hello.' },
      { type: 'contents', id: 'contents' },
      {
        type: 'image',
        id: 'poster',
        src: 'poster.png',
        altText: 'Poster',
        caption: 'Poster caption',
        fullWidth: false,
        fullPage: false,
      },
      { type: 'section', id: 'chairs-report', title: 'Chairs report', body: 'Report body.' },
    ],
  };
  const { blocks } = createLayoutBlocks(model);
  const measurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 100]));
  const plan = createSpreadPlan(model, measurements);

  // No dedicated 'image-insert' spread; the image shares a virtual-page slot with sections.
  assert.deepEqual(plan.spreads.map(({ type }) => type), ['front-matter', 'front-matter']);
  const imageSlots = plan.spreads
    .flatMap((spread) => spread.slots ?? [])
    .filter((slot) => slot.type === 'image');
  assert.equal(imageSlots.length, 1);
  assert.equal(imageSlots[0].insert.id, 'poster');
});

test('takes a dedicated full-page spread for a top-level image flagged fullWidth outside a department', () => {
  const model = {
    departments: [],
    outline: [
      { type: 'section', id: 'welcome', title: 'Welcome', body: 'Hello.' },
      {
        type: 'image',
        id: 'townmap',
        src: 'townmap.jpg',
        altText: 'Town map',
        caption: 'Town map caption',
        fullWidth: true,
        fullPage: false,
      },
      { type: 'section', id: 'chairs-report', title: 'Chairs report', body: 'Report body.' },
    ],
  };
  const { blocks } = createLayoutBlocks(model);
  const measurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 100]));
  const plan = createSpreadPlan(model, measurements);

  const imageSpreads = plan.spreads.filter((spread) => spread.type === 'image-insert');
  assert.equal(imageSpreads.length, 1);
  assert.equal(imageSpreads[0].insert.id, 'townmap');
});

test('creates a department-table block and honours pageBreakAfter for a top-level department table', () => {
  const admin = {
    id: 'admin',
    name: 'Admin',
    teams: [
      { id: 'one', name: 'One', authorName: null, notReceived: true, sections: [] },
      { id: 'two', name: 'Two', authorName: null, notReceived: true, sections: [] },
    ],
  };
  const model = {
    departments: [admin],
    outline: [
      {
        type: 'department',
        department: admin,
        items: [
          { type: 'report', team: admin.teams[0] },
          { type: 'table', id: 'budget-table', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |', pageBreakAfter: true },
          { type: 'report', team: admin.teams[1] },
        ],
      },
    ],
  };
  const { blocks } = createLayoutBlocks(model);

  assert.equal(blocks['table:budget-table'].type, 'department-table');
  assert.equal(blocks['table:budget-table'].markdown, '| A | B |\n| --- | --- |\n| 1 | 2 |');

  const measurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 100]));
  const plan = createSpreadPlan(model, measurements);

  const departmentUnitIds = plan.spreads
    .flatMap((spread) => spread.slots ?? [])
    .flatMap((slot) => slot.units ?? [])
    .flatMap((unit) => unit.blockIds);

  assert.ok(departmentUnitIds.includes('table:budget-table'));
});

test('creates a heading block for a titled department table and keeps it with the table in one unit', () => {
  const admin = {
    id: 'admin',
    name: 'Admin',
    teams: [],
  };
  const model = {
    departments: [admin],
    outline: [
      {
        type: 'department',
        department: admin,
        items: [
          {
            type: 'table',
            id: 'budget-table',
            title: 'Budget breakdown',
            markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |',
            pageBreakAfter: false,
          },
        ],
      },
    ],
  };
  const { blocks } = createLayoutBlocks(model);

  assert.equal(blocks['table-heading:budget-table'].type, 'department-table-heading');
  assert.equal(blocks['table-heading:budget-table'].title, 'Budget breakdown');

  const measurements = Object.fromEntries(Object.keys(blocks).map((id) => [id, 100]));
  const plan = createSpreadPlan(model, measurements);

  const tableUnit = plan.spreads
    .flatMap((spread) => spread.slots ?? [])
    .flatMap((slot) => slot.units ?? [])
    .find((unit) => unit.blockIds.includes('table:budget-table'));

  assert.deepEqual(tableUnit.blockIds, ['table-heading:budget-table', 'table:budget-table']);
});

test('omits the heading block for a department table without a title', () => {
  const admin = { id: 'admin', name: 'Admin', teams: [] };
  const model = {
    departments: [admin],
    outline: [
      {
        type: 'department',
        department: admin,
        items: [
          { type: 'table', id: 'budget-table', markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |' },
        ],
      },
    ],
  };
  const { blocks } = createLayoutBlocks(model);

  assert.equal(blocks['table-heading:budget-table'], undefined);
});
