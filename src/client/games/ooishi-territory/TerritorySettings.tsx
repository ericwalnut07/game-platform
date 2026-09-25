import type { TerritoryConfig } from "../../../games/ooishi-territory/engine";
import { TERRITORY_PRESETS } from "../../../games/ooishi-territory/engine";

interface Props {
  value: TerritoryConfig;
  onChange: (config: TerritoryConfig) => void;
  disabled?: boolean;
  showPlayers?: boolean;
}
export function TerritorySettings({ value, onChange, disabled = false, showPlayers = true }: Props) {
  const numberField = (key: "big" | "medium" | "small", min: number, max: number, label: string) =>
    <label key={key}>{label}
      <input type="number" min={min} max={max} value={value[key]} disabled={disabled}
        onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />
    </label>;
  return <div className="ooishi-settings">
    {showPlayers && <label>プレイ人数
      <select value={value.playerCount} disabled={disabled} onChange={(event) => onChange({ ...TERRITORY_PRESETS[Number(event.target.value) as 2 | 3 | 4] })}>
        {[2, 3, 4].map((n) => <option key={n} value={n}>{n}人</option>)}
      </select>
    </label>}
    <label>盤面サイズ
      <select value={value.size} disabled={disabled} onChange={(event) => onChange({ ...value, size: Number(event.target.value) })}>
        {[7, 8, 9, 10, 11].map((n) => <option key={n} value={n}>{n}×{n}</option>)}
      </select>
    </label>
    {numberField("big", 1, 5, "大石／人")}
    {numberField("medium", 0, 6, "中石／人")}
    {numberField("small", 1, 12, "小石／人")}
    <label>ムーンボレーの回数／人
      <select value={value.exp} disabled={disabled} onChange={(event) => onChange({ ...value, exp: Number(event.target.value) })}>
        {[0, 1, 2].map((n) => <option key={n} value={n}>{n}回</option>)}
      </select>
    </label>
    <label>手番方式
      <select value={value.order} disabled={disabled} onChange={(event) => onChange({ ...value, order: event.target.value as TerritoryConfig["order"] })}>
        <option value="fixed">毎ラウンド固定順</option>
        <option value="rotate">毎ラウンド巡回</option>
        <option value="alternate">正順と逆順を交替</option>
        <option value="balanced">均等巡回（試験用）</option>
      </select>
    </label>
    <label>大石の使用期限
      <select value={value.bigBan} disabled={disabled} onChange={(event) => onChange({ ...value, bigBan: Number(event.target.value) as TerritoryConfig["bigBan"] })}>
        <option value={0}>制限なし</option>
        <option value={1}>最終ラウンド禁止（標準）</option>
        <option value={2}>最後の2ラウンド禁止</option>
        <option value={4}>最後の4ラウンド禁止</option>
      </select>
    </label>
    <label>最終ラウンドのムーンボレー
      <select value={value.expRule} disabled={disabled} onChange={(event) => onChange({ ...value, expRule: Number(event.target.value) as TerritoryConfig["expRule"] })}>
        <option value={0}>全員が使用可能</option>
        <option value={1}>全員が使用不可（標準）</option>
        <option value={2}>最終行動者だけ使用不可</option>
      </select>
    </label>
    <label>中石の配置条件
      <select value={value.medRule} disabled={disabled} onChange={(event) => onChange({ ...value, medRule: Number(event.target.value) as TerritoryConfig["medRule"] })}>
        <option value={0}>自分の大石の勢力圏内</option>
        <option value={1}>大石圏内または自分の小石に隣接（標準）</option>
      </select>
    </label>
  </div>;
}
