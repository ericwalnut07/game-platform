const assert = require('node:assert/strict');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const e = require('../../dist-smoke/games/ooishi-territory-2/engine.js');
const n = require('../../dist-smoke/games/ooishi-territory-2/npc.js');
const { territory2MatchMetrics } = require('../../dist-smoke/games/ooishi-territory-2/metrics.js');
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const seeds=Number(args.seeds||12), sameSeeds=Number(args.sameSeeds||8);
const tuning={...n.TERRITORY2_NPC_TUNING,...(args.tuning?JSON.parse(fs.readFileSync(args.tuning,'utf8')):{})};
function random(seed) { let x=seed>>>0;const next=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};return {next,integer:(a,b)=>a+Math.floor(next()*(b-a+1)),shuffle:a=>a.slice().sort(()=>next()-.5)}; }
const summary={games:0,actions:0,conditions:[],difficulties:{},pairwise:{},tuning};
const samples={easy:[],medium:[],hard:[]};
function run(count,range,cap,profiles,seed,group) {
 const config=e.territory2Preset(count,cap,range),rng=random(seed);
 let state=e.createTerritory2State('npc-'+summary.games,profiles.map((p,i)=>({id:'p'+i,name:'seat'+i,controller:{kind:'NPC',profile:p}})),config,0);
 const turns=profiles.map(()=>[]),gp=profiles.map(()=>0),loss=profiles.map(()=>0);
 let maxMs=0;
 while(state.phase==='PLAYING') {
  const turn=e.currentTerritory2Turn(config,state.moves.length),profile=profiles[turn.seat],before=e.calculateTerritory2Board(config,state.moves),legal=e.legalTerritory2Placements(config,state.moves,before);
  const time=performance.now(),action=n.chooseTerritory2NpcAction(state,profile,rng,tuning),ms=performance.now()-time;
  samples[profile].push(ms);maxMs=Math.max(maxMs,ms);
  assert.equal(action.playerId,state.players[turn.seat].id);assert.equal(action.type,'PLACE');assert.ok(legal[action.kind].includes(action.index));
  if(action.kind==='big'){assert.ok(turn.turnNumber>=3&&turn.turnNumber<config.turns);turns[turn.seat].push(turn.turnNumber);}
  state=e.reduceTerritory2(state,action); summary.actions++;
  const board=e.calculateTerritory2Board(config,state.moves);
  assert.equal(board.scores.reduce((s,v)=>s+v,board.neutral),config.size**2);assert.ok(board.bigUsed.every(v=>v<=cap));
  gp[turn.seat]+=n.futureGoldenPairs(config,board,turn.seat,turn.turnNumber+1<config.turns&&board.bigUsed[turn.seat]<cap).size;
  loss[turn.seat]+=before.scores.reduce((s,v,i)=>i===turn.seat?s:s+Math.max(0,v-board.scores[i]),0)/(count-1);
  assert.ok(state.moves.length<=count*config.turns);
 }
 assert.equal(state.moves.length,count*config.turns);
 const result=e.territory2Result(state),m=territory2MatchMetrics(state);
 const row={count,range,cap,profiles,seed,group,scores:result.scores,winners:result.winners.map(id=>Number(id.slice(1))),bigUsed:result.bigUsed,bigTurns:turns,sync:m.syncActivations,gp:m.gpCreated,piercing:m.piercingCreated,opponentControlRemoved:m.opponentControlRemoved,maxMs};
 summary.games++;
 for(let i=0;i<count;i++) {
  const p=profiles[i],d=summary.difficulties[p]||={seats:0,points:0,score:0,bigUsed:0,bigTurnSum:0,bigTurns:0,unused:0,earlyExhausted:0,sync:0,gp:0,piercing:0,nextGP:0,opponentLoss:0};
  d.seats++;d.score+=result.scores[i];d.points+=row.winners.includes(i)?1/row.winners.length:0;d.bigUsed+=result.bigUsed[i];d.bigTurnSum+=turns[i].reduce((a,b)=>a+b,0);d.bigTurns+=turns[i].length;d.unused+=turns[i].length===0?1:0;
  d.earlyExhausted+=turns[i].length===cap&&turns[i].at(-1)<=4?1:0;d.sync+=m.syncActivations[i];d.gp+=m.gpCreated[i];d.piercing+=m.piercingCreated[i];d.nextGP+=gp[i]/config.turns;d.opponentLoss+=loss[i];
 }
 if(group==='mixed')for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)if(profiles[i]!==profiles[j]) {
   const [a,b]=[profiles[i],profiles[j]].sort(),key=a+' vs '+b,p=summary.pairwise[key]||={games:0,a:0,b:0,draw:0,margin:0};p.games++;
   const margin=profiles[i]===a?result.scores[i]-result.scores[j]:result.scores[j]-result.scores[i];p.margin+=margin;if(margin>0)p.a++;else if(margin<0)p.b++;else p.draw++;
 }
 if(args.output)fs.appendFileSync(args.output,JSON.stringify(row)+'\n');
}
if(args.output)fs.writeFileSync(args.output,'');
for(const count of (args.count?[Number(args.count)]:[2,3,4]))for(const range of (args.range?[args.range]:['standard','long']))for(const cap of (args.cap?[Number(args.cap)]:[1,2])) {
 const start=summary.games;
 for(const profile of ['easy','medium','hard'])for(let seed=1;seed<=sameSeeds;seed++)run(count,range,cap,Array(count).fill(profile),seed*199+count*13+cap,'same');
 const mixes=args.pair?[args.pair.split(":")]:count===2?[['easy','medium'],['easy','hard'],['medium','hard']]:count===3?[['easy','medium','hard']]:[['easy','medium','hard','hard']];
 for(const mix of mixes)for(let rotation=0;rotation<count;rotation++)for(let seed=1;seed<=seeds;seed++)run(count,range,cap,mix.map((_,i)=>mix[(i+rotation)%count]),seed*733+count*7+cap,'mixed');
 const condition={count,range,cap,games:summary.games-start};summary.conditions.push(condition);console.log(JSON.stringify({progress:condition,total:summary.games}));
}
for(const [profile,list] of Object.entries(samples)){if(!list.length)continue;list.sort((a,b)=>a-b);summary.difficulties[profile].timeMs={mean:list.reduce((a,b)=>a+b,0)/list.length,p95:list[Math.floor(list.length*.95)],max:list.at(-1)};}
if(args.summary)fs.writeFileSync(args.summary,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
