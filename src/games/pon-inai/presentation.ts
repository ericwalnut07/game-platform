import type { Mission } from "./missions";
import type { Personality } from "./personalities";
import type { Color, Confidence } from "./types";
import type { EndingId } from "./endings";

export const colorLabel: Record<Color, string> = { RED: "赤", BLUE: "青", GREEN: "緑", YELLOW: "黄" };
export const confidenceLabel: Record<Confidence, string> = { CONFIDENT: "自信あり", NORMAL: "まあまあ", ANXIOUS: "不安" };

export function missionText(mission: Mission): string {
  switch (mission.type) {
    case "AVERAGE_OUTPUT": return `全カードの平均値を${mission.min}〜${mission.max}にする`;
    case "HIGH_LOW_BALANCE": return "1・2のカード数と3・4のカード数を同数にする";
    case "TARGET_NUMBER": return `数字${mission.number}を${mission.minimumCount}枚以上使う`;
    case "ALL_NUMBERS": return `1〜4をそれぞれ${mission.minimumEach}枚以上使う`;
    case "PUSH_COLOR": return `${colorLabel[mission.color]}を${mission.minimumCount}枚以上使う`;
    case "RAINBOW": return `すべての色をそれぞれ${mission.minimumEach}枚以上使う`;
    case "COLOR_BALANCE": return `色の最多枚数と最少枚数の差を${mission.maxDifference}以内にする`;
    case "COLOR_SYNC": return "4ラウンド中1回以上、全員が同じ色を出す";
    case "COLOR_OUTPUT": return `${colorLabel[mission.color]}カードの数字合計を${mission.minSum}〜${mission.maxSum}にする`;
    case "COLOR_COMPLETE": return `${colorLabel[mission.color]}の1・2・3・4をすべて使う`;
    case "NUMBER_CROSS": return `数字${mission.number}をすべての色で使う`;
    case "ROUTE_CODE": return `航路コード：${mission.pairs.map((p) => `${colorLabel[p.color]}${p.number}`).join(" / ")} をすべて使う`;
    case "OUTPUT_RISE": return `ラウンド合計値を、3回の変化のうち${mission.minimumIncreasingTransitions}回以上上昇させる`;
    case "STABLE_NAVIGATION": return `ラウンド合計値の最大−最小を${mission.maxRange}以内にする`;
    case "COLOR_ROTATION": return `単独最多色を前ラウンドから${mission.minimumChanges}回以上変える`;
  }
}

export function personalityText(personality: Personality): string {
  switch (personality.type) {
    case "AVOID_COLOR": return `${colorLabel[personality.color]}を1枚も使わない`;
    case "USE_COLOR_TWICE": return `${colorLabel[personality.color]}を${personality.minimumUses}回以上使う`;
    case "USE_ALL_COLORS": return "使用可能なすべての色を使う";
    case "AVOID_NUMBER": return `数字${personality.number}を1枚も使わない`;
    case "USE_TWO_NUMBERS": return `数字${personality.numbers[0]}・${personality.numbers[1]}を合計${personality.minimumUses}回以上使う`;
    case "KEEP_COLOR": return `${colorLabel[personality.color]}を終了時の手札に1枚以上残す`;
    case "PLANNER": return "残り2枚を、異なる色・異なる数字・数字合計5にする";
    case "CONFIDENT": return `「自信あり」を${personality.minimumConfident}回以上選ぶ`;
    case "WORRIER": return `「不安」を${personality.minimumAnxious}回以上選ぶ`;
    case "BRAVE": return "「不安」を一度も選ばない";
    case "MOODY": return "3種類の自信度をすべて使い、「まあまあ」を2回以上選ぶ";
  }
}

export const endingText: Record<EndingId, string> = {
  SPADARI_DAWAN: "スパダリだわん！",
  PON_JANAI_DAWAN: "ポンじゃないわん！",
  KIMEKIRENAKATTA_DAWAN: "決めきれなかったわん！",
  DOTCHIMO_DOTCHI_DAWAN: "どっちもどっちだわん！",
  PON_NI_FURIMAWASARETA_DAWAN: "ポンに振り回されたわん！",
  MOU_WAKARANAI_DAWAN: "もうわからないわん！",
  MINNA_WO_SHINJIKIRENAKATTA_DAWAN: "みんなを信じきれなかったわん",
  PON_WA_INAKATTA_DAWAN: "ポンはいなかったわん…",
  ZENIN_PON: "全員ポン！"
};
