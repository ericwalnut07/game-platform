const {execFileSync}=require('node:child_process');const {writeFileSync}=require('node:fs');const path=require('node:path');
execFileSync(process.execPath,[path.join(path.dirname(require.resolve('typescript')),'tsc.js'),'-p','tsconfig.smoke.json'],{stdio:'inherit'});
writeFileSync('dist-smoke/package.json','{"type":"commonjs"}\n');
execFileSync(process.execPath,['tests/simulation/commercial-hub-next.cjs',...process.argv.slice(2)],{stdio:'inherit'});
