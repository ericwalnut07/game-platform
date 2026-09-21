import type { PonInaiMatchPlayerView } from "../../../games/pon-inai/module";
import type { PonVoteTarget } from "../../../games/pon-inai/game-state";
import type { RoomPublicState } from "../../../shared/room-protocol";
import { missionText, personalityText } from "../../../games/pon-inai/presentation";

export function PonInaiResults({ view, room }: { view: PonInaiMatchPlayerView; room: RoomPublicState }) {
  const game = view.currentGame;
  const result = game?.revealData;
  if (!game || !result) return null;
  const name = (id: string) => room.players.find((p) => p.playerId === id)?.displayName ?? "?";
  const target = (vote: PonVoteTarget) => vote.type === "NO_PON" ? "ポンはいない" : name(vote.playerId);
  const verdict = result.verdict;
  const accuracy = result.verdictAccuracy === "UNDECIDED" ? "判決不能" : result.verdictAccuracy === "CORRECT" ? "裁判成功" : "裁判失敗";

  return <div className="result-summary">
    <section className="result-overview" aria-label="ゲーム結果">
      <div className="eyebrow">GAME {game.gameIndex} / {view.gameCount} · RESULT</div>
      <h2>ミッションとポン裁判</h2>
      <div className="result-facts">
        <div><span>ミッション</span><strong>{result.missionSuccess ? "成功" : "失敗"}</strong></div>
        <div><span>今回のポン</span><strong>{result.actualPonPlayerId ? name(result.actualPonPlayerId) : "ポンはいませんでした"}</strong></div>
        <div><span>ポン裁判</span><strong>{accuracy}</strong></div>
      </div>
      <p className="result-mission"><b>真ミッション</b>{result.trueMission && missionText(result.trueMission)}</p>
      <p className="result-verdict"><b>裁判の判決</b>{verdict?.type === "UNDECIDED" ? "決選投票も同票のため、判決不能" : verdict?.type === "PLAYER" ? `${name(verdict.playerId)}がポン` : "ポンはいない"}</p>
    </section>

    <div className="result-columns">
      <section className="result-card" aria-label="ポン裁判の投票先">
        <h2>みんなのポン予想</h2>
        <p className="result-help">個人の予想点は初回の投票で判定します。</p>
        <div className="result-votes">
          {game.publicState.playerIds.map((id) => {
            const initial = result.initialVotes?.[id];
            const runoff = result.runoffVotes?.[id];
            return <div className="result-vote" key={id}>
              <b>{name(id)}</b>
              <span>初回：{initial ? target(initial.ponVote) : "—"}{runoff && <><br/>決選：{target(runoff)}</>}</span>
            </div>;
          })}
        </div>
        <details className="result-details">
          <summary>各自が見ていたミッション</summary>
          {result.displayedMissions && Object.entries(result.displayedMissions).map(([id, mission]) => <p key={id}><b>{name(id)}</b><br/>{missionText(mission)}</p>)}
        </details>
      </section>

      <section className="result-card" aria-label="個人結果・得点">
        <h2>全員の得点</h2>
        <p className="result-help">名前を開くと、得点内訳と秘密の性格を確認できます。</p>
        <div className="result-score-list">
          {result.scoring?.players.map((score) => {
            const id = score.playerId;
            const personality = result.personalities?.[id];
            const initial = result.initialVotes?.[id];
            const total = view.resultStats?.find((stat) => stat.playerId === id)?.totalScore;
            return <details className="result-player" key={id}>
              <summary><span className="result-player-name">{name(id)}{id === game.me.playerId && <small>（自分）</small>}</span><strong>+{score.total}点</strong><span className="result-total">累計 {total ?? "—"}点</span></summary>
              <div className="result-player-body">
                <dl className="result-breakdown">
                  <div><dt>スパダリ</dt><dd>{score.spadariPoint}点</dd></div>
                  <div><dt>陣営</dt><dd>{score.factionPoint}点</dd></div>
                  <div><dt>ポン予想</dt><dd>{score.truthVotePoint}点</dd></div>
                  <div><dt>秘密の性格</dt><dd>{score.personalityPoint}点</dd></div>
                </dl>
                <p><b>スパダリ投票</b>：獲得 {result.spadariVoteCounts?.[id] ?? 0}票 ／ 投票先 {initial ? name(initial.spadariPlayerId) : "—"}</p>
                <p><b>初回のポン予想</b>：{initial ? target(initial.ponVote) : "—"} ／ {score.truthVotePoint ? "正解" : "不正解"}</p>
                {personality && <p><b>秘密の性格：{personality.displayName}</b> ／ {result.personalityResults?.[id] ? "達成" : "未達成"}<br/>{personalityText(personality)}</p>}
              </div>
            </details>;
          })}
        </div>
      </section>
    </div>
  </div>;
}
