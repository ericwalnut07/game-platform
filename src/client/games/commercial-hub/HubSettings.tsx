import type { HubConfig } from "../../../games/commercial-hub/config";
export function HubSettings({ value, onChange, disabled = false }: { value: HubConfig; onChange: (value: HubConfig) => void; disabled?: boolean }) {
  return <fieldset className="hub-rule-settings" disabled={disabled}><legend>商都開発のルール設定</legend>
    <label>商機トリック<select aria-label="商機トリック" value={value.trickRule} onChange={(e) => onChange({ ...value, trickRule: e.target.value as HubConfig["trickRule"] })}><option value="NORMAL">通常</option><option value="BID">ビッドあり</option></select></label>
    <label>監査官<select aria-label="監査官" value={String(value.auditor)} onChange={(e) => onChange({ ...value, auditor: e.target.value === "true" })}><option value="false">なし</option><option value="true">あり</option></select></label>
    <small>2項目は独立して選べます。4人・現行マップ・最大12ラウンド。</small>
  </fieldset>;
}
