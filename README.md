# Got Em — Street Dice

[![CI](https://github.com/myhuemungusD/got-em/actions/workflows/ci.yml/badge.svg)](https://github.com/myhuemungusD/got-em/actions/workflows/ci.yml)

Real-time multiplayer dice game. Four modes (Craps, C-Lo, 4-5-6, 10,000),
anonymous per-device players, QR/link invites, browser-only. No accounts,
no app store.

See [`claude.md`](./claude.md) for locked architectural decisions and the
full phase plan.

## Status

- **Phase 0** — closed. Scoring engine, central state, firebase mock + ops
  façade, screen router, and the splash screen are ported and typed.
- **Phase 1** — in progress. Bulletproofing: strict TS (on), CI (live),
  env config, error boundary. Lint is a tracked follow-up.
- **Phase 2** — turn timer, dead-game cleanup, reconnection. The headline work.
- **Phase 3** — polish (PWA, icons, optional sound).

## Stack

Vite · TypeScript (strict) · Vitest · Firebase Anonymous Auth + Cloud
Firestore · Vercel for deploy.

**No** UI framework. **No** server. **No** accounts. **No** app store.

## Prerequisites

- Node — version pinned in `.nvmrc` (`nvm use` will pick it up).
- npm (ships with Node).

## Setup

```sh
nvm use
npm install
```

### Environment

Firebase config lives in `.env` (gitignored). Copy the template and fill in
values from the Firebase console (Project settings → General → Your apps →
SDK setup):

```sh
cp .env.example .env
```

You can skip this for local development and tests. `TEST_MODE` auto-engages
when no `VITE_FIREBASE_*` keys are bound (and always under `vitest`), so the
in-memory mock backend handles everything in-process. Real Firebase is only
required for a production build.

Never commit `.env`.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Vite dev server (uses mock backend).          |
| `npm test`         | Vitest run, single pass.                      |
| `npm run typecheck`| `tsc --noEmit`, strict mode.                  |
| `npm run build`    | Typecheck + production Vite build to `dist/`. |

## Source layout

```
src/
  scoring/    Dice + per-mode scoring engines (craps, c-lo, 4-5-6, 10k).
  firebase/   Backend façade: ops, in-memory mock, config, TEST_MODE switch.
  screens/    Per-screen mount/unmount modules wired through the router.
  components/ Reserved for shared UI (dice, hand, invite modal). Empty for now.
  styles/     Design tokens + per-screen CSS.
  state.ts    Central typed app state with a tiny subscribe/setState API.
  router.ts   Single-screen-at-a-time router driven by `state.screen`.
  main.ts     Entry point — boots styles and starts the router.
```

The prototype at `prototypes/gotem.html` is the source of truth being ported
module by module. Tests stay green at every step.

## Working with the dev team

The repo ships with a five-agent Claude Code team in `.claude/agents/` —
`gotem-architect`, `gotem-frontend`, `gotem-firebase`, `gotem-test`, and
`gotem-reviewer`. See [`.claude/agents/README.md`](./.claude/agents/README.md)
for the workflow.
