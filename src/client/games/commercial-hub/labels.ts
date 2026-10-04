import { BUILDING_NAMES, DISTRICTS } from "../../../games/commercial-hub/data";
import type { HubEvent, RankedCompany } from "../../../games/commercial-hub/state";
import type { Building, Resources, Suit } from "../../../games/commercial-hub/types";
export const PLAYER_COLORS = ["#d45070", "#386bb8", "#aa761d", "#8055ac"];
export const SUIT_COLORS: Record<Suit | "common", string> = { commerce: "#258054", industry: "#be6418", procurement: "#2567ac", administration: "#8452a3", common: "#566475" };
export const RESOURCE_NAMES = { materials: "資材", goods: "商品", cash: "資金" };
export const PHASE_NAMES = { ROUND_START: "商機の確認", BID: "ビッド宣言", TRICK: "商機トリック", REWARD: "商機報酬", TRICK_RESULT: "トリック結果", BID_RESULT: "ビッド結果", AUDITOR_PLACEMENT: "監査官の配置", PROCUREMENT: "仕入", PRODUCTION: "生産・販売", INVESTMENT: "投資", ROUND_END: "ラウンド精算", FINISHED: "最終結果" };
export const ABILITIES = { industry: ["資材1 → 商品2", "資材1 → 商品3"], commerce: ["商品1 → 資金3", "商品2 → 資金6（少量：商品1 → 資金3）"], procurement: ["資金1 → 資材1（各建物1回/R・通常輸送費）", "資金2 → 資材2（少量：資金1 → 資材1・各建物1回/R）"] };
export function buildingName(b: Building): string { return BUILDING_NAMES[b.suit][b.upgraded ? 1 : 0]; }
export function districtName(id: string): string { return DISTRICTS.find((d) => d.id === id)?.name ?? id; }
export function resourceText(r: Resources): string { return (Object.keys(RESOURCE_NAMES) as (keyof Resources)[]).filter((k) => r[k] !== 0).map((k) => `${RESOURCE_NAMES[k]}${r[k]}`).join("＋") || "支払いなし"; }
export function accessName(access: string, name: (id: string) => string): string { return access === "OWN" ? "自社輸送路" : access === "PUBLIC" ? "公共輸送" : `${name(access)}の輸送路`; }
export const TIE_NAMES: Record<RankedCompany["tieBreak"], string> = { DEFICIT: "赤字の有無", VALUE: "企業価値", ASSETS: "事業資産点", BUILDINGS: "建物点", PROJECTS: "公共事業点", TIED: "同順位" };
export function eventText(e: HubEvent, name: (id: string) => string): string {
  const who = e.playerId ? name(e.playerId) : "", d = e.data;
  switch (e.type) {
    case "ROUND_STARTED": return `ラウンド${e.round} 開始`;
    case "BID_SUBMITTED": return `${who}がビッドを確定（全員確定まで非公開）`;
    case "BIDS_REVEALED": return `ビッド一斉公開：${Object.entries(d.bids as Record<string, number>).map(([p, n]) => `${name(p)} ${n}勝`).join(" / ")}`;
    case "BID_RESULT": return `予測結果：${(d.results as { playerId: string; declared: number; wins: number; hit: boolean }[]).map((r) => `${name(r.playerId)} 宣言${r.declared}／実績${r.wins} ${r.hit ? "的中＋1点" : "0点"}`).join(" / ")}`;
    case "AUDITOR_RIGHT": return `${who}が監査官の配置権を獲得`;
    case "AUDITOR_PLACED": return `${who}が監査官を${d.target === "PUBLIC_PROJECTS" ? "公共事業全体" : districtName(String(d.target))}へ配置。追加資金＋1`;
    case "CARD_PLAYED": return `${who}がカードをプレイ`;
    case "TRICK_RESULT": return `トリック${Number(d.index) + 1} 確定：${(d.ranking as string[]).map(name).join(" → ")}`;
    case "OPPORTUNITY_REWARD": return `${who} 商機${d.rewardPlace}位報酬${resourceText(d.resources as Resources) !== "支払いなし" ? `：${resourceText(d.resources as Resources)}` : ""}`;
    case "DIRECT_REWARD": return `${who}が商機を使用：${resourceText(d.cost as Resources)} → ${resourceText(d.reward as Resources)}`;
    case "MARKET": return `${who}が${d.action === "dispose-good" ? "在庫処分" : "公共市場で資材購入"}：${resourceText(d.cost as Resources)} → ${resourceText(d.reward as Resources)}`;
    case "TRADE_ACCEPTED": return `${who}と${name(String(d.counterpart))}の交渉成立：${resourceText(d.give as Resources)} ↔ ${resourceText(d.receive as Resources)}`;
    case "BUILDING_USED": return `${who}が建物を使用：${resourceText(d.cost as Resources)} → ${resourceText(d.reward as Resources)}${Number(d.bonus) > 0 ? `（商機＋${d.bonus}）` : ""}`;
    case "BUILD": return `${who}が${districtName(String(d.district))}へ建物を建設`;
    case "UPGRADE": return `${who}が建物を上位化`;
    case "ROUTE": return `${who}が${districtName(String(d.district))}へ輸送路を敷設`;
    case "CONTRIBUTE": return `${who}が公共事業へ1枠拠出`;
    case "PROJECT_REVEALED": return `${d.name}が公開`;
    case "PROJECT_COMPLETED": return `${({ market: "中央市場", station: "中央駅", "city-hall": "市庁舎", "logistics-port": "物流港", "industrial-institute": "産業研究所" } as Record<string, string>)[String(d.projectId)]}が完成・拠出分の資金を還元`;
    case "ROUND_SETTLED": return `ラウンド${e.round} 輸送費を精算・都市Lv${d.levelAfter}`;
    case "BOT_STARTED": return `${who}がBOT代行へ移行`;
    case "PLAYER_RETURNED": return `${who}のプレイヤーが復帰`;
    case "INVESTMENT_PASSED": return `${who}が投資をパス`;
    case "GAME_FINISHED": return "最終精算と順位が確定";
    default: return e.type;
  }
}
