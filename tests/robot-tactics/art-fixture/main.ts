/** Rendering-only gallery. No mission, battle state, progression or replacement production runtime. */
import {mountRobotBattleScreen} from "../../../src/client/games/robot-tactics/BattleScreen";
import {emptyRobotBattleSelection,type RobotBattleViewModel} from "../../../src/client/games/robot-tactics/BattleViewModel";
import {createRobotVisualSprite} from "../../../src/client/games/robot-tactics/RobotVisualSprite";
import {robotArtPalette,robotUnitArtUrl,robotPortraitArtUrl} from "../../../src/client/games/robot-tactics/RobotVisualArt";
import "../../../apps/robot-tactics/style.css";
const ids=new URLSearchParams(location.search).has("variants")?["attack-1","attack-2-a","attack-2-b","defense-1","defense-2","reactor-1","reactor-2","mobile-1","mobile-2","all-rounder"]:new URLSearchParams(location.search).has("models")?["enemy-light","enemy-light","enemy-light","enemy-medium","enemy-medium","enemy-medium","enemy-heavy","enemy-heavy","enemy-heavy","enemy-boss"]:["attack-1","defense-1","reactor-1","mobile-1","all-rounder","friendly-ai","enemy-light","enemy-medium","enemy-heavy","enemy-boss"];
const weapons=["standard-sword","heavy-hammer","light-lance","light-pistol","sniper-rifle","light-grenade-launcher"],families=["slash","blunt","thrust","assault","sniper","blast"] as const;
const host=document.getElementById("app")!;let sequence=0;
function model():RobotBattleViewModel{return{checkpoint:{battleId:"art-only",sequence},turnId:"art-turn-"+sequence,round:1,roundLimit:5,board:{width:7,height:5,walls:[]},structures:[],units:ids.map((frameId,i)=>({id:"art-"+i,name:frameId,kind:i===0?"controlled":frameId.startsWith("enemy-")?"enemy":frameId==="friendly-ai"?"friendly-ai":"controlled",cell:{x:1+i%5,y:1+Math.floor(i/5)*2},hp:80,maxHp:100,en:60,maxEn:100,weapons:[],appearance:{frameId,weaponIds:["light-blade",weapons[Number(new URLSearchParams(location.search).get("family")??3)]!],weaponFamilies:["slash",families[Number(new URLSearchParams(location.search).get("family")??3)]!],palette:robotArtPalette(frameId,frameId.startsWith("enemy-")?(["A","B","C"] as const)[i%3]:undefined,30)}})),queue:[{id:"art-actor-"+sequence,name:"操作機",kind:"controlled",unitIds:["art-0"]}],commands:[{id:"first",label:"武器①",category:"attack",disabledReason:null,visualWeaponId:"light-blade"},{id:"second",label:"武器②",category:"attack",disabledReason:null,visualWeaponId:weapons[Number(new URLSearchParams(location.search).get("family")??3)]!},{id:"wait",label:"待機",category:"wait",disabledReason:null}],choices:[{id:"first",commandId:"first",selection:emptyRobotBattleSelection(),payload:{}},{id:"second",commandId:"second",selection:emptyRobotBattleSelection(),payload:{}},{id:"wait",commandId:"wait",selection:emptyRobotBattleSelection(),payload:{}}],blocked:[],ai:{mode:"auto",instructions:{}},latestSummary:"正式PNG表示契約",latestAction:null};}
const handle=mountRobotBattleScreen(host,{model:model(),execute:async()=>{sequence++;handle.update(model(),false);},executeAi:async()=>{},configureAi:async()=>{}});
if(new URLSearchParams(location.search).has("fallback")){
 const area=document.createElementNS("http://www.w3.org/2000/svg","svg");area.setAttribute("viewBox","0 0 4 1");area.style.cssText="position:fixed;bottom:0;left:0;width:400px;height:100px;background:#18283a;z-index:20";area.dataset.artFallbackGallery="true";
 for(const [index,mode]of ["body","weapon","portrait"].entries()){
  const fallback=document.createElementNS("http://www.w3.org/2000/svg","rect");for(const[k,v]of Object.entries({x:".2",y:".2",width:".6",height:".6",fill:"#2879bf"}))fallback.setAttribute(k,v);
  const good=robotUnitArtUrl("attack-1")!,bad="data:image/png;base64,invalid";
  const sprite=createRobotVisualSprite(document,{frameId:"attack-1",palette:"base",weaponFamily:"slash",slot:1,fallback,...(mode==="body"?{bodySources:[bad]}:mode==="portrait"?{bodySources:[bad,good],portrait:true}:{bodySources:[good],weaponSource:bad})});sprite.dataset.fallbackCase=mode;sprite.setAttribute("transform",`translate(${index} 0)`);area.append(sprite);
 }
 document.body.append(area);
}
// Expose only renderer asset references for offline decoding/alpha checks.
Object.assign(window,{approvedArtUrls:ids.map(id=>robotUnitArtUrl(id)),approvedPortraitUrls:ids.map(id=>robotPortraitArtUrl(id))});
