import { BUILDING_NAMES, DISTRICTS, OPPORTUNITIES, ROUTE_EDGES } from "../../../games/commercial-hub/data";
import type { Building, Resources, TradeBundle } from "../../../games/commercial-hub/types";

export const RESOURCE_NAMES = { materials: "資材", goods: "商品", cash: "資金", influence: "影響力" } as const;
export const PLAYER_COLORS = ["#76d6c8", "#ffbe70", "#bcacff", "#f88fad"];
export const districtName = (id: string) => DISTRICTS.find((d) => d.id === id)?.name ?? id;
export const opportunityName = (id: string) => OPPORTUNITIES.find((o) => o.id === id)?.name ?? id;
export const buildingName = (b: Building) => BUILDING_NAMES[b.suit][b.upgraded ? 1 : 0];
export function resourceText(resources: Partial<Resources | TradeBundle>): string {
  return Object.entries(resources).filter(([, n]) => n > 0).map(([key, n]) => `${RESOURCE_NAMES[key as keyof Resources]}${n}`).join(" ＋ ") || "支払いなし";
}
export function routeName(id: string): string {
  const edge = ROUTE_EDGES.find((e) => e.id === id);
  return edge ? `${id} ${districtName(edge.from)} — ${districtName(edge.to)}` : id;
}
export const BONUSES: Record<string, string> = {
  MARKET: "次ラウンド開始時：資金1", WORKSHOP: "次ラウンド開始時：商品1", WAREHOUSE: "次ラウンド開始時：敷設クレジット1", GOV: "次ラウンド開始時：影響力1",
  BUSINESS: "次ラウンド以降に1回：商品1を資金3で販売", INDUSTRIAL: "次ラウンド以降の生産1回：商品+1",
  PORT: "次ラウンド開始時：自社網が接続済みなら資金1、未接続なら敷設クレジット1", NEW_TOWN: "次ラウンド以降の建設1回：資金コスト-1"
};
export const ABILITIES: Record<string, readonly [string, string]> = {
  commerce: ["1R1回：商品1 → 資金2", "1R1回：商品を0〜2個、1個につき資金2で販売"],
  industry: ["1R1回：資材1 → 商品2", "1R1回：資材1 → 商品3＋資金1"],
  logistics: ["1R：輸送料を合計1軽減", "1R：輸送料を合計1軽減 ＋ 敷設の資金-1を1回"],
  civic: ["収入時：影響力1", "収入時：影響力1 ＋ 影響力支払い-1を1回/R"]
};
export const REWARDS: Record<string, string> = {
  sales: "1位：商品を最大2個、2位：最大1個販売。商品1につき資金2。",
  funding: "資金：1位4 / 2位2", materials: "資材：1位3 / 2位1", production: "商品：1位2 / 2位1",
  transport: "輸送クレジット：1位2 / 2位1。繰越可。", routes: "敷設クレジット：1位2 / 2位1。繰越可。",
  development: "影響力：1位2 / 2位1", "public-project": "1位：公開中の公共事業に無料で1枠貢献（案件なしなら影響力2）。2位：影響力1。"
};
