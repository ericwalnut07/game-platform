import { navigate } from "../lib/router";

export function RulesPage() {
  return (
    <section className="panel rules-page">
      <div className="eyebrow">PON WA INAI / QUICK RULES</div>
      <h1>『ポンはいない』遊び方</h1>
      <p className="rules-lead">3〜4人で、宇宙船のトラブルを4ラウンドかけて乗り切る協力ゲームです。ただし、誰か1人だけ「もっともらしい別ミッション」を見ているかもしれません。その本人も、自分がポンだとは知りません。</p>

      <div className="rules-grid">
        <section className="rules-card">
          <h2>1. 自分だけの情報を確認</h2>
          <p>各プレイヤーには「ミッション」「秘密の性格」「6枚の手札」が表示されます。ミッションは全員同じとは限りません。秘密の性格を達成すると個人得点になります。</p>
        </section>

        <section className="rules-card">
          <h2>2. 4ラウンド、カード＋自信度を同時に決定</h2>
          <ol>
            <li>手札からカードを1枚選ぶ</li>
            <li>「自信あり・まあまあ・不安」から自信度を選ぶ</li>
            <li>全員が決定すると、自信度→カードの順で公開</li>
            <li>公開情報だけを使って短く話す</li>
          </ol>
          <p>途中でミッション成功・失敗は表示されません。使ったカードや数字・色の集計は公開情報サマリーで確認できます。</p>
        </section>

        <section className="rules-card rules-warning">
          <h2>会話の最重要ルール</h2>
          <p><strong>話してよいのは公開情報だけです。</strong> 自分のミッションや秘密の性格を読み上げる、言い換える、匂わせることは禁止です。「自分は青が必要」「このカードを出して」など、秘密情報を根拠にした作戦相談もできません。</p>
          <p>一方で、「R2で赤3を自信ありで出したから怪しい」「自分がポンかもしれない」といった、公開情報からの推理や評価はOKです。</p>
        </section>

        <section className="rules-card">
          <h2>3. 最後はポン裁判</h2>
          <p>4ラウンド終了後、全員で最後の議論をしてから秘密投票します。</p>
          <ul>
            <li>「最もスパダリだった人」：自分以外から1人</li>
            <li>「ポンだと思う人」：誰か1人、または「ポンはいない」</li>
          </ul>
          <p>ポン票が同率なら、同率候補だけについて追加議論して決選投票します。</p>
        </section>

        <section className="rules-card">
          <h2>4. 真相公開と得点</h2>
          <p>裁判が終わると、真ミッション・成否・実際のポン・投票先・全員の得点をまとめて確認できます。名前を開くと得点内訳と秘密の性格、詳細を開くと各自が見ていたミッションが表示されます。「エンディングへ」で結末を見て、次のゲームまたはマッチ結果へ進みます。ポンがいてもいなくても、全員が本気でミッション成功を目指してください。</p>
        </section>

        <section className="rules-card">
          <h2>覚えておけば十分な3点</h2>
          <ul>
            <li>ポン本人も、自分がポンだとは知らない</li>
            <li>秘密情報は口にしない。公開された行動だけで話す</li>
            <li>全員がミッション成功を目指してカードを出す</li>
          </ul>
        </section>
      </div>

      <div className="rules-actions">
        <button className="primary-button" onClick={() => navigate("/create")}>部屋を作る</button>
        <button className="secondary-button" onClick={() => navigate("/join")}>部屋に入る</button>
      </div>
    </section>
  );
}
