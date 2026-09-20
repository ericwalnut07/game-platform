import type { Card, CardNumber, Color, PlayerCount, PlayerId } from "./types";
import { CARD_NUMBERS, getActiveColors } from "./types";
import type { RandomSource } from "./random";

export interface DealResult {
  hands: ReadonlyMap<PlayerId, readonly Card[]>;
}

function baseCard(color: Color, number: CardNumber): Card {
  return {
    id: `${color}-${number}-C1`,
    color,
    number,
    copy: 1
  };
}

function extraCard(color: Color, number: CardNumber): Card {
  return {
    id: `${color}-${number}-C2`,
    color,
    number,
    copy: 2
  };
}

function makeBalancedBaseHands(
  players: readonly PlayerId[],
  playerCount: PlayerCount,
  rng: RandomSource
): Map<PlayerId, Card[]> {
  const colors = rng.shuffle(getActiveColors(playerCount));
  const logicalPlayers = rng.shuffle(players);
  const hands = new Map<PlayerId, Card[]>(players.map((id) => [id, []]));

  // Latin-square style assignment:
  // - every player receives numbers 1,2,3,4 exactly once;
  // - for each number, each active color is used exactly once across players;
  // - 4p: each player receives all 4 colors exactly once;
  // - 3p: each player receives all 3 colors, with one color repeated.
  // Random color/player permutations and direction keep the matching varied
  // without relying on retry-until-valid generation.
  const step = playerCount === 3
    ? (rng.next() < 0.5 ? 1 : 2)
    : (rng.next() < 0.5 ? 1 : 3);
  const offset = rng.integer(0, playerCount - 1);

  CARD_NUMBERS.forEach((number, numberIndex) => {
    logicalPlayers.forEach((playerId, playerIndex) => {
      const colorIndex = (playerIndex + offset + numberIndex * step) % playerCount;
      hands.get(playerId)!.push(baseCard(colors[colorIndex]!, number));
    });
  });

  return hands;
}

export function dealHands(
  players: readonly PlayerId[],
  playerCount: PlayerCount,
  rng: RandomSource
): DealResult {
  if (players.length !== playerCount) {
    throw new Error(`Expected ${playerCount} players, received ${players.length}`);
  }
  if (new Set(players).size !== players.length) {
    throw new Error("Player IDs must be unique");
  }

  const hands = makeBalancedBaseHands(players, playerCount, rng);

  const extraPool = getActiveColors(playerCount).flatMap((color) =>
    CARD_NUMBERS.map((number) => extraCard(color, number))
  );
  const shuffledExtras = rng.shuffle(extraPool);

  let cursor = 0;
  for (const playerId of players) {
    const hand = hands.get(playerId)!;
    hand.push(shuffledExtras[cursor]!, shuffledExtras[cursor + 1]!);
    cursor += 2;
  }

  for (const playerId of players) {
    hands.set(playerId, rng.shuffle(hands.get(playerId)!));
  }

  return { hands };
}
