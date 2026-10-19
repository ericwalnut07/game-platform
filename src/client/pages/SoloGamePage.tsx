import { Suspense } from "react";
import { navigate } from "../lib/router";
import { findSoloGame } from "../solo/registry";

export function SoloGamePage({ gameId }: { gameId: string }) {
  const game = findSoloGame(gameId);
  if (!game) return <section className="panel">
    <h1>1人用ゲームが見つかりません</h1>
    <button type="button" onClick={() => navigate("/solo")}>1人用ゲーム一覧へ</button>
  </section>;

  const Page = game.Page;
  return <Suspense fallback={<p role="status">{game.title}を読み込み中…</p>}>
    <Page key={game.id} />
  </Suspense>;
}
