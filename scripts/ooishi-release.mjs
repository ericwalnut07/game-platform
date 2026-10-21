import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function selectRelease(env, expectedScope = "ooishi-series") {
  if (!["ooishi-series", "card-workbench"].includes(expectedScope)) throw new Error("Unknown release verifier scope");
  if (env.RELEASE_REF !== "refs/heads/main") throw new Error("Deploy workflow must run from main");
  let scope = env.RELEASE_SCOPE, sha = env.RELEASE_SHA;
  if (env.RELEASE_EVENT === 'issue_comment') {
    if (!env.RELEASE_OWNER || env.RELEASE_AUTHOR !== env.RELEASE_OWNER || env.RELEASE_IS_PR !== 'true') throw new Error('Only the repository owner may request a PR deployment');
    const match = /^\/deploy ([a-z-]+) ([0-9a-f]{40})\s*$/.exec(env.RELEASE_BODY ?? '');
    if (!match) throw new Error('Expected /deploy <scope> <40-character main SHA>');
    [, scope, sha] = match;
  } else if (env.RELEASE_EVENT !== 'workflow_dispatch') throw new Error('Unsupported deployment event');
  if (scope !== expectedScope) throw new Error(`Explicit ${expectedScope} scope is required`);
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('An exact commit SHA is required');
  return sha;
}

export function validateAppliedMigrations(response, expected) {
  if (!Array.isArray(response) || response.length !== 1 || response[0]?.success !== true || !Array.isArray(response[0]?.results)) throw new Error('Invalid D1 migration query response');
  const applied = response[0].results.map(row => row.name);
  if (applied.some(name => typeof name !== 'string')) throw new Error('Invalid migration names');
  const missing = expected.filter(name => !applied.includes(name));
  const unknown = applied.filter(name => !expected.includes(name));
  if (missing.length || unknown.length) throw new Error(`D1 migration mismatch: missing=${missing.join(',')}; unknown=${unknown.join(',')}`);
  return applied.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'select') {
      appendFileSync(process.env.GITHUB_OUTPUT, `commit=${selectRelease(process.env)}\n`);
    } else if (process.argv[2] === 'migrations') {
      const expected = readdirSync('migrations').filter(name => name.endsWith('.sql')).sort();
      const count = validateAppliedMigrations(JSON.parse(readFileSync(process.argv[3], 'utf8')), expected);
      console.log(`Production D1: all ${count} migrations already applied; no migration executed.`);
    } else throw new Error('Unknown release verification command');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
