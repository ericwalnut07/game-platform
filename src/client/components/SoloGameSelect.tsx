import { navigate } from "../lib/router";

const SOLO_GAMES = [
  { id: "ooishi-territory", title: "大石のテリトリー" },
  { id: "ooishi-territory-2", title: "大石のテリトリー2" }
] as const;

export function SoloGameSelect({ value }: { value: string }) {
  return <label>ゲーム
    <select aria-label="ゲーム" value={value}
      onChange={(event) => navigate("/solo/" + event.target.value)}>
      {SOLO_GAMES.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}
    </select>
  </label>;
}
