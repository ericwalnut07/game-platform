import { navigate } from "../lib/router";
export function SoloGamesPage() {
  return <section className="panel wide"><button type="button" className="text-button" onClick={() => navigate("/")}>← TOPへ</button><h1>1人で遊ぶ</h1><div className="home-actions">
    <button type="button" className="action-card" onClick={() => navigate("/solo/two-sided-labyrinth")}><strong>表裏一体迷宮</strong><span>表と裏を切り替えて、20面を練習</span></button>
    <button type="button" className="action-card" onClick={() => navigate("/solo/ooishi-territory")}><strong>大石のテリトリー</strong><span>1台で全席を操作する試遊</span></button>
  </div></section>;
}
