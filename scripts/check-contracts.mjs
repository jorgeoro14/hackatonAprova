import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = new Map();
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(name);
    else if (entry.name.endsWith('.json')) documents.set(name, JSON.parse(await readFile(name, 'utf8')));
  }
}
await collect(path.join(root, 'contracts'));

function resolve(reference, source) {
  assert(!reference.includes('://'), 'Only local references are supported');
  const [filename, fragment] = reference.split('#');
  const target = filename ? path.resolve(path.dirname(source), filename) : source;
  assert(documents.has(target), 'Unresolved reference: ' + reference);
  let schema = documents.get(target);
  if (fragment) {
    assert(fragment.startsWith('/'), 'Only JSON Pointer fragments are supported');
    for (const segment of fragment.slice(1).split('/')) {
      const key = decodeURIComponent(segment).replaceAll('~1', '/').replaceAll('~0', '~');
      assert(schema && Object.hasOwn(schema, key), 'Unresolved pointer: ' + reference);
      schema = schema[key];
    }
  }
  return [schema, target];
}
function checkReferences(value, source) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) resolve(value.$ref, source);
  for (const child of Object.values(value)) checkReferences(child, source);
}
for (const [source, value] of documents) checkReferences(value, source);

// Deliberately limited to the schema constructs used in this scaffold.
// Runtime applications must use a full JSON Schema validator.
function validate(value, schema, source, location = '$') {
  const check = (condition, message) => assert(condition, location + ': ' + message);
  const matches = (candidate) => {
    try { validate(value, candidate, source, location); return true; }
    catch (error) { if (error instanceof assert.AssertionError) return false; throw error; }
  };
  if (schema.$ref) {
    const [target, targetSource] = resolve(schema.$ref, source);
    validate(value, target, targetSource, location);
  }
  if (schema.anyOf) check(schema.anyOf.some(matches), 'no anyOf alternative matched');
  if (schema.allOf) schema.allOf.forEach((item) => validate(value, item, source, location));
  if (schema.if) {
    const branch = matches(schema.if) ? schema.then : schema.else;
    if (branch) validate(value, branch, source, location);
  }
  if (schema.enum) check(schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value)), 'invalid enum');
  if ('const' in schema) check(JSON.stringify(value) === JSON.stringify(schema.const), 'invalid const');
  if (schema.type) {
    const typeMatches = schema.type === 'null' ? value === null
      : schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : schema.type === 'integer' ? Number.isInteger(value)
      : typeof value === schema.type;
    check(typeMatches, 'expected ' + schema.type);
  }
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined) check(length >= schema.minLength, 'too short');
    if (schema.maxLength !== undefined) check(length <= schema.maxLength, 'too long');
    if (schema.pattern) check(new RegExp(schema.pattern).test(value), 'pattern mismatch');
    if (schema.format === 'uuid') check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), 'invalid UUID');
    if (schema.format === 'date-time') check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value)), 'invalid UTC timestamp');
  }
  if (typeof value === 'number' && schema.minimum !== undefined) check(value >= schema.minimum, 'below minimum');
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) check(value.length >= schema.minItems, 'too few items');
    if (schema.maxItems !== undefined) check(value.length <= schema.maxItems, 'too many items');
    if (schema.uniqueItems) check(new Set(value.map((item) => JSON.stringify(item))).size === value.length, 'duplicate items');
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, source, location + '[' + index + ']'));
  } else if (value !== null && typeof value === 'object') {
    for (const key of schema.required ?? []) check(Object.hasOwn(value, key), 'missing ' + key);
    for (const [key, item] of Object.entries(value)) {
      if (schema.additionalProperties === false) check(Object.hasOwn(schema.properties ?? {}, key), 'unexpected ' + key);
      if (schema.properties?.[key]) validate(item, schema.properties[key], source, location + '.' + key);
    }
  }
}
const load = (relative) => documents.get(path.join(root, 'contracts', relative));
const mappings = {
  'create-session': 'create-session', session: 'session', 'message-request': 'message-request',
  'agent-request': 'agent-request', 'agent-result': 'agent-result', 'ready-session': 'session',
  'confirm-request': 'confirm-request', 'confirmed-session': 'session', error: 'error',
};
for (const [example, schema] of Object.entries(mappings)) {
  const source = path.join(root, 'contracts/schemas', schema + '.schema.json');
  validate(load('examples/' + example + '.json'), documents.get(source), source, example);
}
const formSchema = load('schemas/form.schema.json');
const requiredFields = formSchema['x-required-for-review'];
assert(requiredFields.every((field) => Object.hasOwn(formSchema.properties, field)));
for (const name of ['session', 'ready-session', 'confirmed-session']) {
  const session = load('examples/' + name + '.json');
  const missing = requiredFields.filter((field) => {
    const value = session.form[field];
    return value === null || (Array.isArray(value) ? value.length === 0 : !value.trim());
  }).sort();
  assert.deepEqual(session.missing_fields, missing, name + ': inconsistent completeness');
  if (session.status === 'confirmed') {
    assert.deepEqual(session.confirmed_snapshot.form, session.form);
    assert.equal(session.confirmed_snapshot.revision, session.revision);
  }
}
const ready = load('examples/ready-session.json');
assert.deepEqual(load('examples/agent-result.json').form, ready.form);
assert.equal(load('examples/agent-result.json').assistant_reply, ready.messages.at(-1).text);
assert.equal(load('examples/message-request.json').text, ready.messages.at(-2).text);
assert.equal(load('examples/confirm-request.json').expected_revision, ready.revision);
assert.equal(load('openapi.json').openapi, '3.1.0');
assert.equal(Object.keys(load('openapi.json').paths).length, 4);
console.log('Contracts passed: ' + documents.size + ' JSON documents, local references, 9 examples, and session consistency.');
