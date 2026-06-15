# Got Em — Street Dice

[![CI](https://github.com/myhuemungusD/got-em/actions/workflows/ci.yml/badge.svg)](https://github.com/myhuemungusD/got-em/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Real-time multiplayer street-dice on the web. Spin up a room, share a code or
QR, and play four classic dice games from your own phone — or take on a
computer opponent solo. No accounts, no install required, no app store.

> Live: https://got-em.vercel.app
> _(placeholder — confirm the production domain before publishing.)_

## Features

- **Four game modes** — Craps, C-Lo, 4-5-6, and 10,000 (a Farkle variant).
- **Single-player vs an NPC** — drop a computer opponent into any room and
  play solo. The host's browser drives every NPC action; no server involved.
- **Real-time multiplayer** — every player watches the same room live over
  Firestore; rolls animate on every screen before the result lands.
- **Invites** — share a 4-character room code, a deep link, or a scannable
  QR code straight from the lobby.
- **Wagers & chips** — each player starts with a virtual chip stack; the host
  can lock a per-player buy-in into a pot that's paid out to the winner.
- **30-second turn timer** — turns auto-advance when a player stalls, so a
  table can never deadlock on someone who walked away.
- **Installable PWA** — add to home screen, custom icons, offline-aware
  service worker, web manifest.
- **Sound effects** — WebAudio dice and UI sounds, with a persistent mute.
- **Recent rooms** — quick rejoin of rooms you've recently played.

## Stack

Vite 8 · TypeScript 6 (strict) · Vitest 4 · Firebase 12 (Anonymous Auth +
Cloud Firestore) · deployed on Vercel.

Plain typed DOM modules — **no** UI framework (no React/Vue). **No** server
and **no** Cloud Functions. **No** user accounts (anonymous per-device auth
only). **Web only.**

## Quickstart

```sh
nvm use          # Node version pinned in .nvmrc
npm install
npm run dev      # Vite dev server, in-memory mock backend
```

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Vite dev server (uses the in-memory mock backend).  |
| `npm test`          | Vitest, single run.                                 |
| `npm run test:watch`| Vitest in watch mode.                               |
| `npm run lint`      | ESLint, zero-warnings gate.                         |
| `npm run typecheck` | `tsc --noEmit`, strict mode.                        |
| `npm run build`     | Typecheck + production Vite build to `dist/`.       |

## Environment setup

Firebase config is read from `VITE_FIREBASE_*` environment variables at build
time. Copy the template and fill in values from the Firebase console
(Project settings → General → Your apps → SDK setup):

```sh
cp .env.example .env
```

The minimum keys read are `apiKey`, `projectId`, and `appId`. Never commit
`.env` — it is gitignored.

**TEST_MODE.** The backend is selected automatically (`src/firebase/mode.ts`),
not by a manual flag. Under Vitest and `vite dev` the app uses an in-memory
mock Firestore, so local development and the whole test suite run fully
in-process with no network and no Firebase project required. A production
`vite build` switches to the real Firestore client — so the Firebase env vars
are only needed for a prod build/deploy.

## Architecture

- **Plain typed DOM.** Screens and components are TypeScript modules that
  mount/unmount against DOM roots. No framework, no virtual DOM.
- **Central state.** `src/state.ts` is a single typed state object with a
  tiny `subscribe`/`setState` API. `src/router.ts` shows one screen at a time,
  driven by `state.screen`.
- **Game bridge.** `src/game-bridge.ts` subscribes to a `games/{code}` doc,
  mirrors it into `state.game`, derives the active screen from `status`, and
  triggers roll animations and NPC turns.
- **Firebase ops.** All room mutations go through the `src/firebase/ops.ts`
  façade, and **every write runs inside a Firestore `runTransaction`** — there
  is no exported raw `setDoc`/`updateDoc`. `ops.ts` routes to either the
  in-memory mock or the real client based on `TEST_MODE`.
- **Security rules.** `firestore.rules` gates access to the game documents.
- **Host-drives-NPC.** NPCs are synthetic players with `npc-`-prefixed uids.
  The host's browser (only) runs each NPC's turn as a normal transactional
  write — consistent with the no-server / no-Cloud-Functions rule.

## Deployment

Deployed on **Vercel**:

- Build command: `npm run build`
- Output directory: `dist/`
- Set the `VITE_FIREBASE_*` variables in the Vercel project's Environment
  Variables (so the prod bundle uses real Firestore, not the mock).

Separately, **`firestore.rules` must be deployed to Firebase** (e.g. via the
Firebase console or `firebase deploy --only firestore:rules`). Deploying the
app without publishing the rules leaves the database governed by whatever
rules are currently live in the project — see
[`SECURITY.md`](./SECURITY.md) and [`docs/ROADMAP.md`](./docs/ROADMAP.md).

## Source layout

```
src/
  main.ts          Entry — boots styles, router, error boundary, SW.
  state.ts         Central typed app state + subscribe/setState.
  router.ts        Single-screen-at-a-time router driven by state.screen.
  game-bridge.ts   Room→state→screen bridge; drives roll animations + NPC.
  npc.ts           Computer opponent (host-browser-driven, npc- uids).
  auth.ts          Firebase Anonymous Auth.
  invite.ts        Invite link / room-code helpers.
  recent.ts        Recent-rooms persistence.
  modes.ts         Game-mode metadata.
  error-boundary.ts
  scoring/         Per-mode scoring engines (dice, craps, clo, farkle).
  firebase/        Backend façade: ops, real client, in-memory mock,
                   config, types, TEST_MODE switch, gameplay/turn/wager ops.
  screens/         boot, setup-error, splash, mode-select, lobby, play,
                   gameover — each a mount/unmount module.
  components/      dice, hand, invite-modal, qr, sfx.
  styles/          Design tokens + per-screen CSS.
  e2e/             End-to-end flow tests (lobby, craps, clo, ten, wager).

public/            manifest.webmanifest, sw.js, icons/
firestore.rules    Firestore security rules.
scripts/           Build helpers (make-icons.mjs).
prototypes/        The original validated HTML prototype (historical).
```

## Contributing & security

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to propose changes.
- [`SECURITY.md`](./SECURITY.md) — security policy and reporting.
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — prioritized engineering roadmap.
- [`claude.md`](./claude.md) — locked architectural decisions and current
  shipped/remaining status.

## License

MIT.
