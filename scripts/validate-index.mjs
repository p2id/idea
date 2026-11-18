import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_FIELDS = [
  'id', 'title', 'problem', 'user', 'idea', 'distinction', 'feasibility',
  'mvp_scope', 'anchor_relation', 'map_position', 'next_test', 'tags',
];
const OPTIONAL_FIELDS = ['out_of_scope'];
const TAGS = new Set([
  'ai-ml', 'devtools', 'automation', 'productivity', 'api', 'data', 'security',
  'privacy', 'consumer-app', 'social', 'media', 'gaming', 'education', 'health',
  'biotech', 'fintech', 'payments', 'marketplace', 'saas', 'hardware', 'robotics',
  'iot', 'energy', 'sustainability', 'mobility', 'logistics', 'communication', 'ar-vr',
]);
const ENUMS = {
  feasibility: new Set(['core-verified', 'risk-known', 'unverified']),
  anchor_relation: new Set(['improves', 'replaces', 'independent']),
  map_position: new Set(['known', 'adjacent', 'far']),
};
const TABLE_HEADER = '| id | title | map_position | anchor_relation | feasibility | tags |';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRecord(record, position, errors) {
  const label = `records[${position}]`;
  if (!isPlainObject(record)) {
    errors.push(`${label} must be an object`);
    return;
  }

  const allowed = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${label} has unsupported field "${key}"`);
  }
  for (const key of REQUIRED_FIELDS) {
    if (!(key in record)) errors.push(`${label} is missing required field "${key}"`);
  }

  if (typeof record.id !== 'string' || !/^r-[0-9a-f]{12}$/.test(record.id)) {
    errors.push(`${label}.id must match r- followed by 12 lowercase hexadecimal characters`);
  }

  for (const key of ['title', 'user', 'distinction', 'next_test']) {
    if (!nonEmptyString(record[key])) errors.push(`${label}.${key} must be a non-empty string`);
    else if (/[\r\n]/.test(record[key])) errors.push(`${label}.${key} must be a single line`);
  }
  for (const key of ['problem', 'idea']) {
    if (!nonEmptyString(record[key])) errors.push(`${label}.${key} must be a non-empty string`);
    else if (/\r?\n\s*\r?\n/.test(record[key])) errors.push(`${label}.${key} must be a single paragraph`);
  }

  for (const [key, values] of Object.entries(ENUMS)) {
    if (!values.has(record[key])) errors.push(`${label}.${key} has an unsupported value`);
  }

  for (const key of ['mvp_scope', 'out_of_scope']) {
    if (key === 'out_of_scope' && !(key in record)) continue;
    const value = record[key];
    const min = key === 'out_of_scope' ? 1 : 0;
    if (!Array.isArray(value) || value.length < min || value.length > 8) {
      errors.push(`${label}.${key} must contain ${min === 0 ? '0–8' : '1–8'} items`);
      continue;
    }
    value.forEach((item, index) => {
      if (!nonEmptyString(item) || /[\r\n]/.test(item)) {
        errors.push(`${label}.${key}[${index}] must be a non-empty single-line string`);
      }
    });
  }

  if (!Array.isArray(record.tags) || record.tags.length < 1 || record.tags.length > 3) {
    errors.push(`${label}.tags must contain 1–3 controlled tags`);
  } else {
    if (new Set(record.tags).size !== record.tags.length) errors.push(`${label}.tags must not contain duplicates`);
    record.tags.forEach((tag, index) => {
      if (!TAGS.has(tag)) errors.push(`${label}.tags[${index}] is not in the controlled vocabulary`);
    });
  }
}

export function validateIndex({ index, markdown, recordFiles = [] }) {
  const errors = [];
  if (!isPlainObject(index)) return ['index.json must contain an object'];

  if (Object.keys(index).sort().join(',') !== 'count,records') {
    errors.push('index.json must contain exactly "count" and "records"');
  }
  if (!Number.isSafeInteger(index.count) || index.count < 0) {
    errors.push('index.count must be a non-negative safe integer');
  }
  if (!Array.isArray(index.records)) {
    errors.push('index.records must be an array');
    return errors;
  }
  if (index.count !== index.records.length) errors.push('index.count must equal index.records.length');

  const ids = [];
  index.records.forEach((record, position) => {
    validateRecord(record, position, errors);
    if (isPlainObject(record) && typeof record.id === 'string') ids.push(record.id);
  });
  if (new Set(ids).size !== ids.length) errors.push('record IDs must be unique');
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  if (ids.some((id, position) => id !== sorted[position])) errors.push('records must be sorted by id');

  const expectedFiles = ids.map((id) => `${id}.yaml`).sort();
  const actualFiles = recordFiles.filter((name) => name.endsWith('.yaml')).sort();
  if (expectedFiles.length !== actualFiles.length || expectedFiles.some((name, i) => name !== actualFiles[i])) {
    errors.push('records/*.yaml filenames must match the IDs in index.json');
  }

  if (typeof markdown !== 'string') {
    errors.push('index.md must be readable text');
    return errors;
  }
  const lines = markdown.split(/\r?\n/);
  const expectedCounts = [`Count: ${index.count}`];
  for (const key of ['map_position', 'anchor_relation']) {
    for (const value of ENUMS[key]) {
      const count = index.records.filter((record) => isPlainObject(record) && record[key] === value).length;
      expectedCounts.push(`- ${value}: ${count}`);
    }
  }
  for (const expected of expectedCounts) {
    if (lines.filter((line) => line === expected).length !== 1) {
      errors.push(`index.md must contain exactly one "${expected}" line`);
    }
  }

  const headerPosition = lines.indexOf(TABLE_HEADER);
  if (headerPosition < 0 || !/^\|[-| :]+\|$/.test(lines[headerPosition + 1] ?? '')) {
    errors.push('index.md is missing the expected record table header or separator');
  } else {
    let rowCount = 0;
    for (let i = headerPosition + 2; i < lines.length && lines[i].startsWith('|'); i += 1) rowCount += 1;
    if (rowCount !== index.records.length) errors.push('index.md table row count must equal index.records.length');
  }

  return errors;
}

async function main() {
  const root = process.cwd();
  const [jsonText, markdown] = await Promise.all([
    readFile(path.join(root, 'index.json'), 'utf8'),
    readFile(path.join(root, 'index.md'), 'utf8'),
  ]);
  const index = JSON.parse(jsonText);
  let recordFiles = [];
  try {
    recordFiles = await readdir(path.join(root, 'records'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const errors = validateIndex({ index, markdown, recordFiles });
  if (errors.length) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${index.count} record(s) and both generated indexes.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
