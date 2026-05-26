# Got Em — Street Dice

A real-time multiplayer dice game. Friends create a room, share a code or
link, and play from their own phones. Four game modes. Casual, friends-only,
browser-based. No app store, no accounts.

## Locked decisions — do not revisit without explicit approval

- **Stack:** Vite + TypeScript, **no UI framework** (no React/Vue). Plain typed
  DOM modules. TypeScript strict mode on.
- **Backend:** Firebase — Anonymous Auth + Cloud Firestore only. No server,
  no Cloud Functions.
- **Accounts:** None. Players are anonymous per-device. Do not add logins.
- **Distribution:** Web only, deployed to Vercel. No Capacitor, no app store.
- **Scope:** 4 game modes, invite (QR + link), device-local rematch shortcut,
  bulletproof turn handling. Nothing else. Hold this line.

## Game modes

- **Craps** — 2 dice. 7/11 win, 2/3/12 craps, else point. First to 3 wins.
- **C-Lo** — 3 dice. 4-5-6 wins, 1-2-3 loses, triples/pairs ranked. Highest wins.
- **4-5-6** — 3 dice, same combos as C-Lo.
- **10,000** — 6 dice, Farkle variant. Keep scoring dice, bank or reroll,
  first to 10,000.

## Firestore model

`games/{code}` holds the whole game: mode, slots[], playerUids[], current
turn, status (waiting/in_progress/finished), last roll, mode-specific state.
All game writes go through `runTransaction`. Security rules enforce turn
order, score limits, and join validity.

## Source of truth for porting

`street-dice.html` is the validated prototype: 137 automated checks passing
(44 gameplay, 20 invite, 20 features, 53 scoring). Port FROM it, module by
module, tests green at each step. Do not rewrite logic that already passes
tests — move it and type it.

## Target structure

```
src/
  scoring/      dice + scoring engine (port first — has 53 tests)
  firebase/     game ops + a test-mode mock
  screens/      splash, mode-select, lobby, play, gameover
  components/   dice, hand, invite modal
  state.ts      central state object
  main.ts       entry
*.test.ts       Vitest, ported from the prototype harnesses
```

## Rules of engagement

- Port module-by-module. Tests must pass before moving to the next module.
- Never commit Firebase config — it goes in `.env`, gitignored.
- `TEST_MODE` must be automatic (dev vs prod env), not a manual flag.
- CI (GitHub Actions) gates every push: typecheck + lint + all tests.
- Small verified steps. If a task spans many files at once, split it.

## Phase plan

0. Repo setup + restructure the prototype into typed modules.
1. Bulletproofing: strict TS, CI, env config, error boundary.
2. **Turn timer + dead-game cleanup + reconnection** — the headline work.
3. Polish: PWA manifest, icon, optional sound, audited states.
