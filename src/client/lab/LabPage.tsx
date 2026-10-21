import { navigate, useHashRoute } from "../lib/router";
import CardTablePage from "./cards/CardTablePage";

export default function LabPage() {
  const route = useHashRoute();
  if (route.parts.length === 3 && route.parts[2] === "cards") return <CardTablePage />;
  if (route.parts.length > 2) return <section className="panel"><h1>検討用ツールが見つかりません</h1><button className="secondary-button" onClick={() => navigate("/solo/lab")}>検討用へ戻る</button></section>;
  return <section className="panel wide">
    <button className="text-button" onClick={() => navigate("/solo")}>← 1人で遊ぶへ</button>
    <p className="eyebrow">GAME WORKBENCH</p><h1>検討用</h1>
    <p>ルールを決める前に、並べて、動かして、試してみる。</p>
    <div className="home-actions"><button className="action-card" onClick={() => navigate("/solo/lab/cards")}><strong>トランプ自由配置</strong><span>54枚のカードを自由に動かす、1人用の試作テーブル</span></button></div>
  </section>;
}
