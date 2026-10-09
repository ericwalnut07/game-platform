import { BUILDING_NAMES, DISTRICTS, SUIT_NAMES } from "../../../games/commercial-hub/data";
import type { HubEvent, RankedCompany } from "../../../games/commercial-hub/state";
import type { Building, Resources, Suit } from "../../../games/commercial-hub/types";
import { MAJOR_LABELS } from "../../../games/commercial-hub/next-rules";
export const PLAYER_COLORS = ["#d45070", "#386bb8", "#aa761d", "#8055ac"];
export const SUIT_COLORS: Record<Suit | "common", string> = { commerce: "#258054", industry: "#be6418", procurement: "#2567ac", administration: "#8452a3", common: "#566475" };
export const RESOURCE_NAMES = { materials: "資材", goods: "商品", cash: "資金" };
export const PHASE_NAMES = { MAJOR_SELECTION: "大型投資の対象指定", ROUND_START: "商機の確認", BID: "ビッド宣言", TRICK: "商機トリック", REWARD: "商機報酬", TRICK_RESULT: "トリック結果", BID_RESULT: "ビッド結果", AUDITOR_PLACEMENT: "監査官の配置", PROCUREMENT: "仕入", PRODUCTION: "生産・販売", INVESTMENT: "投資", ROUND_END: "ラウンド精算", FINISHED: "最終結果" };
export const ABILITIES = { industry: ["資材1 → 商品2", "資材1 → 商品3"], commerce: ["商品1 → 資金3", "商品2 → 資金6（少量：商品1 → 資金3）"], procurement: ["資金1 → 資材2（各建物1回/R・通常輸送費）", "資金2 → 資材3（少量：資金1 → 資材2・各建物1回/R）"] };
export function buildingName(b: Building): string { return BUILDING_NAMES[b.suit][b.upgraded ? 1 : 0]; }
export function districtName(id: string): string { return DISTRICTS.find((d) => d.id === id)?.name ?? id; }
export function resourceText(r: Resources): string { return (Object.keys(RESOURCE_NAMES) as (keyof Resources)[]).filter((k) => r[k] !== 0).map((k) => `${RESOURCE_NAMES[k]}${r[k]}`).join("＋") || "支払いなし"; }
export function accessName(access: string, name: (id: string) => string, trial = false): string { return access === "OWN" ? "自社輸送路" : access === "PUBLIC" ? "公共輸送" : `${name(access)}の輸送路`; }
export const TIE_NAMES: Record<RankedCompany["tieBreak"], string> = { DEFICIT: "赤字の有無", VALUE: "企業価値", ASSETS: "事業資産点", BUILDINGS: "建物点", PROJECTS: "公共事業点", TIED: "同順位" };
export function eventText(e: HubEvent, name: (id: string) => string, trial = false): string {
  const who = e.playerId ? name(e.playerId) : "", d = e.data;
  switch (e.type) {
    case "ROUND_STARTED": return `ラウンド${e.round} 開始`;
    case "BID_SUBMITTED": return `${who}がビッドを確定（全員確定まで非公開）`;
    case "BIDS_REVEALED": return `ビッド一斉公開：${Object.entries(d.bids as Record<string, number>).map(([p, n]) => `${name(p)} ${n}勝`).join(" / ")}`;
    case "BID_RESULT": return `予測結果：${(d.results as { playerId: string; declared: number; wins: number; hit: boolean }[]).map((r) => `${name(r.playerId)} 宣言${r.declared}／実績${r.wins} ${r.hit ? "的中＋1点" : "0点"}`).join(" / ")}`;
    case "AUDITOR_RIGHT": return `${who}が監査官の配置権を獲得`;
    case "AUDITOR_PLACED": return `${who}が監査官を${d.target === "PUBLIC_PROJECTS" ? "公共事業全体" : `${SUIT_NAMES[d.target as Suit]}系統（2地区）`}へ配置。追加資金＋1`;
    case "CARD_PLAYED": return `${who}がカードをプレイ`;
    case "TRICK_RESULT": return `トリック${Number(d.index) + 1} 確定：${(d.ranking as string[]).map(name).join(" → ")}`;
    case "OPPORTUNITY_REWARD": return `${who} 商機${d.rewardPlace}位報酬${resourceText(d.resources as Resources) !== "支払いなし" ? `：${resourceText(d.resources as Resources)}` : ""}`;
    case "DIRECT_REWARD": return `${who}が商機を使用：${resourceText(d.cost as Resources)} → ${resourceText(d.reward as Resources)}`;
    case "MARKET": return `${who}が${d.action !== "buy-material" ? "在庫処分" : "公共市場で資材購入"}：${resourceText(d.cost as Resources)} → ${resourceText(d.reward as Resources)}`;
    case "TRADE_ACCEPTED": return `${who}と${name(String(d.counterpart))}の交渉成立：${resourceText(d.give as Resources)} ↔ ${resourceText(d.receive as Resources)}`;
    case "BUILDING_USED": return `${who}が建物を使用：${resourceText(d.cost as Resources)} → ${resourceText(d.reward as Resources)}${Number(d.bonus) > 0 ? `（商機＋${d.bonus}）` : ""}`;
    case "BUILD": return `${who}が${districtName(String(d.district))}へ建物を建設`;
    case "UPGRADE": return `${who}が建物を上位化`;
    case "ROUTE": return `${who}が${districtName(String(d.district))}へ輸送路を敷設`;
    case "CONTRIBUTE": return `${who}が公共事業へ1枠拠出`;
    case "PROJECT_REVEALED": return `${d.name ?? projectLabel(String(d.projectId), trial)}を解放（R${d.availableRound ?? e.round}から）`;
    case "PROJECT_COMPLETED": return `${projectLabel(String(d.projectId), trial)}が完成・都市発展＋5（資金還元なし）`;
    case "MAJOR_PURCHASED": return `${who}が${majorLabel(d.cardId)}を資金${d.price}で購入。R${d.activeRound}発動${d.suit ? `・${SUIT_NAMES[d.suit as Suit]}` : ""}`;
    case "MAJOR_ACTIVATED": return `${who}の${majorLabel(d.cardId)}が有効化`;
    case "MAJOR_FIRED": return `${who}の${majorLabel(d.cardId)}が発動・使用済み`;
    case "MAJOR_FIZZLED": return `${who}の${majorLabel(d.cardId)}が今回不発（合法対象なし）`;
    case "MAJOR_TARGET_SELECTED": return `${who}の${majorLabel(d.cardId)}：${d.projectId ? projectLabel(String(d.projectId), trial) : d.district ? districtName(String(d.district)) : `建物${d.buildingId}`}を指定${d.slot === undefined ? "" : `・枠${Number(d.slot) + 1}`}`;
    case "SUBSIDY_RECEIVED": return `${who}が奨励金を受領：能力使用${d.uses}回・資金${d.uses}`;
    case "AUDIT_RECEIVED": return `${who}が${name(String(d.payer))}から監査費・資金${d.amount}を受領`;
    case "ROUTES_BLOCKED": return `${who}の規制：${(d.targets as string[]).map(name).join(" / ") || "対象なし"}の路線を今R封鎖`;
    case "ROUND_SETTLED": return `ラウンド${e.round} 輸送費を精算・都市Lv${d.levelAfter}`;
    case "BOT_STARTED": return `${who}がBOT代行へ移行`;
    case "PLAYER_RETURNED": return `${who}のプレイヤーが復帰`;
    case "INVESTMENT_PASSED": return `${who}が投資をパス`;
    case "GAME_FINISHED": return "最終精算と順位が確定";
    default: return e.type;
  }
}
function majorLabel(id: unknown) { return MAJOR_LABELS[String(id)]?.[0] ?? String(id); }
function projectLabel(id: string, trial = false) { return ({ market: "中央市場", station: "中央駅", "city-hall": trial ? "中央庁舎" : "市庁舎", "central-tower": "中央タワー", "central-stadium": "中央スタジアム", "logistics-port": "物流港", "industrial-institute": "産業研究所" } as Record<string,string>)[id] ?? id; }

