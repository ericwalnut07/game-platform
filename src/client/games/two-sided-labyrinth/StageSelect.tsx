import { STAGES } from "../../../games/two-sided-labyrinth/catalog";
export function StageSelect({ value, onChange, disabled = false }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return <label className="maze-stage-select">ステージ<select aria-label="ステージ" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
    {(["tutorial", "challenge"] as const).map((category) => <optgroup key={category} label={category === "tutorial" ? "チュートリアル" : "チャレンジ"}>
      {STAGES.filter((s) => s.category === category).map((s) => <option key={s.stageId} value={s.stageId}>{s.stageId.slice(-2)} · {s.title}</option>)}
    </optgroup>)}
  </select></label>;
}
