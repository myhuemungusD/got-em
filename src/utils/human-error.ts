const MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: "Room not found",
  GAME_OVER: "Game is over",
  ALREADY_STARTED: "Game already started",
  SLOT_TAKEN: "That seat was just taken",
  BAD_SLOT: "Invalid seat",
  NOT_HOST: "Only the host can start",
  NEED_TWO: "Need at least 2 players",
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
  return MESSAGES[msg] ?? msg;
}
