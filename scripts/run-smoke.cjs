const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '-p', 'tsconfig.smoke.json'], { stdio: 'inherit' });
writeFileSync('dist-smoke/package.json', '{"type":"commonjs"}\n');
execFileSync(process.execPath, ['tests/simulation/full-match-smoke.cjs'], { stdio: 'inherit' });
