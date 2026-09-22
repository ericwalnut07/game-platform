const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

const typescriptEntry = require.resolve('typescript');
const tscPath = path.join(path.dirname(typescriptEntry), 'tsc.js');

execFileSync(process.execPath, [tscPath, '-p', 'tsconfig.smoke.json'], { stdio: 'inherit' });
writeFileSync('dist-smoke/package.json', '{"type":"commonjs"}\n');
execFileSync(process.execPath, ['tests/simulation/full-match-smoke.cjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/simulation/commercial-hub-smoke.cjs'], { stdio: 'inherit' });
