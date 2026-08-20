import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCollection, handleItem } from '../api/src/report-service.js';

const report = {
  authorName: 'Alex Morgan',
  team: 'Backburners',
  department: 'Admin',
  generalOverview: 'Overview',
  crewPerformance: '',
  resources: '',
  budgetAnalysis: '',
  improvements: '',
};

function request(method, { body, id, query = '' } = {}) {
  return {
    method,
    params: { id },
    query: new URLSearchParams({ q: query }),
    async json() {
      return body;
    },
  };
}

const context = { error() {} };

test('lists report summaries using the supplied search query', async () => {
  const store = {
    async list(query) {
      assert.equal(query, 'back');
      return [{ id: 'backburners', team: 'Backburners' }];
    },
  };

  const response = await handleCollection(request('GET', { query: 'back' }), context, store);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody.items, [{ id: 'backburners', team: 'Backburners' }]);
});

test('validates reports before saving', async () => {
  const store = { async save() { throw new Error('must not save'); } };
  const response = await handleItem(
    request('PUT', { id: 'backburners', body: { ...report, team: '' } }),
    context,
    store,
  );

  assert.equal(response.status, 400);
  assert.ok(response.jsonBody.fields.some(({ field }) => field === 'team'));
});

test('saves a valid report', async () => {
  const store = {
    async save(id, value) {
      assert.equal(id, 'backburners');
      assert.deepEqual(value, report);
      return { id, ...value };
    },
  };
  const response = await handleItem(
    request('PUT', { id: 'backburners', body: report }),
    context,
    store,
  );

  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.id, 'backburners');
});
