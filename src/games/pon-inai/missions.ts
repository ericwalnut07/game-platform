import { CARD_NUMBERS, getActiveColors, type CardNumber, type Color, type PlayerCount, type PublicSummary } from "./types";

export type MissionCategory = "NUMBER" | "COLOR" | "COLOR_NUMBER" | "ROUND_PROGRESS";

export interface AverageOutputMission {
  type: "AVERAGE_OUTPUT";
  min: 2.4;
  max: 2.6;
}

export interface HighLowBalanceMission {
  type: "HIGH_LOW_BALANCE";
}

export interface TargetNumberMission {
  type: "TARGET_NUMBER";
  number: CardNumber;
  minimumCount: 4 | 5;
}

export interface AllNumbersMission {
  type: "ALL_NUMBERS";
  minimumEach: 2 | 3;
}

export interface PushColorMission {
  type: "PUSH_COLOR";
  color: Color;
  minimumCount: 5;
}

export interface RainbowMission {
  type: "RAINBOW";
  minimumEach: 3;
}

export interface ColorBalanceMission {
  type: "COLOR_BALANCE";
  maxDifference: 2;
}

export interface ColorSyncMission {
  type: "COLOR_SYNC";
  minimumSynchronizedRounds: 1;
}

export interface ColorOutputMission {
  type: "COLOR_OUTPUT";
  color: Color;
  minSum: 9;
  maxSum: 11;
}

export interface ColorCompleteMission {
  type: "COLOR_COMPLETE";
  color: Color;
}

export interface NumberCrossMission {
  type: "NUMBER_CROSS";
  number: CardNumber;
}

export interface RouteCodePair {
  color: Color;
  number: CardNumber;
}

export interface RouteCodeMission {
  type: "ROUTE_CODE";
  pairs: readonly [RouteCodePair, RouteCodePair, RouteCodePair, RouteCodePair];
}

export interface OutputRiseMission {
  type: "OUTPUT_RISE";
  minimumIncreasingTransitions: 2;
}

export interface StableNavigationMission {
  type: "STABLE_NAVIGATION";
  maxRange: 3 | 4;
}

export interface ColorRotationMission {
  type: "COLOR_ROTATION";
  minimumChanges: 2;
}

export type Mission =
  | AverageOutputMission
  | HighLowBalanceMission
  | TargetNumberMission
  | AllNumbersMission
  | PushColorMission
  | RainbowMission
  | ColorBalanceMission
  | ColorSyncMission
  | ColorOutputMission
  | ColorCompleteMission
  | NumberCrossMission
  | RouteCodeMission
  | OutputRiseMission
  | StableNavigationMission
  | ColorRotationMission;

export function getMissionCategory(mission: Mission): MissionCategory {
  switch (mission.type) {
    case "AVERAGE_OUTPUT":
    case "HIGH_LOW_BALANCE":
    case "TARGET_NUMBER":
    case "ALL_NUMBERS":
      return "NUMBER";
    case "PUSH_COLOR":
    case "RAINBOW":
    case "COLOR_BALANCE":
    case "COLOR_SYNC":
      return "COLOR";
    case "COLOR_OUTPUT":
    case "COLOR_COMPLETE":
    case "NUMBER_CROSS":
    case "ROUTE_CODE":
      return "COLOR_NUMBER";
    case "OUTPUT_RISE":
    case "STABLE_NAVIGATION":
    case "COLOR_ROTATION":
      return "ROUND_PROGRESS";
  }
}

export interface MissionEvaluationContext {
  playerCount: PlayerCount;
  summary: PublicSummary;
}

function allPlayedCards(summary: PublicSummary) {
  return summary.completedRounds.flatMap((round) => round.players.map((p) => p.card));
}

export function evaluateMission(mission: Mission, context: MissionEvaluationContext): boolean {
  const { playerCount, summary } = context;
  const activeColors = getActiveColors(playerCount);

  switch (mission.type) {
    case "AVERAGE_OUTPUT":
      return summary.totalPlayedCards > 0
        && summary.totalNumberAverage >= mission.min
        && summary.totalNumberAverage <= mission.max;

    case "HIGH_LOW_BALANCE": {
      const low = summary.numberCounts[1] + summary.numberCounts[2];
      const high = summary.numberCounts[3] + summary.numberCounts[4];
      return low === high;
    }

    case "TARGET_NUMBER":
      return summary.numberCounts[mission.number] >= mission.minimumCount;

    case "ALL_NUMBERS":
      return CARD_NUMBERS.every((number) => summary.numberCounts[number] >= mission.minimumEach);

    case "PUSH_COLOR":
      return summary.colorCounts[mission.color] >= mission.minimumCount;

    case "RAINBOW":
      return activeColors.every((color) => summary.colorCounts[color] >= mission.minimumEach);

    case "COLOR_BALANCE": {
      const counts = activeColors.map((color) => summary.colorCounts[color]);
      return Math.max(...counts) - Math.min(...counts) <= mission.maxDifference;
    }

    case "COLOR_SYNC": {
      const synchronizedRounds = summary.completedRounds.filter((round) => {
        const colors = new Set(round.players.map((result) => result.card.color));
        return round.players.length === playerCount && colors.size === 1;
      }).length;
      return synchronizedRounds >= mission.minimumSynchronizedRounds;
    }

    case "COLOR_OUTPUT": {
      const sum = summary.colorNumberSums[mission.color];
      return sum >= mission.minSum && sum <= mission.maxSum;
    }

    case "COLOR_COMPLETE": {
      const seen = new Set(
        allPlayedCards(summary)
          .filter((card) => card.color === mission.color)
          .map((card) => card.number)
      );
      return CARD_NUMBERS.every((number) => seen.has(number));
    }

    case "NUMBER_CROSS": {
      const seenColors = new Set(
        allPlayedCards(summary)
          .filter((card) => card.number === mission.number)
          .map((card) => card.color)
      );
      return activeColors.every((color) => seenColors.has(color));
    }

    case "ROUTE_CODE": {
      const played = new Set(allPlayedCards(summary).map((card) => `${card.color}:${card.number}`));
      return mission.pairs.every((pair) => played.has(`${pair.color}:${pair.number}`));
    }

    case "OUTPUT_RISE": {
      const sums = summary.roundNumberSums;
      let increases = 0;
      for (let i = 1; i < sums.length; i += 1) {
        if (sums[i]! > sums[i - 1]!) increases += 1;
      }
      return increases >= mission.minimumIncreasingTransitions;
    }

    case "STABLE_NAVIGATION": {
      if (summary.roundNumberSums.length === 0) return false;
      return Math.max(...summary.roundNumberSums) - Math.min(...summary.roundNumberSums) <= mission.maxRange;
    }

    case "COLOR_ROTATION": {
      const colors = summary.uniqueTopColorHistory;
      let changes = 0;
      for (let i = 1; i < colors.length; i += 1) {
        const previous = colors[i - 1];
        const current = colors[i];
        if (previous !== null && current !== null && previous !== current) changes += 1;
      }
      return changes >= mission.minimumChanges;
    }
  }
}

export function createDefaultMission(type: Mission["type"], playerCount: PlayerCount): Mission {
  switch (type) {
    case "AVERAGE_OUTPUT": return { type, min: 2.4, max: 2.6 };
    case "HIGH_LOW_BALANCE": return { type };
    case "TARGET_NUMBER": return { type, number: 1, minimumCount: playerCount === 3 ? 4 : 5 };
    case "ALL_NUMBERS": return { type, minimumEach: playerCount === 3 ? 2 : 3 };
    case "PUSH_COLOR": return { type, color: "RED", minimumCount: 5 };
    case "RAINBOW": return { type, minimumEach: 3 };
    case "COLOR_BALANCE": return { type, maxDifference: 2 };
    case "COLOR_SYNC": return { type, minimumSynchronizedRounds: 1 };
    case "COLOR_OUTPUT": return { type, color: "RED", minSum: 9, maxSum: 11 };
    case "COLOR_COMPLETE": return { type, color: "RED" };
    case "NUMBER_CROSS": return { type, number: 1 };
    case "ROUTE_CODE": {
      const colors = getActiveColors(playerCount);
      const pairs = CARD_NUMBERS.map((number, index) => ({
        color: colors[index % colors.length]!,
        number
      })) as unknown as readonly [RouteCodePair, RouteCodePair, RouteCodePair, RouteCodePair];
      return { type, pairs };
    }
    case "OUTPUT_RISE": return { type, minimumIncreasingTransitions: 2 };
    case "STABLE_NAVIGATION": return { type, maxRange: playerCount };
    case "COLOR_ROTATION": return { type, minimumChanges: 2 };
  }
}
