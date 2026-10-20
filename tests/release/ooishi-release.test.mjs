import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRelease, validateAppliedMigrations } from '../../scripts/ooishi-release.mjs';
const sha = 'a'.repeat(40);
const manual = { RELEASE_EVENT: 'workflow_dispatch', RELEASE_REF: 'refs/heads/main', RELEASE_SCOPE: 'ooishi-series', RELEASE_SHA: sha };
const comment = { RELEASE_EVENT: 'issue_comment', RELEASE_REF: 'refs/heads/main', RELEASE_OWNER: 'owner', RELEASE_AUTHOR: 'owner', RELEASE_IS_PR: 'true', RELEASE_BODY: `/deploy ooishi-series ${sha}` };
test('explicit manual and owner PR requests pin an exact commit', () => {
  assert.equal(selectRelease(manual), sha); assert.equal(selectRelease(comment), sha);
});
test('missing, unknown and unrelated scopes fail closed', () => {
  for (const scope of [undefined, '', 'all', 'ooishi-line', 'unknown']) assert.throws(() => selectRelease({ ...manual, RELEASE_SCOPE: scope }));
  assert.throws(() => selectRelease({ ...comment, RELEASE_BODY: `/deploy all ${sha}` }));
});
test('branch names, missing SHA and injected command suffixes are rejected', () => {
  for (const value of ['', 'main', 'a'.repeat(39), `${sha}; echo unsafe`]) assert.throws(() => selectRelease({ ...manual, RELEASE_SHA: value }));
  assert.throws(() => selectRelease({ ...comment, RELEASE_BODY: comment.RELEASE_BODY + '\nextra command' }));
});
test('non-owner, non-PR and automatic events cannot deploy', () => {
  assert.throws(() => selectRelease({ ...comment, RELEASE_AUTHOR: 'outsider' }));
  assert.throws(() => selectRelease({ ...comment, RELEASE_IS_PR: 'false' }));
  assert.throws(() => selectRelease({ ...manual, RELEASE_EVENT: 'push' }));
});
test('migration verification only accepts a complete matching applied set', () => {
  const response = [{ success: true, results: [{ name: '0001.sql' }, { name: '0002.sql' }] }];
  assert.equal(validateAppliedMigrations(response, ['0001.sql', '0002.sql']), 2);
  assert.throws(() => validateAppliedMigrations(response, ['0001.sql', '0002.sql', '0003.sql']));
  assert.throws(() => validateAppliedMigrations(response, ['0001.sql']));
  for (const invalid of [[], {}, [{ success: false, results: [] }], [{ success: true, results: [{}] }]]) assert.throws(() => validateAppliedMigrations(invalid, ['0001.sql']));
});

test('workflow runs from feature branches are rejected', () => { assert.throws(() => selectRelease({ ...manual, RELEASE_REF: 'refs/heads/feature/x' })); });
