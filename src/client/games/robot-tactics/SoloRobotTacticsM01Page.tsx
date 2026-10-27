import { navigate } from "../../lib/router";

export default function SoloRobotTacticsM01Page() {
  return <section className="panel wide">
    <button type="button" className="text-button" onClick={() => navigate("/solo")}>← 1人で遊ぶ</button>
    <h1>ロボット戦術｜M01試遊</h1>
    <p>Easy・Normal・Hardの3難易度を推奨コアLvで試せます。初期4フレーム、初期18パーツだけで3機を編成してください。</p>
    <p>同じ9×9マップ、8ラウンド、敵3機の殲滅目標で、敵の能力と判断方針が難易度によって変わります。</p>
    <p className="muted-copy">試遊版は単独ページで開きます。育成EXP・戦績のサーバー保存は行われません。</p>
    <div className="lobby-actions">
      <button className="primary-button" type="button" onClick={() => window.location.assign("/robot-tactics-m01.html")}>試遊を開始</button>
      <button className="secondary-button" type="button" onClick={() => navigate("/solo")}>ゲーム一覧へ戻る</button>
    </div>
  </section>;
}
