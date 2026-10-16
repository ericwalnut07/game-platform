import type { HubConfig } from "../../../games/commercial-hub/config";
export function HubSettings({ value, onChange, disabled = false }: { value: HubConfig; onChange: (value: HubConfig) => void; disabled?: boolean }) {
  return <fieldset className="hub-rule-settings" disabled={disabled}><legend>商都開発のルール設定</legend>
    <label>ルールセット<select aria-label="ルールセット" value={"FORMAL"} disabled><option value="FORMAL">正式版 1.0</option></select></label>
    {<><label>終了方式<select aria-label="終了方式" value={value.horizon ?? "11-13"} onChange={e=>onChange({...value,horizon:e.target.value as NonNullable<HubConfig["horizon"]>})}><option value="11-13">A：11〜13R</option><option value="12-14">B：12〜14R</option></select></label><label>大型投資<select aria-label="大型投資" value={String(value.majorInvestments ?? true)} onChange={e=>onChange({...value,majorInvestments:e.target.value === "true"})}><option value="true">あり</option><option value="false">なし（他の新ルールは適用）</option></select></label></>}
    <label>商機トリック<select aria-label="商機トリック" value={value.trickRule} onChange={(e) => onChange({ ...value, trickRule: e.target.value as HubConfig["trickRule"] })}><option value="NORMAL">通常</option><option value="BID">ビッドあり</option></select></label>
    <label>監査官<select aria-label="監査官" value={String(value.auditor)} onChange={(e) => onChange({ ...value, auditor: e.target.value === "true" })}><option value="false">なし</option><option value="true">あり</option></select></label>
    <small>正式版1.0。終了方式・大型投資・ビッド・監査官を選択でき、同室再戦でも設定を維持します。</small>
  </fieldset>;
}



