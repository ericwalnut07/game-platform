import {
  TERRITORY2_PRESETS,
  territory2Preset,
  type Territory2Config
} from "../../../games/ooishi-territory-2/engine";

export function Territory2Settings({ value, onChange, disabled = false }: {
  value: Territory2Config;
  onChange: (config: Territory2Config) => void;
  disabled?: boolean;
}) {
  return <div className="ooishi-settings">
    <label>プレイ人数
      <select value={value.playerCount} disabled={disabled}
        onChange={(event) => onChange(territory2Preset(Number(event.target.value) as 2 | 3 | 4, value.maxBigStones))}>
        {[2, 3, 4].map((count) => <option key={count} value={count}>{count}人</option>)}
      </select>
    </label>
    <label>大石の上限／人
      <select value={value.maxBigStones} disabled={disabled}
        onChange={(event) => onChange({ ...value, maxBigStones: Number(event.target.value) as 1 | 2 })}>
        <option value={1}>1個（標準）</option>
        <option value={2}>2個まで使用可</option>
      </select>
    </label>
    <div className="ooishi2-setting-summary" aria-label="人数別の固定設定">
      <strong>{value.size}×{value.size}</strong>
      <span>1人{value.turns}手</span>
      <small>{value.playerCount === 2 ? "先手を毎ラウンド交代" : "開始プレイヤーを毎ラウンド順送り"}</small>
    </div>
    <div className="ooishi2-setting-summary">
      <strong>大石は任意</strong>
      <span>3手目〜最終手の1手前</span>
      <small>使わずに小石だけで最後まで進めてもかまいません。</small>
    </div>
  </div>;
}

export { TERRITORY2_PRESETS };
