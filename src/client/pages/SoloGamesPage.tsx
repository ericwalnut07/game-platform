import { navigate } from "../lib/router";
import { soloGames } from "../solo/registry";
export function SoloGamesPage() {
  return <section className="panel wide"><button type="button" className="text-button" onClick={() => navigate("/")}>← TOPへ</button><h1>1人で遊ぶ</h1><div className="home-actions">
    {soloGames.map(game => <button key={game.id} type="button" className="action-card" onClick={() => navigate(`/solo/${game.id}`)}><strong>{game.title}</strong><span>{game.description}</span></button>)}
  </div></section>;
}
