// Static-only checks of 7 adopted/delegated mission layouts. No combat, RNG, AI or line-of-sight simulation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(here,name),"utf8"));
const layouts = read("early-seven-layouts.json");
const current = read("current-group-combat.json");
const catalog = read("missions.json").missions;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const parse = (text,board) => {
  const match = /^([A-Z])([1-9][0-9]*)$/.exec(text);
  assert.ok(match,"Malformed coordinate "+text);
  const x = alphabet.indexOf(match[1]), y = Number(match[2])-1;
  assert.ok(x>=0 && x<board.width && y>=0 && y<board.height,"Out of map "+text);
  return [x,y];
};
const adjacent = (a,b,board) => {
  const [x,y]=parse(a,board),[xx,yy]=parse(b,board);
  return Math.abs(x-xx)+Math.abs(y-yy)===1;
};
const reachable = (from,target,board,blocked) => {
  const [tx,ty]=parse(target,board);
  const checked=new Set([from]),q=[from];
  for (let i=0;i<q.length;i++){
    const [x,y]=parse(q[i],board);
    if(x===tx&&y===ty)return true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const xx=x+dx,yy=y+dy;
      if(xx<0||yy<0||xx>=board.width||yy>=board.height)continue;
      const c=alphabet[xx]+(yy+1);
      if(!blocked.has(c)&&!checked.has(c)){checked.add(c);q.push(c)}
    }
  }
  return false;
};
const expectedInitial=[6,4,7,7,4,7,7];
const expectedTotal=[9,4,10,10,7,10,10];
const expectedRounds=[5,8,7,8,8,9,10]; // M02 is 8R in all difficulties
// Easy M01-M07 is provisionally frozen, while trial-only balancing
// and all unresolved parameters remain explicitly outside that scope.
assert.equal(layouts.easyTemporaryFreeze.status,"temporarily-fixed");
assert.equal(layouts.easyTemporaryFreeze.appliesToDifficulty,"easy");
assert.deepEqual(layouts.easyTemporaryFreeze.missionNumbers,[1,2,3,4,5,6,7]);
assert.equal(current.earlyMissions.easyTemporaryFreeze.difficulty,"easy");
assert.deepEqual(current.earlyMissions.easyTemporaryFreeze.missionNumbers,[1,2,3,4,5,6,7]);
const frozenMissionIds=Array.from({length:7},(_,i)=>`easy-${String(i+1).padStart(2,"0")}`);
assert.deepEqual(read("missions.json").easyEarlyMissionFreeze.missionIds,frozenMissionIds);
for(const entry of catalog){
 const shouldBeFrozen=entry.difficulty==="easy"&&entry.number<=7;
 if(shouldBeFrozen){
  assert.equal(entry.design.temporaryFreeze.status,"temporarily-fixed");
  assert.equal(entry.design.temporaryFreeze.appliesTo,"easy-only");
  assert.equal(entry.design.temporaryFreeze.asOf,"2026-10-29");
  assert.equal(entry.design.sideObjectiveStatus,"needs-new-group-combat-specific-definition");
 }else{
  assert.equal(entry.design?.temporaryFreeze,undefined,"Only Easy M01-M07 should be frozen: "+entry.id);
 }
}
assert.equal(layouts.maps.length,7);
assert.equal(layouts.difficultyPolicy.mapsAndRosterAndRoundLimitSame,true);
assert.ok(layouts.maps.every(m=>m.roundLimitByDifficulty===undefined));
assert.equal(current.earlyMissions.layoutRef,"early-seven-layouts.json");
const roles=current.enemies.lightSquads.compositionDecision.byRole;
for(const [index,map] of layouts.maps.entries()){
  assert.equal(map.number,index+1);
  assert.equal(map.roundLimit,expectedRounds[index]);
  assert.equal(map.roundLimit,current.earlyMissions.missions[index].roundLimit);
  assert.equal(map.id,current.earlyMissions.missions[index].id);
  assert.equal(map.board.width,index<2?13:17);
  assert.equal(map.board.height,index<2?11:15);
  const occupied=new Map();
  const mark=(cell,label)=>{
    parse(cell,map.board);
    assert.ok(!occupied.has(cell),`M${map.number}: ${cell} ${label} conflicts with ${occupied.get(cell)}`);
    occupied.set(cell,label);
  };
  for(const cell of map.board.walls)mark(cell,"wall");
  const friends=Object.values(map.friendlyDeployment.directlyControlled);
  const friendlyAI=Object.values(map.friendlyDeployment.friendlyAI).map(x=>x.cell);
  assert.equal(friends.length,3);
  assert.equal(friendlyAI.length,2);
  for(const cell of friends)mark(cell,"player");
  for(const cell of friendlyAI)mark(cell,"friend");
  assert.equal(map.friendlyDeployment.respawnPriority.length,8);
  for(const cell of map.friendlyDeployment.respawnPriority){
    parse(cell,map.board);
    assert.ok(!map.board.walls.includes(cell));
  }
  let count=0;
  for(const enemy of map.initialEnemies){
    if(enemy.kind==="light-squad"){
      assert.equal(enemy.memberCount,3);
      assert.equal(enemy.memberCells.length,3);
      assert.equal(enemy.model,"A");
      assert.ok(roles[enemy.role]?.includes(enemy.chassis),enemy.id);
      const xs=enemy.memberCells.map(c=>parse(c,map.board)[0]);
      const ys=enemy.memberCells.map(c=>parse(c,map.board)[1]);
      assert.ok(Math.max(...xs)-Math.min(...xs)<=3 && Math.max(...ys)-Math.min(...ys)<=3,
        enemy.id+" breaks 4x4 cohesion");
      for(const cell of enemy.memberCells)mark(cell,enemy.id);
      count+=3;
    }else{mark(enemy.cell,enemy.id);count+=1}
  }
  assert.equal(count,expectedInitial[index]);
  let waveCount=0;
  for(const wave of map.reinforcements){
    assert.equal(wave.once,true);
    assert.ok(["start of R3","start of R4","start of R5","start of next round after threshold reached",
      "start of next round after first depot destroyed","start of next round after pickup"]
      .includes(wave.spawnTiming),wave.spawnTiming);
    assert.ok(wave.squad || wave.squadTemplate);
    const squad=wave.squad||wave.squadTemplate;
    assert.equal(squad.kind,"light-squad");
    assert.equal(squad.memberCount,3);
    assert.ok(roles[squad.role]?.includes(squad.chassis),wave.id);
    waveCount+=3;
    const variants=wave.squad?[wave.squad]:wave.spawnBranches;
    for(const variant of variants){
      assert.equal(variant.memberCells.length,3);
      const xs=variant.memberCells.map(c=>parse(c,map.board)[0]);
      const ys=variant.memberCells.map(c=>parse(c,map.board)[1]);
      assert.ok(Math.max(...xs)-Math.min(...xs)<=3&&Math.max(...ys)-Math.min(...ys)<=3,
        "wave squad cohesion "+wave.id);
      for(const cell of variant.memberCells){
        assert.ok(!occupied.has(cell),`M${map.number}: wave spawn ${cell} initially occupied`);
      }
      for(const cell of variant.fallbackCells||wave.fallbackCells||[]){
        parse(cell,map.board);
        assert.ok(!map.board.walls.includes(cell));
      }
    }
  }
  assert.equal(count+waveCount,expectedTotal[index]);
  assert.ok(map.reinforcements.length<=1);
  const objective=map.objectives,blocker=new Set(map.board.walls);
  const mustApproach=[];
  if(objective.structure){
    for(const cell of objective.structure.cells){mark(cell,"defended structure");blocker.add(cell)}
    assert.ok(objective.structure.sharedHP&&objective.structure.sharedDEF);
    assert.equal(objective.structure.maxHp,160);
    assert.equal(objective.structure.def,18);
  }
  if(objective.bossCell)assert.equal(objective.bossCell,"G2");
  if(objective.breakthroughCells){
    assert.equal(objective.uniqueRobotCount,2);
    assert.equal(objective.needSimultaneousPresence,false);
    for(const cell of objective.breakthroughCells)mustApproach.push(cell);
  }
  if(objective.depots){
    assert.equal(objective.depots.length,2);
    for(const depot of objective.depots){assert.equal(depot.cells.length,2);for(const cell of depot.cells){mark(cell,depot.id);blocker.add(cell)}}
    assert.ok(objective.shareHPWithinEachDepot&&objective.areaAttackCountsOncePerDepotPerAttack);
  }
  if(objective.transport){
    const transport=objective.transport;
    assert.equal(transport.route[0],transport.initialCell);
    assert.equal(transport.route.at(-1),transport.goalCell);
    assert.equal(transport.route.length-1,7);
    assert.equal(objective.movementSlackRounds,1);
    for(let i=1;i<transport.route.length;i++)assert.ok(adjacent(transport.route[i-1],transport.route[i],map.board));
    for(const cell of transport.route)assert.ok(!map.board.walls.includes(cell));
    mark(transport.initialCell,"transport");
    mustApproach.push(transport.goalCell);
  }
  if(objective.bases){assert.equal(objective.bases.length,3);for(const o of objective.bases){mark(o.cell,o.id);mustApproach.push(o.cell)}assert.equal(objective.requiredConsecutiveRounds,2)}
  if(objective.terminal){mark(objective.terminal.cell,"terminal");mustApproach.push(objective.terminal.cell)}
  if(objective.transmission){mark(objective.transmission.cell,"transmission");mustApproach.push(objective.transmission.cell)}
  const source=friends[0];
  for(const target of mustApproach){
    assert.ok(reachable(source,target,map.board,blocker),
      `M${map.number}: ${target} unreachable without live-unit blockers`);
  }
  for(const difficulty of ["easy","normal","hard"]){
    const catalogEntry=catalog.find(x=>x.id===`${difficulty}-${String(map.number).padStart(2,"0")}`);
    assert.ok(catalogEntry);
    assert.equal(catalogEntry.design.layoutRef,"early-seven-layouts.json");
    assert.equal(catalogEntry.design.layoutMissionNumber,map.number);
    assert.equal(catalogEntry.design.board,`${map.board.width}x${map.board.height}`);
    assert.equal(catalogEntry.design.roundLimit,map.roundLimit);
  }
  console.log(`PASS M${String(map.number).padStart(2,"0")}: ${map.board.width}x${map.board.height}, initial ${count}, wave ${waveCount}, routes/walls/objectives/roster OK`);
}
console.log("PASS: seven layouts, 21 difficulty references, all stage unit counts, player spawns, waves and static orthogonal accessibility.");
console.log("NOTE: no initiative, legal shaped MOV, LoS corner, enemy AI, objective HP/balance or actual win-rate testing.");
