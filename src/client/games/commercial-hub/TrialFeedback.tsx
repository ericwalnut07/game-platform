import { useState } from "react";
import type { HubView } from "../../../games/commercial-hub/view";
export function TrialFeedback({view}:{view:HubView}){
 const [minutes,setMinutes]=useState(""),[fields,setFields]=useState<Record<string,string>>({}),[saved,setSaved]=useState(false);
 const labels=[["interesting","面白かった選択"],["weak","弱すぎたカード"],["strong","強すぎたカード"],["interference","不快に感じた妨害"],["idle","終盤にやることがなかった場面"],["improvement","改善点・操作性・バランス・楽しさ"]] as const;
 function save(){const data={schemaVersion:1,game_id:view.gameId,match_id:view.matchId,rules_variant:view.config.rulesVariant??"V05",test_version:view.config.testVersion??null,config:view.config,rounds:view.round,minutes:minutes?Number(minutes):null,feedback:fields};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`hub-trial-feedback-${view.matchId}.json`;a.click();URL.revokeObjectURL(url);setSaved(true);}
 return <section className="hub-card" aria-label="試遊後の感想"><h2>試遊後の感想（端末内に保存）</h2><p>試合ID・条件を添えてJSONを保存し、運用者へ共有してください。表示名・手札・認証情報は含めません。個人情報を記入する必要はありません。</p><label>プレイ時間（分）<input type="number" min="0" max="1440" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>{labels.map(([key,label])=><label key={key}>{label}<textarea maxLength={2000} value={fields[key]??""} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}<button onClick={save}>試遊感想をJSON保存</button>{saved&&<p role="status">保存しました。再戦前に各自の感想を記録してください。</p>}</section>;
}
