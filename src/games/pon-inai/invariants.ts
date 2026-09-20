import type { PonInaiGameState } from "./game-state";

export function assertGameInvariants(state: PonInaiGameState): void {
  if (state.players.length !== state.playerCount) throw new Error("Player count mismatch");
  if (new Set(state.players).size !== state.players.length) throw new Error("Duplicate player ID");
  const allInitialCards = [...state.playerStates.values()].flatMap((p) => p.initialHand);
  if (new Set(allInitialCards.map((c) => c.id)).size !== allInitialCards.length) throw new Error("Duplicate dealt card");

  for (const playerId of state.players) {
    const player = state.playerStates.get(playerId);
    if (!player) throw new Error(`Missing player state: ${playerId}`);
    if (player.initialHand.length !== 6) throw new Error("Initial hand must have 6 cards");
    if (player.playedCards.length + player.remainingCards.length !== 6) throw new Error("Card conservation failed");
    if (player.confidenceHistory.length !== player.playedCards.length) throw new Error("Confidence history mismatch");
  }

  if (state.rounds.length > 4) throw new Error("Too many rounds");
  if (state.scoring) {
    for (const score of state.scoring.players) {
      if (score.total < 0 || score.total > 7) throw new Error("Score outside 0..7");
    }
  }
}
