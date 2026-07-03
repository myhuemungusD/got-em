const MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: "Room not found",
  GAME_OVER: "Game is over",
  ALREADY_STARTED: "Game already started",
  SLOT_TAKEN: "That seat was just taken",
  BAD_SLOT: "Invalid seat",
  NOT_HOST: "Only the host can start",
  NEED_TWO: "Need at least 2 players",
  TOO_FEW_PLAYERS: "Need at least 2 players",
  CODE_GEN_FAILED: "Couldn't create a room — try again",
  WAGER_LOCKED: "Pot is locked — host must refund first",
  INVALID_WAGER: "Buy-in must be a non-negative whole number",
  INSUFFICIENT_CHIPS: "Someone can't afford that buy-in",
  WAGER_NOT_LOCKED: "No pot to refund",
  NOT_YOUR_TURN: "NOT YOUR TURN",
  CHOICE_PENDING: "KEEP OR BANK FIRST",
  NEED_1000: "NEED 1000 TO BANK",
  NOT_SCORING_SET: "NOT A SCORING SET",
  ALL_KEPT_MUST_SCORE: "ALL KEPT DICE MUST SCORE",
  WRONG_MODE: "WRONG MODE",
};

export function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const mapped = MESSAGES[msg];
  if (mapped) return mapped;
  // Firestore SDK errors ("Failed to get document because the client is
  // offline", "unavailable", …) shouldn't surface verbatim.
  if (/offline|network|unavailable/i.test(msg)) {
    return "You're offline — check your connection and try again";
  }
  // Unknown internal ALL_CAPS codes shouldn't leak raw either.
  if (/^[A-Z0-9_]{2,}$/.test(msg)) return "Something went wrong — try again";
  return msg;
}
