'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const core=require(process.env.STAGE_CORE_V10_JS||'../../dist-smoke/games/two-sided-labyrinth/core/prototype-stage-core-v1.0.js');
const {buildFaceView}=require('../../dist-smoke/games/two-sided-labyrinth/view.js');
const ref=path.join(__dirname,'../fixtures/two-sided-labyrinth/reference-witness');
const cat={stages:JSON.parse(fs.readFileSync(path.join(__dirname,'../../src/games/two-sided-labyrinth/stages.json'),'utf8'))};
const st=n=>cat.stages.find(s=>s.stageId===`challenge-${String(n).padStart(2,'0')}`);
const ctx=f=>({playMode:'SOLO_PRACTICE',selectedFace:f});
const webctx=f=>({playMode:'ONLINE_DUO',authenticatedPlayerId:f==='front'?'A':'B',serverSeatAssignment:{front:'A',back:'B'}});
const f=a=>a==='A'?'front':'back';
const parseTsv=p=>{const [headers,...rows]=fs.readFileSync(p,'utf8').trim().split(/\r?\n/).map(s=>s.split('\t'));return rows.map(cols=>Object.fromEntries(headers.map((h,i)=>[h,cols[i]||''])))};
function direction(prev,target){const dx=target.x-prev.x,dy=target.y-prev.y;return ({'0,-1':'north','0,1':'south','-1,0':'west','1,0':'east'})[`${dx},${dy}`];}
function step(s,stage,face,action,index,expected){try{if(action.type!=='MOVE')assert(buildFaceView(stage.stageId,s,face).actions.some(a=>a.enabled&&JSON.stringify(a.command)===JSON.stringify(action)),'legal witness action missing from UI');const next=core.applyStageAction(stage,s,ctx(face),action);const online=core.applyStageAction(stage,s,webctx(face),action);assert.deepEqual(next,online,'solo/online diverged');if(expected)assert.deepEqual(next.position,expected,'witness position mismatch');return next;}catch(e){throw new Error(`${stage.stageId} step ${index} ${face} ${JSON.stringify(action)}: ${e.code||e.name} ${e.message}`)}}
function example2(){const stage=st(2),rows=parseTsv(`${ref}/c02/challenge2_shortest_route.tsv`);let s=core.createStageState(stage);for(const row of rows.slice(1)){const a=row.action;let side=f(a[0]);let action;if(a.includes('mirror')){const d=stage.devices.find(d=>d.id===`mirror-0${a[1]}`),p=d.config.physicalFrontCell;side=['front','back'].find(face=>{const mirror=face==='front'?{x:p[0],y:p[1]}:{x:stage.width+1-p[0],y:p[1]};return Math.abs(s.position[face].x-mirror.x)+Math.abs(s.position[face].y-mirror.y)===1});assert(side);action={type:'MIRROR',mirrorId:d.id};}else action={type:'MOVE',direction:({N:'north',E:'east',S:'south',W:'west'})[a.match(/_move_([NESW])/)[1]]};s=step(s,stage,side,action,row.step,{front:{x:+row.A_x,y:+row.A_y},back:{x:+row.B_x,y:+row.B_y}});}assert(s.complete);console.log(`CHALLENGE_02_WITNESS=PASS steps=${rows.length-1}`)}
function example8(){const stage=st(8),rows=parseTsv(`${ref}/c08/challenge8_legal_route.tsv`);let s=core.createStageState(stage);for(const row of rows){const side=f(row.actor);const action=row.operation==='move'?{type:'MOVE',direction:direction(s.position[side],{x:+row.x,y:+row.y})}:{type:'MIRROR',mirrorId:`mirror-0${row.operation.slice(-1)}`};assert(action.type!=='MOVE'||action.direction);s=step(s,stage,side,action,row.step,row.operation==='move'?{...s.position,[side]:{x:+row.x,y:+row.y}}:s.position);}assert(s.complete);console.log(`CHALLENGE_08_WITNESS=PASS steps=${rows.length}`)}
function example7(){const stage=st(7),rows=parseTsv(`${ref}/c07/challenge7_v05/challenge7_cut_proof_bundle/challenge7_candidate_221_witness.tsv`);let s=core.createStageState(stage);for(const row of rows){const side=f(row.side),info=row.info,k=row.action;let a;switch(k){case 'move':{const [x,y]=info.split(',').map(Number);a={type:'MOVE',direction:direction(s.position[side],{x,y})};break;}case 'lamp_pickup':a={type:'REMOVE',objectId:'pedestal-front',itemId:'light-01'};break;case 'lamp_install':a={type:'INSTALL',objectId:'pedestal-back',itemId:'light-01'};break;case 'send':case 'receive':{const [port,item]=info.split(':');a={type:k.toUpperCase(),transferId:port==='T'?'transfer-lower':'transfer-upper',itemId:{key:'key-01',lamp:'light-01',cell:'cell-01'}[item]};break;}case 'unlock':a={type:'UNLOCK',doorId:side==='front'?'key-front':'key-back',itemId:'key-01'};break;case 'mirror':a={type:'MIRROR',mirrorId:'mirror-01'};break;case 'high':a={type:'POWER',circuitId:'high-switch-01'};break;case 'power':a={type:'POWER',circuitId:side==='front'?'circuit-front':'circuit-back'};break;case 'cell_pickup':a={type:'CACHE_TAKE',cacheId:'cache-01',itemId:'cell-01'};break;case 'cell_install':a={type:'INSTALL',objectId:'socket-01',itemId:'cell-01'};break;default:throw Error('Unknown witness '+k);}assert(a.type!=='MOVE'||a.direction);const tuple=t=>{const [x,y]=t.slice(1,-1).split(',').map(Number);return{x,y}};s=step(s,stage,side,a,row.step,{front:tuple(row.A_pos),back:tuple(row.B_pos)});
  const item=(id)=>{const x=s.items[id];if(x.kind==='inventory')return x.side==='front'?'A':'B';if(x.kind==='installed')return ({'pedestal-front':'sourceA','pedestal-back':'sourceB','socket-01':'chargerB'})[x.objectId];if(x.kind==='contained')return 'cabinetA';return ({'transfer-lower':'pendingT','transfer-upper':'pendingU'})[x.transferId]+(x.receiver==='front'?'A':'B')};
  for(const [key,val] of Object.entries({key:item('key-01'),lamp:item('light-01'),cell:item('cell-01'),high:+!!s.powered['pedestal-back'],mirror:s.mirrorFrontDiagonal['mirror-01']==='/'?0:1,powerA:+!!s.powered['circuit-front'],powerB:+!!s.powered['circuit-back'],latch:+!!s.latchOpen['latch-01'],goals:(s.goalVisited.front?'A':'')+(s.goalVisited.back?'B':'')}))assert.equal(String(val),String(row[key]),`c07 state field ${key} step ${row.step}`);
 }assert(s.complete);console.log(`CHALLENGE_07_WITNESS=PASS steps=${rows.length}`)}
function example10(){const stage=st(10),rows=parseTsv(`${ref}/c10/challenge10_candidate_339_witness.tsv`);let s=core.createStageState(stage);for(const row of rows){const side=f(row.actor);let a;switch(row.action){case 'move':{const target=side==='front'?{x:+row.ax,y:+row.ay}:{x:+row.bx,y:+row.by};a={type:'MOVE',direction:direction(s.position[side],target)};break;}case 'pickup_intro_source':a={type:'REMOVE',objectId:'pedestal-front-lower',itemId:'light-01'};break;case 'pickup_north_source':a={type:'REMOVE',objectId:'pedestal-back-lower',itemId:'light-01'};break;case 'install_north_source':a={type:'INSTALL',objectId:'pedestal-back-lower',itemId:'light-01'};break;case 'install_cap_light':a={type:'INSTALL',objectId:'pedestal-back-upper',itemId:'light-01'};break;case 'send_T1_key':a={type:'SEND',transferId:'transfer-lower',itemId:'key-01'};break;case 'send_T1_light':a={type:'SEND',transferId:'transfer-lower',itemId:'light-01'};break;case 'receive_T1':a={type:'RECEIVE',transferId:'transfer-lower',itemId:Object.entries(s.items).find(([k,v])=>v.kind==='pending'&&v.transferId==='transfer-lower'&&v.receiver===side)?.[0]};break;case 'send_T2_cell':a={type:'SEND',transferId:'transfer-upper',itemId:'cell-01'};break;case 'send_T2_key':a={type:'SEND',transferId:'transfer-upper',itemId:'key-01'};break;case 'receive_T2':a={type:'RECEIVE',transferId:'transfer-upper',itemId:Object.entries(s.items).find(([k,v])=>v.kind==='pending'&&v.transferId==='transfer-upper'&&v.receiver===side)?.[0]};break;case 'unlock':a={type:'UNLOCK',doorId:side==='front'?'key-front-upper':'key-back',itemId:'key-01'};break;case 'lift':a={type:'LIFT',liftId:'lift-01'};break;case 'low-wall':a={type:'PUSH',wallId:'wall-lower'};break;case 'high-wall':a={type:'PUSH',wallId:'wall-upper'};break;case 'floor':a={type:'FLIP',floorId:'floor-01'};break;case 'rotate':a={type:'ROTATE',roomId:'room-01'};break;case 'collect_cell':a={type:'CACHE_TAKE',cacheId:'cache-01',itemId:'cell-01'};break;case 'rotate_mirror':a={type:'MIRROR',mirrorId:'mirror-01'};break;case 'toggle_high':a={type:'POWER',circuitId:'high-switch-01'};break;case 'toggle_circuit':a={type:'POWER',circuitId:side==='front'?'circuit-front':'circuit-back'};break;case 'plug_cell':a={type:'INSTALL',objectId:'socket-01',itemId:'cell-01'};break;default:throw Error('Unknown witness '+row.action);}assert(a.type!=='MOVE'||a.direction);s=step(s,stage,side,a,row.step,{front:{x:+row.ax,y:+row.ay},back:{x:+row.bx,y:+row.by}});
  // Regression: only a powered-OFF unit can be removed; shadow bridges may
  // never disappear under a standing player. Both checks use a cloned state
  // reached by legal witness operations and leave the witness unchanged.
  if (+row.step===297) {
    const beside=core.applyStageAction(stage,s,ctx('back'),{type:'MOVE',direction:'west'});
    assert.deepEqual(beside.position.back,{x:3,y:6});
    assert.throws(()=>core.applyStageAction(stage,beside,ctx('back'),{type:'REMOVE',objectId:'pedestal-back-upper',itemId:'light-01'}),e=>e.code==='INVALID_ACTION');
    console.log('CHALLENGE_10_POWERED_LIGHT_REMOVAL_REJECTED=PASS');
  }
  if (+row.step===299) {
    assert.deepEqual(s.position.front,{x:22,y:4});
    assert.throws(()=>core.applyStageAction(stage,s,ctx('back'),{type:'POWER',circuitId:'high-switch-01'}),e=>e.code==='OCCUPIED');
    console.log('CHALLENGE_10_SHADOW_BRIDGE_SAFETY=PASS');
  }
  const location=(id)=>{const l=s.items[id];if(l.kind==='inventory')return l.side==='front'?'A':'B';if(l.kind==='installed')return ({'pedestal-front-lower':'A_INTRO_PAD','pedestal-back-lower':'B_INTRO_PAD','pedestal-back-upper':'B_CAP_PAD','socket-01':'B_SOCKET'})[l.objectId];if(l.kind==='contained')return 'A_BOX';return (l.transferId==='transfer-lower'?'T1:':'T2:')+(l.receiver==='front'?'A':'B')};
  const expected={lift_A_up:+(s.liftFrontStop['lift-01']==='upper'),linked_floor:s.floorParity['floor-01'],room_rotation:s.rotationQuarterTurnsFront['room-01'],wall_lower:+(s.wallSide['wall-lower']==='back'),wall_upper:+(s.wallSide['wall-upper']==='front'),key_loc:location('key-01'),light_loc:location('light-01'),cell_loc:location('cell-01'),key_door_intro:+!!s.unlocked['key-back'],key_door_cap:+!!s.unlocked['key-front-upper'],mirror_B:s.mirrorFrontDiagonal['mirror-01']==='/'?'\\':'/',high_power:+!!s.powered['pedestal-back-upper'],circuit_A:+!!s.powered['circuit-front'],circuit_B:+!!s.powered['circuit-back'],final_latch:+!!s.latchOpen['latch-01'],goals:(s.goalVisited.front?'A':'')+(s.goalVisited.back?'B':'')};
  for(const [key,val] of Object.entries(expected))assert.equal(String(val),String(row[key]),`c10 state field ${key} step ${row.step}`);
 }assert(s.complete);console.log(`CHALLENGE_10_WITNESS=PASS steps=${rows.length}`)}
function replayTrace(number,file,expectedSteps){const stage=st(number);let s=core.createStageState(stage);const lines=fs.readFileSync(`${ref}/${file}`,'utf8').trim().split(/\r?\n/).filter(x=>x.startsWith('TRACE|'));
 for(const line of lines){const [,indexRaw,codeRaw,ap,bp]=line.split('|'),index=+indexRaw,code=+codeRaw;
  const side=code<8?(code<4?'front':'back'):code%2===0?'front':'back';const [ax,ay]=ap.split(',').map(Number),[bx,by]=bp.split(',').map(Number);
  let action;
  if(code<8)action={type:'MOVE',direction:['north','east','south','west'][code%4]};
  else if(code<10)action={type:'LIFT',liftId:'lift-01'};
  else if(code<12)action={type:'FLIP',floorId:'floor-01'};
  else if(code<14&&number===1)action={type:'PUSH',wallId:'wall-01'};
  else if(code<14)action={type:'ROTATE',roomId:'room-01'};
  else if(code<16)action={type:'PUSH',wallId:'wall-lower'};
  else action={type:'PUSH',wallId:'wall-upper'};
  s=step(s,stage,side,action,index,{front:{x:ax,y:ay},back:{x:bx,y:by}});
 }
 assert.equal(lines.length,expectedSteps);assert(s.complete);console.log(`CHALLENGE_${String(number).padStart(2,'0')}_WITNESS=PASS steps=${lines.length}`);
}
function example1(){return replayTrace(1,'c01/challenge1_trace.txt',102)}
function example6(){return replayTrace(6,'c06/challenge6_shortest_trace_full.txt',145)}
function example9(){return replayTrace(9,'c09/challenge9_shortest_trace_full.txt',200)}
function example5(){const stage=st(5),rows=parseTsv(`${ref}/c05/challenge5_shortest_route.tsv`);let s=core.createStageState(stage);for(const row of rows.slice(1)){const op=row.action,side=/^[0-3F]$/.test(op)?'front':'back';const act=op==='F'||op==='f'?{type:'FLIP',floorId:'floor-01'}:{type:'MOVE',direction:['north','east','south','west'][+op%4]};s=step(s,stage,side,act,row.step,{front:{x:+row.A_x,y:+row.A_y},back:{x:+row.B_x,y:+row.B_y}});}assert(s.complete);console.log(`CHALLENGE_05_WITNESS=PASS steps=${rows.length-1}`)}
function example4(){const stage=st(4),rows=parseTsv(`${ref}/c04/challenge4_shortest_route.tsv`);let s=core.createStageState(stage);for(const row of rows){const op=row.action;let side,a;
 if(/^[0-7]$/.test(op)){side=+op<4?'front':'back';a={type:'MOVE',direction:['north','east','south','west'][+op%4]};}
 else {side=op.toUpperCase()===op?'front':'back';if('PQ'.includes(op)){side=op==='P'?'front':'back';a={type:'POWER',circuitId:side==='front'?'circuit-front':'circuit-back'};}
 else if('Ss'.includes(op))a={type:'SEND',transferId:'transfer-01',itemId:'cell-01'};
 else if('Rr'.includes(op))a={type:'RECEIVE',transferId:'transfer-01',itemId:'cell-01'};
 else if('Xx'.includes(op))a={type:'CANCEL',transferId:'transfer-01',itemId:'cell-01'};
 else if(op==='I'||op==='U'){side='back';a={type:op==='I'?'INSTALL':'REMOVE',objectId:'socket-01',itemId:'cell-01'};}else throw Error('unknown c04 action '+op);}
 s=step(s,stage,side,a,row.step,{front:{x:+row.A_x,y:+row.A_y},back:{x:+row.B_x,y:+row.B_y}});
 const loc=s.items['cell-01'],status=loc.kind==='inventory'?(loc.side==='front'?0:1):loc.kind==='installed'?4:loc.receiver==='back'?2:3;
 for(const [key,val] of Object.entries({power:(s.powered['circuit-front']?1:0)|(s.powered['circuit-back']?2:0),cell:status,latch:+!!s.latchOpen['latch-01'],mask:(s.goalVisited.front?1:0)|(s.goalVisited.back?2:0)}))assert.equal(+row[key],val,`c04 state ${key} step ${row.step}`);
 }assert(s.complete);console.log(`CHALLENGE_04_WITNESS=PASS steps=${rows.length}`)}
function example3(){const stage=st(3),lines=fs.readFileSync(`${ref}/c03/challenge3_witness_states.tsv`,'utf8').trim().split(/\r?\n/).map(x=>x.split('\t').map(Number));let s=core.createStageState(stage);assert.equal(lines.length,161);const old=lines[0];assert.deepEqual(s.position,{front:{x:old[0],y:old[1]},back:{x:old[2],y:old[3]}});
 for(let k=1;k<lines.length;k++){const prev=lines[k-1],row=lines[k],index=k;
  let side,a;const pChanged=prev.slice(0,4).some((v,i)=>row[i]!==v);
  if(pChanged){side=prev[0]!==row[0]||prev[1]!==row[1]?'front':'back';const i=side==='front'?0:2;a={type:'MOVE',direction:direction(s.position[side],{x:row[i],y:row[i+1]})};}
  else if(prev[6]!==row[6]){const bit=prev[6]^row[6];side=bit===1?'front':'back';a={type:'UNLOCK',doorId:bit===1?'key-front-upper':bit===2?'key-back-lower':'key-back-upper',itemId:'key-01'};}
  else if(prev[7]!==row[7]){side='back';a={type:'MIRROR',mirrorId:'mirror-01'};}
  else {let itemId,from,to;if(prev[4]!==row[4]){itemId='key-01';from=prev[4];to=row[4];}else if(prev[5]!==row[5]){itemId='light-01';from=prev[5];to=row[5];}else throw Error('no state change c03 '+index);
   const dec=itemId==='key-01'?{0:{kind:'inventory',side:'front'},1:{kind:'inventory',side:'back'},2:{kind:'pending',transferId:'transfer-lower',receiver:'front'},3:{kind:'pending',transferId:'transfer-lower',receiver:'back'},4:{kind:'pending',transferId:'transfer-upper',receiver:'front'},5:{kind:'pending',transferId:'transfer-upper',receiver:'back'}}:{0:{kind:'installed',objectId:'pedestal-front'},1:{kind:'inventory',side:'front'},2:{kind:'inventory',side:'back'},3:{kind:'installed',objectId:'pedestal-back'},4:{kind:'pending',transferId:'transfer-lower',receiver:'front'},5:{kind:'pending',transferId:'transfer-lower',receiver:'back'},6:{kind:'pending',transferId:'transfer-upper',receiver:'front'},7:{kind:'pending',transferId:'transfer-upper',receiver:'back'}};
   const x=dec[from],y=dec[to];if(x.kind==='inventory'&&y.kind==='pending'){side=x.side;a={type:'SEND',transferId:y.transferId,itemId};}
   else if(x.kind==='pending'&&y.kind==='inventory'){side=y.side;a={type:'RECEIVE',transferId:x.transferId,itemId};}
   else if(x.kind==='inventory'&&y.kind==='installed'){side=x.side;a={type:'INSTALL',objectId:y.objectId,itemId};}
   else if(x.kind==='installed'&&y.kind==='inventory'){side=y.side;a={type:'REMOVE',objectId:x.objectId,itemId};}
   else throw Error(`invalid item step ${index} ${from}->${to}`);
  }
  s=step(s,stage,side,a,index,{front:{x:row[0],y:row[1]},back:{x:row[2],y:row[3]}});
  const loc=(l,light)=>l.kind==='inventory'?(l.side==='front'?(light?1:0):(light?2:1)):l.kind==='installed'?(l.objectId==='pedestal-front'?0:3):({'transfer-lower':0,'transfer-upper':1}[l.transferId]*2)+(l.receiver==='front'?0:1)+(light?4:2);
  for(const [j,val] of Object.entries({4:loc(s.items['key-01'],false),5:loc(s.items['light-01'],true),6:(s.unlocked['key-front-upper']?1:0)|(s.unlocked['key-back-lower']?2:0)|(s.unlocked['key-back-upper']?4:0),7:s.mirrorFrontDiagonal['mirror-01']==='/'?0:1,8:(s.goalVisited.front?1:0)|(s.goalVisited.back?2:0)}))assert.equal(row[j],val,`c03 state col ${j} step ${index}`);
 }assert(s.complete);console.log(`CHALLENGE_03_WITNESS=PASS steps=${lines.length-1}`)}
function verifyInvalidActor(){const stage=st(1),state=core.createStageState(stage);assert.throws(()=>core.applyStageAction(stage,state,{playMode:'ONLINE_DUO',authenticatedPlayerId:'unassigned',serverSeatAssignment:{front:'A',back:'B'}},{type:'MOVE',direction:'north'}),/Unauthorized labyrinth actor/);assert.equal(state.acceptedActions,0);console.log('CHALLENGE_ONLINE_ACTOR_AUTHORITY=PASS');}
verifyInvalidActor();
for(const fn of [example1,example2,example3,example4,example5,example6,example7,example8,example9,example10]){try{fn();}catch(e){console.error('FAIL',e.message);process.exitCode=1;}}
