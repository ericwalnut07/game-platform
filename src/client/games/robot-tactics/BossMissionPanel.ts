import { getRobotBossSkillView, type RobotBossSkillContext, type RobotBossState } from "../../../games/robot-tactics/bossCommands";
import { commitRobotM30DataAction, type RobotM30State } from "../../../games/robot-tactics/m30Mission";
import type { RobotAlliedLifeUnit } from "../../../games/robot-tactics/alliedLifecycle";
import type { RobotEnergyState } from "../../../games/robot-tactics/energy";

export interface RobotBossMissionPanelProps {
  readonly boss: RobotBossState; readonly bossContext: RobotBossSkillContext;
  readonly mission: RobotM30State | null; readonly actor: RobotAlliedLifeUnit; readonly actorEnergy: RobotEnergyState;
  readonly unitLabels: Readonly<Record<string,string>>;
  /** Enemy actions remain AI-selected. Enable only to confirm a planned skill action. */
  readonly allowBossSkillConfirmation?: boolean;
  readonly onBossSkill: () => void; readonly onPickup: () => void; readonly onTransmit: () => void;
}

/** Standalone panel for later battle-screen composition; no registry, title or save-key registration. */
export function renderRobotBossMissionPanel(root: HTMLElement, p: RobotBossMissionPanelProps): void {
  const doc=root.ownerDocument;
  const panel=doc.createElement("section");panel.className="robot-boss-mission-panel";panel.setAttribute("aria-label","ボス・ミッション状況");
  const style=doc.createElement("style");style.textContent=`
    .robot-boss-mission-panel{box-sizing:border-box;width:100%;max-width:900px;margin:auto;padding:20px;border:1px solid #c2cfdd;border-radius:16px;background:#f6f9fd;color:#18283a;font:16px/1.6 system-ui,sans-serif;overflow-wrap:anywhere}
    .robot-boss-mission-panel *{box-sizing:border-box}.robot-boss-mission-panel h2{font-size:21px;margin:0 0 12px}.robot-boss-mission-panel h3{font-size:18px;margin:20px 0 8px}
    .robot-boss-mission-panel p{margin:6px 0}.robot-boss-mission-panel button{font:inherit;min-height:48px;padding:10px 18px;border:1px solid #346384;border-radius:10px;background:#20567a;color:white;cursor:pointer;margin:6px 8px 6px 0;white-space:normal}
    .robot-boss-mission-panel button:disabled{background:#dce4ec;color:#536373;cursor:default;border-color:#a5b4c2}.robot-boss-mission-panel button:focus-visible{outline:3px solid #ce850a;outline-offset:3px}
    .robot-boss-mission-panel .stats{display:flex;flex-wrap:wrap;gap:6px 20px}.robot-boss-mission-panel .marker{padding:6px 12px;background:#fff1d0;border:1px solid #b07914;border-radius:8px}
    @media(max-width:600px){.robot-boss-mission-panel{padding:14px;border-radius:10px}.robot-boss-mission-panel button{width:100%;margin-right:0}.robot-boss-mission-panel h2{font-size:20px}}
  `;
  const text=(parent:HTMLElement,tag:string,value:string,cls?:string)=>{const e=doc.createElement(tag);e.textContent=value;if(cls)e.className=cls;parent.append(e);return e;};
  const button=(label:string,enabled:boolean,action:()=>void)=>{const b=doc.createElement("button");b.type="button";b.textContent=label;b.disabled=!enabled;b.addEventListener("click",action);panel.append(b);};
  const mission=p.mission;
  text(panel,"h2",mission?`M30 最終決戦・中枢攻略 · R${mission.round}/16`:`M${String(p.boss.plan.missionNumber).padStart(2,"0")} ボス状況`);
  const summary=text(panel,"p",mission?.result==="won"?"勝利":mission?.result==="lost"?"敗北":"戦闘継続中");summary.setAttribute("aria-live","polite");
  text(panel,"h3",p.boss.plan.definition.name);
  const stats=text(panel,"div","","stats");text(stats,"span",`ボスHP ${p.boss.hp}/${p.boss.plan.stats.hp}`);text(stats,"span",`ボスEN ${p.boss.energy.en}/${p.boss.energy.maxEn}`);
  text(stats,"span",`MOV ${p.boss.plan.stats.mov} · SPD ${p.boss.plan.stats.spd}`);
  const skill=getRobotBossSkillView(p.boss,p.bossContext);
  const status=skill.available?"発動可能":skill.used?"使用済み":skill.reason==="insufficient-energy"?"EN不足":skill.reason==="action-used"?"行動済み":"発動条件未達";
  text(panel,"p",`${skill.name}：${status} · EN${skill.energyCost}`);
  if(p.boss.plan.missionNumber===30)text(panel,"p","発動条件：手番開始時HP50%以下・1戦闘1回");
  if(p.boss.plan.missionNumber===9)text(panel,"p","離脱機動：操作機が4マス以内・追加合法移動2マスまで。自発的な移動先はF2〜L6。");
  if(p.allowBossSkillConfirmation===true)button(skill.name+"を発動",skill.available&&(!mission||mission.result==="ongoing"),p.onBossSkill);
  if(skill.lastEvent)text(panel,"p",`${skill.name}の発動を確認しました`);
  for(const id of skill.markers)text(panel,"p",`${p.unitLabels[id]??id}：追跡対象`,"marker");
  if(!mission){root.replaceChildren(style,panel);return;}
  text(panel,"h3","防衛施設・データ");
  text(panel,"p",`施設HP ${mission.facility.hp}/${mission.facility.maxHp} · DEF ${mission.facility.def}`);
  text(panel,"p",mission.data.sent?"データ：送信済み":mission.data.carrierId?`データ：${p.unitLabels[mission.data.carrierId]??mission.data.carrierId}が運搬中`:"データ：未取得");
  text(panel,"p",`操作中：${p.unitLabels[p.actor.id]??p.actor.id}`);
  const can=(action:"pickup"|"transmit")=>{try{commitRobotM30DataAction(mission,p.actor,p.actorEnergy,action);return true;}catch{return false;}};
  button("データ取得",can("pickup"),p.onPickup);button("データ送信",can("transmit"),p.onTransmit);
  text(panel,"h3","勝利条件（すべて必要）");
  text(panel,"p",`${mission.result==="won"?"✓":"○"} R16終了まで施設を防衛`);
  text(panel,"p",`${mission.bossDefeated?"✓":"○"} 最高司令機を撃破`);
  text(panel,"p",`${mission.data.sent?"✓":"○"} I14でデータ送信`);
  text(panel,"p","ボス撃破とデータ送信が完了しても、R16終了までは戦闘が続きます。");
  root.replaceChildren(style,panel);
}
