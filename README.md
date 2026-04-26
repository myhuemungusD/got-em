# got-em

Single-file async street dice app (no backend). Open `index.html` in a browser and share the URL after each move.

## Modes implemented
- Street Craps (2 dice, first to 3 sequences won)
- C-Lo (3 dice, best of 1)
- 4-5-6 (same head-to-head scoring as C-Lo)
- 10,000 / Farkle variant (6 dice, first to 10,000, 1000-entry rule)

## Async model
Game state is encoded in the URL hash. The next player opens the link, plays, then shares the updated link back.
