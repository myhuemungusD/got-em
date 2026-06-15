# Got Em — Street Dice

## Working principles

1. Ask before assuming.
2. Use the simplest solution first.
3. Don't touch unrelated code.
4. Flag uncertainty immediately.

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

## NPC architecture — locked / known design point

Single-player works by seating a **synthetic NPC player** in the room:

- NPCs are identified by a **`npc-` uid prefix** (`src/npc.ts`).
- The **host's browser drives every NPC action** — `game-bridge.ts` calls
  `maybeNpcTurn` on each doc update, and when it's an NPC's turn the host
  issues that NPC's roll/bank/reroll as a normal transactional `ops` write.
  **No server, no Cloud Functions** — consistent with the locked backend rule.
- The host tracks the NPCs it created in a module-level set; only the host
  acts on them.

Treat this host-drives-NPC write path as a design constraint, not a bug, when
hardening security rules: the rules must keep allowing the host to write on
behalf of `npc-` seats.

## Wagers & turn timer — shipped behavior

- **Wagers/chips** are real: every slot seeds a virtual chip stack; the host
  can `lockWagers` a per-player buy-in into a room-local pot, which is paid to
  the winner (`settlePot`) or refunded (`refundWagers`). Locking freezes the
  roster.
- **Turn timer** is real: each turn stamps a `turnDeadline`
  (`turnDurationMs`, default 30s). Once it lapses, any seated player may
  `advanceTurn`, so a stalled table auto-advances and can't deadlock.

## Shipped

- **Real Firestore adapter** (`src/firebase/real.ts`) wired behind the `ops`
  façade; `TEST_MODE` mock for dev/test, real client for prod builds.
- **All screens built** (`boot`, `setup-error`, `splash`, `mode-select`,
  `lobby`, `play`, `gameover`) — no stubs remain.
- **All shared components built** (`dice`, `hand`, `invite-modal`, `qr`,
  `sfx`).
- **Turn timer** with auto-advance.
- **Wager / chips UI** with pot lock + settlement.
- **NPC opponent** (single-player) — see above.
- **PWA** — manifest, service worker, icons, installable.
- **Sound** — WebAudio SFX with a persistent mute.

## Remaining / known work

See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for the full prioritized list.
Headlines:

- **Security-rules hardening (P0).** `firestore.rules` enforce almost nothing
  today; they need a field-scoped rewrite mirroring the `ops` invariants, plus
  an emulator-based rules-unit-testing harness.
- **NPC hardening (P1).** Remove-NPC-from-lobby control and broader NPC test
  coverage (clo/ten modes); flip the `TEST_MODE` default so a misbuilt prod
  bundle fails loudly instead of silently using the mock.
- **PWA store-listing assets (P2).** Manifest screenshots, a designed icon,
  privacy policy, and store-wrapping prerequisites.

## Source of truth for porting

`prototypes/gotem.html` is the validated prototype the modules were ported
from. It remains in-repo for reference. Do not rewrite logic that already
passes tests — move it and type it.

## Rules of engagement

- Tests must pass before moving to the next module.
- Never commit Firebase config — it goes in `.env`, gitignored.
- `TEST_MODE` is automatic (dev vs prod env), not a manual flag.
- CI (GitHub Actions) gates every push: typecheck + lint + all tests + build.
- Small verified steps. If a task spans many files at once, split it.

## Target structure

```
src/
  scoring/      dice + per-mode scoring engines
  firebase/     game ops + real client + test-mode mock
  screens/      boot, setup-error, splash, mode-select, lobby, play, gameover
  components/   dice, hand, invite-modal, qr, sfx
  state.ts      central state object
  game-bridge.ts room→state→screen bridge
  npc.ts        host-driven computer opponent
  main.ts       entry
*.test.ts       Vitest, ported from the prototype harnesses
```
