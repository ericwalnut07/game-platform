import { useEffect, useMemo, useState } from "react";
import type { RoomPublicState, ClientRoomMessageInput } from "../../../shared/room-protocol";
import type { PonInaiMatchPlayerView } from "../../../games/pon-inai/module";
import type { PonInaiClientAction } from "../../../games/pon-inai/web-actions";
import type { Card, Confidence, Color, PublicSummary } from "../../../games/pon-inai/types";
import type { PonVoteTarget } from "../../../games/pon-inai/game-state";
import type { PlaytestFeedback } from "../../../shared/playtest";
import type { RoomConnectionState } from "../../lib/room-socket";
import { colorLabel, confidenceLabel, endingText, missionText, personalityText } from "../../../games/pon-inai/presentation";

const colorClass: Record<Color, string> = { RED: "card-red", BLUE: "card-blue", GREEN: "card-green", YELLOW: "card-yellow" };
const colorIcon: Record<Color, string> = { RED: "●", BLUE: "◆", GREEN: "▲", YELLOW: "■" };

interface Props {
  room: RoomPublicState;
  view: PonInaiMatchPlayerView;
  phaseVersion: number;
  send: (message: ClientRoomMessageInput) => void;
  connectionState: RoomConnectionState;
  onReenter: () => void;
}

function CardView({ card, selected, onClick, disabled }: { card: Card; selected?: boolean; onClick?: () => void; disabled?: boolean }) {
  const label = `${colorLabel[card.color]}の${card.number}`;
  return <button type="button" aria-label={label} aria-pressed={selected ?? false} disabled={disabled} onClick={onClick} className={`game-card ${colorClass[card.color]} ${selected ? "selected" : ""}`}><span className="card-icon" aria-hidden="true">{colorIcon[card.color]}</span><span>{colorLabel[card.color]}</span><strong>{card.number}</strong></button>;
}

function PlayedCardHistory({ playedCards }: { playedCards: NonNullable<PonInaiMatchPlayerView["currentGame"]>["me"]["playedCards"] }) {
  if (playedCards.length === 0) return <p className="muted-copy">まだ使用したカードはありません。</p>;
  return <div className="played-card-history" aria-label="自分が使ったカード">
    {playedCards.map(({ round, card }) => <div className="played-card-item" key={`${round}-${card.id}`}><span>R{round}</span><b className={colorClass[card.color]}><span aria-hidden="true">{colorIcon[card.color]} </span>{colorLabel[card.color]}{card.number}</b></div>)}
  </div>;
}

function Summary({ summary }: { summary: PublicSummary }) {
  const colors = ["RED", "BLUE", "GREEN", "YELLOW"] as const;
  return <div className="public-summary" aria-label="公開情報サマリー">
    <h3>公開情報サマリー</h3>
    <div className="summary-grid">
      <div className="summary-box"><span>使用カード</span><strong>{summary.totalPlayedCards}</strong></div>
      <div className="summary-box"><span>数字合計</span><strong>{summary.totalNumberSum}</strong></div>
      <div className="summary-box"><span>数字平均</span><strong>{summary.totalPlayedCards ? summary.totalNumberAverage.toFixed(2) : "—"}</strong></div>
    </div>
    <div className="summary-tables">
      <div><h4>数字</h4>{([1,2,3,4] as const).map(n => <div className="stat-row" key={n}><span>{n}</span><strong>{summary.numberCounts[n]}枚</strong></div>)}</div>
      <div><h4>色</h4>{colors.map(c => <div className="stat-row" key={c}><span>{colorLabel[c]}</span><strong>{summary.colorCounts[c]}枚</strong></div>)}</div>
      <div><h4>色別数字合計</h4>{colors.map(c => <div className="stat-row" key={c}><span>{colorLabel[c]}</span><strong>{summary.colorNumberSums[c]}</strong></div>)}</div>
    </div>
    <div className="history-strip"><span>ラウンド合計</span>{summary.roundNumberSums.map((v,i)=><b key={i}>R{i+1}: {v}</b>)}</div>
    <div className="history-strip"><span>単独最多色</span>{summary.uniqueTopColorHistory.map((v,i)=><b key={i}>R{i+1}: {v ? colorLabel[v] : "同率"}</b>)}</div>
  </div>;
}

function RoundHistory({ view, room }: { view: NonNullable<PonInaiMatchPlayerView["currentGame"]>; room: RoomPublicState }) {
  const name = (id: string) => room.players.find(p => p.playerId === id)?.displayName ?? "?";
  return <div className="round-history">
    {view.publicState.rounds.map(round => <div className="round-block" key={round.round}>
      <h4>ROUND {round.round}</h4>
      {round.players.map(p => <div className="round-player" key={p.playerId}><span>{name(p.playerId)}</span><b>{confidenceLabel[p.confidence]}</b><em>{p.card ? `${colorLabel[p.card.color]}${p.card.number}` : "カード未公開"}</em></div>)}
    </div>)}
  </div>;
}

function DiscussionRule() {
  return <div className="rule-banner"><strong>会話できるのは公開情報だけ</strong><span>ミッション・秘密の性格の内容、推測、言い換え、次ラウンドの作戦相談は禁止です。</span></div>;
}

function RatingButtons({ label, value, onChange }: { label: string; value: number | null; onChange: (value: 1 | 2 | 3 | 4 | 5) => void }) {
  return <fieldset className="survey-field"><legend>{label}</legend><div className="rating-row">{([1,2,3,4,5] as const).map(n => <button type="button" key={n} aria-pressed={value===n} className={value===n ? "selected" : ""} onClick={() => onChange(n)}>{n}</button>)}</div></fieldset>;
}

export function PonInaiGameScreen({ room, view, phaseVersion, send, connectionState, onReenter }: Props) {
  const game = view.currentGame;
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [spadari, setSpadari] = useState<string>("");
  const [ponVote, setPonVote] = useState<string>("");
  const [runoffVote, setRunoffVote] = useState<string>("");
  const [readySent, setReadySent] = useState(false);
  const [suspectedSelf, setSuspectedSelf] = useState<boolean | null>(null);
  const [selfSuspicionRound, setSelfSuspicionRound] = useState<1 | 2 | 3 | 4 | null>(null);
  const [trialSuspects, setTrialSuspects] = useState<string[]>([]);
  const [singleObviousSuspect, setSingleObviousSuspect] = useState<boolean | null>(null);
  const [summaryUsefulness, setSummaryUsefulness] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [funRating, setFunRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [rulesClarity, setRulesClarity] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [comment, setComment] = useState("");
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"MAIN" | "PRIVATE" | "PUBLIC">("MAIN");

  useEffect(() => {
    setSelectedCard(null); setConfidence(null); setReadySent(false); setFeedbackSaved(false);
    setSuspectedSelf(null); setSelfSuspicionRound(null); setTrialSuspects([]); setSingleObviousSuspect(null); setSummaryUsefulness(null); setFunRating(null); setRulesClarity(null); setComment("");
    setMobilePanel("MAIN");
  }, [phaseVersion]);
  const name = useMemo(() => (id: string) => room.players.find(p => p.playerId === id)?.displayName ?? "?", [room.players]);

  const connected = connectionState === "CONNECTED";

  function gameAction(action: PonInaiClientAction) {
    if (!connected) return;
    send({ type: "GAME_ACTION", action, phaseVersion });
  }
  function phaseReady() {
    if (!connected || readySent) return;
    setReadySent(true);
    send({ type: "GAME_PHASE_READY", phaseVersion });
  }
  function toggleTrialSuspect(playerId: string) {
    setTrialSuspects((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : current.length < 2 ? [...current, playerId] : current);
  }
  function submitFeedback() {
    if (!connected || suspectedSelf === null || singleObviousSuspect === null || summaryUsefulness === null || funRating === null || rulesClarity === null) return;
    const feedback: PlaytestFeedback = {
      suspectedSelf,
      selfSuspicionRound: suspectedSelf ? selfSuspicionRound : null,
      trialSuspectPlayerIds: trialSuspects,
      singleObviousSuspect,
      summaryUsefulness,
      funRating,
      rulesClarity,
      comment
    };
    send({ type: "SUBMIT_PLAYTEST_FEEDBACK", feedback });
    setFeedbackSaved(true);
  }

  if (view.status === "FINISHED") {
    const isHost = room.players.find((player) => player.playerId === view.cumulativeStats.playerId)?.isHost ?? false;
    const allConnected = room.players.every((player) => player.connectionStatus === "CONNECTED");
    return <div className="pon-game"><section className="game-main full"><div className="eyebrow">MATCH RESULT</div><h1>マッチ終了</h1><div className="ranking-list">{view.finalRanking?.map(r => <div key={r.playerId}><strong>{r.rank}位</strong><span>{name(r.playerId)}</span><b>{r.totalScore}点</b></div>)}</div><div className="rematch-panel">{isHost ? <><button className="primary-button" disabled={!connected || !allConnected} onClick={() => send({ type: "REMATCH" })}>もう1回遊ぶ</button>{!allConnected && <p className="muted-copy">全員の接続が戻ると再戦できます。</p>}</> : <p className="muted-copy">ホストが「もう1回遊ぶ」を選ぶと、同じメンバー・設定で新しいマッチが始まります。</p>}</div></section></div>;
  }
  if (!game) return <div className="pon-game"><section className="game-main full"><p>ゲームを準備しています…</p></section></div>;

  const me = game.me;
  const phase = game.phase;
  const players = room.players.filter(p => game.publicState.playerIds.includes(p.playerId));

  let center: React.ReactNode;
  if (phase === "PRIVATE_INFO") {
    center = <div className="private-intro"><div className="eyebrow">GAME {view.currentGameIndex} / {view.gameCount}</div><h1>あなたの情報</h1><div className="secret-card"><span>あなたのミッション</span><strong>{missionText(me.displayedMission)}</strong></div><div className="secret-card personality"><span>秘密の性格：{me.personality.displayName}</span><strong>{personalityText(me.personality)}</strong></div><h3>初期手札</h3><div className="card-row">{me.remainingCards.map(card => <CardView key={card.id} card={card} disabled />)}</div><button className="primary-button" onClick={() => gameAction({ type: "ACK_PRIVATE_INFO" })}>確認した</button></div>;
  } else if (phase === "ROUND_SELECT") {
    center = <div><div className="eyebrow">ROUND {game.currentRound} / 4</div><h1>カードを選ぶ</h1>{game.currentRound > 1 && <div className="played-card-panel"><h3>これまでに使ったカード</h3><PlayedCardHistory playedCards={me.playedCards}/></div>}{me.lockedAction ? <div className="waiting-card" role="status" aria-live="polite"><strong>選択済み</strong><span>ほかのプレイヤーを待っています</span></div> : <><h3>使用するカード</h3><div className="card-row">{me.remainingCards.map(card => <CardView key={card.id} card={card} selected={selectedCard===card.id} onClick={() => setSelectedCard(card.id)} />)}</div><h3>自信度</h3><div className="confidence-row">{(["CONFIDENT","NORMAL","ANXIOUS"] as const).map(c => <button key={c} className={confidence===c ? "selected" : ""} aria-pressed={confidence===c} onClick={() => setConfidence(c)}>{confidenceLabel[c]}</button>)}</div><button className="primary-button" disabled={!selectedCard || !confidence} onClick={() => gameAction({ type:"LOCK_ROUND_ACTION", action:{ cardId:selectedCard!, confidence:confidence! } })}>この内容で決定</button></>}</div>;
  } else if (phase === "CONFIDENCE_REVEAL") {
    center = <div><div className="eyebrow">ROUND {game.currentRound}</div><h1>自信度 公開</h1><RoundHistory view={game} room={room}/></div>;
  } else if (phase === "CARD_REVEAL") {
    center = <div><div className="eyebrow">ROUND {game.currentRound}</div><h1>カード 公開</h1><RoundHistory view={game} room={room}/></div>;
  } else if (phase === "ROUND_TALK") {
    center = <div><div className="eyebrow">ROUND {game.currentRound}</div><h1>短い議論</h1><DiscussionRule/><RoundHistory view={game} room={room}/><button className="secondary-button" disabled={readySent} onClick={phaseReady}>{readySent ? "準備OK・待機中" : "次へ進む準備OK"}</button></div>;
  } else if (phase === "RETURN") {
    center = <div className="center-message"><div className="eyebrow">RETURN</div><h1>青い惑星へ帰還しました</h1><p>ミッションの成否は、まだ公開されません。</p></div>;
  } else if (phase === "FINAL_DISCUSSION") {
    center = <div><div className="eyebrow">PON TRIAL</div><h1>ポン裁判</h1><DiscussionRule/><RoundHistory view={game} room={room}/><button className="primary-button" disabled={readySent} onClick={phaseReady}>{readySent ? "投票待機中" : "投票へ進む"}</button></div>;
  } else if (phase === "INITIAL_VOTE") {
    center = <div><div className="eyebrow">SECRET VOTE</div><h1>同時投票</h1><div className="vote-grid"><label>最もスパダリだった人<select value={spadari} onChange={e=>setSpadari(e.target.value)}><option value="">選択してください</option>{players.filter(p=>p.playerId!==me.playerId).map(p=><option key={p.playerId} value={p.playerId}>{p.displayName}</option>)}</select></label><label>ポンだと思うのは？<select value={ponVote} onChange={e=>setPonVote(e.target.value)}><option value="">選択してください</option>{players.map(p=><option key={p.playerId} value={p.playerId}>{p.displayName}</option>)}<option value="NO_PON">ポンはいない</option></select></label></div><button className="primary-button" disabled={!spadari || !ponVote} onClick={()=>gameAction({type:"LOCK_INITIAL_VOTES",votes:{spadariPlayerId:spadari,ponVote:ponVote==="NO_PON"?{type:"NO_PON"}:{type:"PLAYER",playerId:ponVote}}})}>投票を確定</button></div>;
  } else if (phase === "RUNOFF_DISCUSSION") {
    center = <div><div className="eyebrow">RUNOFF</div><h1>票が割れました</h1><DiscussionRule/><p>同率候補について追加議論します。</p><button className="secondary-button" disabled={readySent} onClick={phaseReady}>{readySent?"準備OK・待機中":"決選投票へ進む準備OK"}</button></div>;
  } else if (phase === "RUNOFF_VOTE") {
    const options = game.publicState.runoffCandidates ?? [];
    center = <div><div className="eyebrow">RUNOFF VOTE</div><h1>決選投票</h1><div className="choice-stack">{options.map((o,i)=>{const value=o.type==="NO_PON"?"NO_PON":o.playerId; return <button key={i} className={runoffVote===value?"selected":""} onClick={()=>setRunoffVote(value)}>{o.type==="NO_PON"?"ポンはいない":name(o.playerId)}</button>})}</div><button className="primary-button" disabled={!runoffVote} onClick={()=>gameAction({type:"LOCK_RUNOFF_VOTE",vote:runoffVote==="NO_PON"?{type:"NO_PON"}:{type:"PLAYER",playerId:runoffVote}})}>決選票を確定</button></div>;
  } else if (phase === "FINISHED") {
    const feedbackComplete = suspectedSelf !== null && singleObviousSuspect !== null && summaryUsefulness !== null && funRating !== null && rulesClarity !== null && (!suspectedSelf || selfSuspicionRound !== null);
    center = <div><div className="eyebrow">GAME COMPLETE</div><h1>ゲーム終了</h1><p>プレイテスト用アンケートは任意です。回答せず次へ進んでも構いません。</p>
      <div className="survey-panel">
        <h2>短いプレイテスト記録</h2>
        <fieldset className="survey-field"><legend>自分がポンかもしれないと思いましたか？</legend><div className="binary-row"><button type="button" aria-pressed={suspectedSelf===true} className={suspectedSelf===true?"selected":""} onClick={()=>setSuspectedSelf(true)}>はい</button><button type="button" aria-pressed={suspectedSelf===false} className={suspectedSelf===false?"selected":""} onClick={()=>{setSuspectedSelf(false);setSelfSuspicionRound(null);}}>いいえ</button></div></fieldset>
        {suspectedSelf && <label className="survey-label">最初に強く疑ったラウンド<select value={selfSuspicionRound ?? ""} onChange={(e)=>setSelfSuspicionRound(Number(e.target.value) as 1|2|3|4)}><option value="">選択</option>{[1,2,3,4].map(n=><option key={n} value={n}>R{n}</option>)}</select></label>}
        <fieldset className="survey-field"><legend>裁判開始時に怪しいと思っていた人（最大2人）</legend><div className="suspect-grid">{players.map(p=><label key={p.playerId}><input type="checkbox" checked={trialSuspects.includes(p.playerId)} disabled={!trialSuspects.includes(p.playerId)&&trialSuspects.length>=2} onChange={()=>toggleTrialSuspect(p.playerId)}/><span>{p.displayName}{p.playerId===me.playerId?"（自分）":""}</span></label>)}</div></fieldset>
        <fieldset className="survey-field"><legend>1人だけが明らかに怪しく見えましたか？</legend><div className="binary-row"><button type="button" aria-pressed={singleObviousSuspect===true} className={singleObviousSuspect===true?"selected":""} onClick={()=>setSingleObviousSuspect(true)}>はい</button><button type="button" aria-pressed={singleObviousSuspect===false} className={singleObviousSuspect===false?"selected":""} onClick={()=>setSingleObviousSuspect(false)}>いいえ</button></div></fieldset>
        <RatingButtons label="公開情報サマリーは役立ちましたか？（1〜5）" value={summaryUsefulness} onChange={setSummaryUsefulness}/><RatingButtons label="今回のゲームは盛り上がりましたか？（1〜5）" value={funRating} onChange={setFunRating}/><RatingButtons label="ルールは理解しやすかったですか？（1〜5）" value={rulesClarity} onChange={setRulesClarity}/>
        <label className="survey-label">自由記述（任意・800文字まで）<textarea value={comment} maxLength={800} rows={5} onChange={e=>setComment(e.target.value)} placeholder="分かりにくかった点、面白かった点、不具合など。個人情報は書かないでください。" /><small>{comment.length} / 800</small></label>
        <button className="secondary-button" disabled={!feedbackComplete || feedbackSaved} onClick={submitFeedback}>{feedbackSaved?"回答を保存しました":"回答を保存"}</button>
      </div>
      <button className="primary-button" disabled={readySent} onClick={phaseReady}>{readySent?"待機中":"次のゲームへ"}</button>
    </div>;
  } else {
    const reveal = game.revealData;
    let title = "真相公開"; let body: React.ReactNode = null;
    if (phase === "VERDICT_REVEAL") { title="ポン裁判の判決"; const v=reveal?.verdict; body=<h2>{v?.type==="UNDECIDED"?"判決不能！":v?.type==="NO_PON"?"ポンはいない！":v?.type==="PLAYER"?`${name(v.playerId)}はポン！`:""}</h2>; }
    if (phase === "MISSION_RESULT_REVEAL") { title="ミッション結果"; body=<h2>{reveal?.missionSuccess?"MISSION SUCCESS":"MISSION FAILED"}</h2>; }
    if (phase === "TRUE_MISSION_REVEAL") { title="本当のミッション"; body=reveal?.trueMission?<h2>{missionText(reveal.trueMission)}</h2>:null; }
    if (phase === "DISPLAYED_MISSIONS_REVEAL") { title="与えられていたミッション"; body=<div className="reveal-list">{reveal?.displayedMissions&&Object.entries(reveal.displayedMissions).map(([id,m])=><div key={id}><b>{name(id)}</b><span>{missionText(m)}</span></div>)}</div>; }
    if (phase === "PON_REVEAL") { title="今回のポン"; body=<h2>{reveal?.actualPonPlayerId?name(reveal.actualPonPlayerId):"ポンはいませんでした！"}</h2>; }
    if (phase === "PERSONALITIES_REVEAL" || phase === "PERSONALITY_RESULTS_REVEAL") { title="秘密の性格"; body=<div className="reveal-list">{reveal?.personalities&&Object.entries(reveal.personalities).map(([id,p])=><div key={id}><b>{name(id)}：{p.displayName}</b><span>{personalityText(p)} {reveal.personalityResults?`／ ${reveal.personalityResults[id]?"達成！":"失敗"}`:""}</span></div>)}</div>; }
    if (phase === "SPADARI_RESULT_REVEAL") { title="スパダリ投票"; body=<div className="reveal-list">{reveal?.spadariVoteCounts&&Object.entries(reveal.spadariVoteCounts).map(([id,n])=><div key={id}><b>{name(id)}</b><span>{n}票</span></div>)}</div>; }
    if (phase === "SCORE_REVEAL") { title="得点"; body=<div className="reveal-list">{reveal?.scoring?.players.map(s=><div key={s.playerId}><b>{name(s.playerId)}</b><span>スパダリ {s.spadariPoint} / 陣営 {s.factionPoint} / 真実 {s.truthVotePoint} / 性格 {s.personalityPoint} = {s.total}点</span></div>)}</div>; }
    if (phase === "ENDING") { title="ENDING"; body=<h2 className="ending-title">{reveal?.ending?endingText[reveal.ending]:""}</h2>; }
    center=<div className="center-message"><div className="eyebrow">REVEAL</div><h1>{title}</h1>{body}<button className="primary-button" disabled={readySent} onClick={phaseReady}>{readySent?"待機中":"次へ"}</button></div>;
  }

  return <div className="pon-game">
    {connectionState !== "CONNECTED" && <div className="reconnect-overlay" role="status" aria-live="assertive">
      <div className="reconnect-card">
        <div className="reconnect-spinner" aria-hidden="true">↻</div>
        <h2>{connectionState === "OFFLINE" ? "ネットワークがオフラインです" : "再接続しています"}</h2>
        <p>画面はそのままで大丈夫です。接続が戻ると最新状態を自動で復元します。</p>
        <button type="button" className="secondary-button" onClick={onReenter}>部屋に入り直す</button>
      </div>
    </div>}
    <nav className="mobile-game-tabs" aria-label="ゲーム画面切り替え">
      <button type="button" className={mobilePanel==="MAIN"?"active":""} aria-pressed={mobilePanel==="MAIN"} onClick={()=>setMobilePanel("MAIN")}>プレイ</button>
      <button type="button" className={mobilePanel==="PRIVATE"?"active":""} aria-pressed={mobilePanel==="PRIVATE"} onClick={()=>setMobilePanel("PRIVATE")}>自分</button>
      <button type="button" className={mobilePanel==="PUBLIC"?"active":""} aria-pressed={mobilePanel==="PUBLIC"} onClick={()=>setMobilePanel("PUBLIC")}>公開情報</button>
    </nav>
    <aside className={`game-private mobile-game-panel ${mobilePanel==="PRIVATE"?"mobile-active":""}`}><div className="eyebrow">YOUR INFO</div><h3>ミッション</h3><p>{missionText(me.displayedMission)}</p><h3>{me.personality.displayName}</h3><p>{personalityText(me.personality)}</p><h3>残り手札</h3><div className="mini-cards">{me.remainingCards.map(c=><span key={c.id} className={colorClass[c.color]}><span aria-hidden="true">{colorIcon[c.color]} </span>{colorLabel[c.color]}{c.number}</span>)}</div><h3>使用済みカード</h3><PlayedCardHistory playedCards={me.playedCards}/></aside>
    <section className={`game-main mobile-game-panel ${mobilePanel==="MAIN"?"mobile-active":""}`}>{center}</section>
    <aside className={`game-public mobile-game-panel ${mobilePanel==="PUBLIC"?"mobile-active":""}`}><Summary summary={game.publicState.summary}/></aside>
  </div>;
}
