const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');

const typescriptEntry = require.resolve('typescript');
const tscPath = path.join(path.dirname(typescriptEntry), 'tsc.js');

execFileSync(process.execPath, [tscPath, '-p', 'tsconfig.smoke.json'], { stdio: 'inherit' });
writeFileSync('dist-smoke/package.json', '{"type":"commonjs"}\n');
execFileSync(process.execPath, ['tests/simulation/full-match-smoke.cjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/simulation/commercial-hub-smoke.cjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/simulation/commercial-hub-full-game.cjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/simulation/ooishi-territory-smoke.cjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/simulation/ooishi-territory-2-smoke.cjs'], { stdio: 'inherit' });

execFileSync(process.execPath, ['tests/simulation/labyrinth-witness.cjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/simulation/labyrinth-tutorials.cjs'], { stdio: 'inherit' });

execFileSync(process.execPath, ["tests/simulation/commercial-hub-npc.cjs", "--games=3"], { stdio: "inherit" });
execFileSync(process.execPath, ["tests/simulation/commercial-hub-rules.cjs", "--games=4"], { stdio: "inherit" });
