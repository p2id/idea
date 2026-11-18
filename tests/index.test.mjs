import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIndex } from '../scripts/validate-index.mjs';

const emptyMarkdown = `# Idea Record Index

Count: 0

| id | title | map_position | anchor_relation | feasibility | tags |
|---|---|---|---|---|---

## By map_position

- known: 0
- adjacent: 0
- far: 0

## By anchor_relation

- improves: 0
- replaces: 0
- independent: 0
`;

const record = {
  id: 'r-000000000001',
  title: 'Example idea',
  problem: 'A concrete problem.',
  user: 'A defined user group',
  idea: 'A focused solution.',
  distinction: 'A clear difference',
  feasibility: 'core-verified',
  mvp_scope: ['One focused capability'],
  anchor_relation: 'improves',
  map_position: 'known',
  next_test: 'Test one user workflow',
  tags: ['devtools'],
};

const oneRecordMarkdown = `# Idea Record Index

Count: 1

| id | title | map_position | anchor_relation | feasibility | tags |
|---|---|---|---|---|---
| r-000000000001 | Example idea | known | improves | core-verified | devtools |

## By map_position

- known: 1
- adjacent: 0
- far: 0

## By anchor_relation

- improves: 1
- replaces: 0
- independent: 0
`;

test('accepts the repository current empty index', () => {
  assert.deepEqual(validateIndex({
    index: { count: 0, records: [] },
    markdown: emptyMarkdown,
    recordFiles: [],
  }), []);
});

test('accepts a valid record with matching YAML filename and Markdown counts', () => {
  assert.deepEqual(validateIndex({
    index: { count: 1, records: [record] },
    markdown: oneRecordMarkdown,
    recordFiles: ['r-000000000001.yaml'],
  }), []);
});

test('rejects count and generated Markdown drift', () => {
  const errors = validateIndex({
    index: { count: 2, records: [record] },
    markdown: emptyMarkdown,
    recordFiles: ['r-000000000001.yaml'],
  });
  assert.ok(errors.includes('index.count must equal index.records.length'));
  assert.ok(errors.some((error) => error.includes('index.md must contain exactly one')));
});

test('rejects unsupported fields and tags', () => {
  const errors = validateIndex({
    index: { count: 1, records: [{ ...record, notes: 'not allowed', tags: ['made-up'] }] },
    markdown: oneRecordMarkdown,
    recordFiles: ['r-000000000001.yaml'],
  });
  assert.ok(errors.some((error) => error.includes('unsupported field')));
  assert.ok(errors.some((error) => error.includes('controlled vocabulary')));
});

test('rejects unsorted IDs and mismatched YAML files', () => {
  const second = { ...record, id: 'r-000000000000', title: 'Second record' };
  const errors = validateIndex({
    index: { count: 2, records: [record, second] },
    markdown: emptyMarkdown,
    recordFiles: ['r-000000000001.yaml'],
  });
  assert.ok(errors.includes('records must be sorted by id'));
  assert.ok(errors.includes('records/*.yaml filenames must match the IDs in index.json'));
});
