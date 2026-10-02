// npm run simulate:npc -- --games=100 --seed=7823 --reference --output=...
const fs = require('node:fs');
const { createHubState, reduceHubState } = require('../../dist-smoke/games/commercial-hub/engine.js');
const { buildHubView } = require('../../dist-smoke/games/commercial-hub/view.js');
const { companyValue } = require('../../dist-smoke/games/commercial-hub/scoring.js');
const { decideNpc, NPC_LOGIC_VERSION } = require('../../dist-smoke/games/commercial-hub/npc.js');
const { choose: reference } = require('./hub-npc-reference.cjs');
const types = ['standard', 'production', 'commerce', 'development'];
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const games = Number(args.games || 10), initialSeed = Number(args.seed || 7823);
function random(seed) { let n=seed>>>0; const next=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};return {next,integer:(a,b)=>a+Math.floor(next()*(b-a+1)),shuffle:a=>{const b=[...a];for(let i=b.length-1;i>0;i--){let j=Math.floor(next()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b}} }
const modes = [...types.map(t=>({name:t+'-4',types:[t,t,t,t],humans:0})),{name:'mixed',types,humans:0},...[1,2,3].map(h=>({name:`human-proxy-${h}`,types,humans:h}))];
function bucket() { return { participants:0,value:0,breakdown:{buildings:0,routes:0,projects:0,cash:0,inventory:0},buildings:0,composition:{industry:0,commerce:0,procurement:0},actions:{BUILD:0,UPGRADE:0,ROUTE:0,CONTRIBUTE:0,PASS_INVESTMENT:0},passReasons:{},shortages:{cash:0,materials:0,goods:0},purchases:0,advancePurchases:0,normalSales:0,disposals:0,proposals:0,accepted:0,rejected:0,expired:0,deficits:0 }; }
function run(mode, policy) {
  const tally = Object.fromEntries(types.map(t=>[t,bucket()])), report={mode:mode.name,policy,games,completed:0,failed:[],rounds:0,levels:{2:[],3:[],4:[]},earlyEnd:0,actions:0,types:tally};
  if ('audit-final-passes' in args) report.finalPassAudit={checked:0,avoidable:[]};
  for(let game=0;game<games;game++) {
    const seed=(initialSeed+game*104729)>>>0, rng=random(seed), players=['p0','p1','p2','p3'];
    const mapping=players.map((_,i)=>mode.types[(i+game)%4]);
    let state=createHubState(`npc-${seed}`,players,rng), steps=0, cursor=0;
    state.npcPlayers=Object.fromEntries(players.filter((_,i)=>i>=mode.humans).map(p=>[p,mapping[players.indexOf(p)]]));
    // Test fixture only, not a production rule/default. Human proxies answer immediately.
    state.negotiationTimeoutMs=90000;
    try {
      while(state.phase!=='FINISHED' && steps++<2200) {
        let action, decision, actor;
        if(state.phase==='TRICK_RESULT') action={type:'ADVANCE'};
        else for(let offset=0;offset<4;offset++) {
          const index=(cursor+offset)%4, id=players[index], view=buildHubView(state,id);
          decision=decideNpc(view,mapping[index]);
          if(!decision) continue;
          actor=id; cursor=(index+1)%4;
          action={...(policy==='reference' ? reference(state,id,mapping[index],rng) : decision.action),playerId:id};
          break;
        }
        if(!action) throw new Error(`Stalled ${state.phase}`);
        const b=actor?tally[mapping[players.indexOf(actor)]]:null;
        if(b) {
          if(action.type in b.actions) b.actions[action.type]++;
          const r=state.companies.find(c=>c.playerId===actor).resources;
          if(action.type==='PASS_INVESTMENT') {
            const v=buildHubView(state,actor);
            if(report.finalPassAudit && state.round===state.finalRound) {
              report.finalPassAudit.checked++;
              const worth=x=>{const own=x.companies.find(c=>c.playerId===actor),cash=own.resources.cash+buildHubView(x,actor).ownBalance.net;return {cash,value:companyValue({...own,resources:{...own.resources,cash}},x.buildings,x.routes,x.publicProjects).total}};
              const baseline=worth(state);
              for(const q of v.investments) {
                const candidate=worth(reduceHubState(state,{...q.action,playerId:actor},rng,steps*100));
                if(candidate.cash>=0 && (candidate.value>baseline.value || baseline.cash<0)) {
                  report.finalPassAudit.avoidable.push({seed,actor,action:q.action,baseline,candidate});break;
                }
              }
            }
            const why=v.investments.length ? (v.investments.some(q=>q.action.type==='BUILD')?'evaluated-with-build':'evaluated-other-investments') : r.cash<4?'insufficient-cash-or-conditions':'no-legal-investment';
            b.passReasons[why]=(b.passReasons[why]||0)+1;
            if(!v.investments.length && r.cash<4) b.shortages.cash++;
            if(!v.investments.length && r.materials===0) b.shortages.materials++;
            if(!v.investments.length && r.goods===0) b.shortages.goods++;
          }
          if(action.type==='PRODUCTION_DONE') {
            const unused=state.buildings.filter(x=>x.playerId===actor&&!state.usage[actor].buildings.includes(x.id));
            if(r.materials===0 && unused.some(x=>x.suit==='industry')) b.shortages.materials++;
            if(r.goods===0 && unused.some(x=>x.suit==='commerce')) b.shortages.goods++;
          }
          if(action.type==='MARKET') {
            if(action.action==='dispose-good') b.disposals++;
            else { b.purchases++; if(r.materials>0) b.advancePurchases++; }
          }
          if(action.type==='USE_BUILDING' && state.buildings.find(x=>x.id===action.buildingId).suit==='commerce') b.normalSales+=action.amount;
          if(action.type==='OFFER_TRADE') b.proposals++;
        }
        const before=state;
        state=reduceHubState(state,action,rng,steps*100);
        for(const n of state.negotiations) {
          const previous=before.negotiations.find(x=>x.id===n.id);
          if(n.status!=='PENDING' && previous?.status==='PENDING') tally[mapping[players.indexOf(n.proposer)]][n.status==='ACCEPTED'?'accepted':n.status==='REJECTED'?'rejected':'expired']++;
        }
        if(state.cityLevel>before.cityLevel) report.levels[state.cityLevel].push(state.round);
        report.actions++;
        // Decisions use the public trick results, not the growing audit/event history.
        // Keep a complete event history for the first game of every mode as a regression check.
        if(game>0) state.events=[];
      }
      if(state.phase!=='FINISHED') throw new Error(`Unfinished ${state.phase}`);
      report.completed++; report.rounds+=state.round;
      if(state.result.reason==='CITY_LV4_FINAL_ROUND' && state.round<10) report.earlyEnd++;
      for(let i=0;i<4;i++) {
        const b=tally[mapping[i]], own=state.buildings.filter(x=>x.playerId===players[i]);
        b.participants++; b.value+=state.companyValues[players[i]].total; b.buildings+=own.length;
        for(const key of Object.keys(b.breakdown)) b.breakdown[key]+=state.companyValues[players[i]][key];
        for(const x of own) b.composition[x.suit]++;
        if(state.companies.find(c=>c.playerId===players[i]).resources.cash<0) b.deficits++;
      }
    } catch(e) { report.failed.push({seed,seatRotation:game%4,phase:state.phase,round:state.round,error:String(e)}); }
  }
  for(const b of Object.values(tally)) if(b.participants) {
    b.averageValue=+(b.value/b.participants).toFixed(3);b.averageBuildings=+(b.buildings/b.participants).toFixed(3);b.deficitRate=b.deficits/b.participants;
    b.averageComposition=Object.fromEntries(Object.entries(b.composition).map(([k,v])=>[k,+(v/b.participants).toFixed(3)]));
    b.averageBreakdown=Object.fromEntries(Object.entries(b.breakdown).map(([k,v])=>[k,+(v/b.participants).toFixed(3)]));
  }
  report.completionRate=report.completed/games;
  return report;
}
const reports=[];
for(const mode of modes) {
  if(args.mode && args.mode!==mode.name) continue;
  for(const policy of 'reference' in args ? ['reference','npc'] : ['npc']) {
    const r=run(mode,policy);reports.push(r);
    console.log(JSON.stringify({mode:r.mode,policy,completed:r.completed,games,failed:r.failed,types:Object.fromEntries(Object.entries(r.types).filter(([,v])=>v.participants).map(([k,v])=>[k,{value:v.averageValue,buildings:v.averageBuildings,sales:v.normalSales,disposals:v.disposals,deficits:v.deficits,proposals:v.proposals}]))}));
  }
}
if(args.output) fs.writeFileSync(args.output,JSON.stringify({logicVersion:NPC_LOGIC_VERSION,initialSeed,seedStride:104729,gamesPerMode:games,seatRotation:'game % 4',humanMode:'scripted human proxy; not actual human play',reports},null,2)+'\n');
if(reports.some(r=>r.failed.length)) process.exitCode=1;
