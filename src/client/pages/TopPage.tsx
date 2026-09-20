import { navigate } from "../lib/router";

export function TopPage() {
  return (
    <section className="hero">
      <div className="eyebrow">WEB GAME PLATFORM</div>
      <h1>今日は、何して遊ぶ？</h1>
      <p>自作ゲームをブラウザだけで。インストール不要で、友だちと同じ部屋に集まれます。</p>
      <button className="rules-cta" onClick={() => navigate("/rules")}>初めて遊ぶ方へ：『ポンはいない』のルールを見る →</button>
      <div className="home-actions">
        <button className="action-card muted" disabled>
          <strong>1人で遊ぶ</strong>
          <span>対応ゲームを今後追加予定</span>
        </button>
        <button className="action-card" onClick={() => navigate("/create")}>
          <strong>部屋を作る</strong>
          <span>ゲームを選んでホストする</span>
        </button>
        <button className="action-card" onClick={() => navigate("/join")}>
          <strong>部屋に入る</strong>
          <span>コードまたは公開部屋から参加</span>
        </button>
      </div>
    </section>
  );
}
