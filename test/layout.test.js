import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutBlocks, createSpreadPlan } from '../src/layout.js';

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
      'content-section',
      'front-matter',
      'department-start',
      'image-insert',
      'department-continuation',
    ],
  );
  assert.equal(plan.pageNumbers.welcome, 2);
  assert.equal(plan.pageNumbers.admin, 4);
});
