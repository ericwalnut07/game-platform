import type { TrialVerdict } from "./game-state";
import type { PlayerId } from "./types";

export type VerdictAccuracy = "CORRECT" | "WRONG" | "UNDECIDED";

export type EndingId =
  | "SPADARI_DAWAN"
  | "PON_JANAI_DAWAN"
  | "KIMEKIRENAKATTA_DAWAN"
  | "DOTCHIMO_DOTCHI_DAWAN"
  | "PON_NI_FURIMAWASARETA_DAWAN"
  | "MOU_WAKARANAI_DAWAN"
  | "MINNA_WO_SHINJIKIRENAKATTA_DAWAN"
  | "PON_WA_INAKATTA_DAWAN"
  | "ZENIN_PON";

export const ENDING_TITLES: Readonly<Record<EndingId, string>> = {
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

export function getVerdictAccuracy(hasPon: boolean, ponPlayerId: PlayerId | undefined, verdict: TrialVerdict): VerdictAccuracy {
  if (verdict.type === "UNDECIDED") return "UNDECIDED";
  if (hasPon) return verdict.type === "PLAYER" && verdict.playerId === ponPlayerId ? "CORRECT" : "WRONG";
  return verdict.type === "NO_PON" ? "CORRECT" : "WRONG";
}

export function determineEnding(hasPon: boolean, missionSuccess: boolean, accuracy: VerdictAccuracy): EndingId {
  if (hasPon) {
    if (missionSuccess) {
      if (accuracy === "CORRECT") return "SPADARI_DAWAN";
      if (accuracy === "WRONG") return "PON_JANAI_DAWAN";
      return "KIMEKIRENAKATTA_DAWAN";
    }
    if (accuracy === "CORRECT") return "DOTCHIMO_DOTCHI_DAWAN";
    if (accuracy === "WRONG") return "PON_NI_FURIMAWASARETA_DAWAN";
    return "MOU_WAKARANAI_DAWAN";
  }

  if (missionSuccess) {
    if (accuracy === "CORRECT") return "SPADARI_DAWAN";
    if (accuracy === "WRONG") return "MINNA_WO_SHINJIKIRENAKATTA_DAWAN";
    return "KIMEKIRENAKATTA_DAWAN";
  }
  if (accuracy === "CORRECT") return "PON_WA_INAKATTA_DAWAN";
  if (accuracy === "WRONG") return "ZENIN_PON";
  return "MOU_WAKARANAI_DAWAN";
}
