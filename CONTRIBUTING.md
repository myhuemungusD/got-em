# Contributing to Got Em — Street Dice

Thanks for your interest in contributing! This guide covers the dev loop, the
pre-PR gate, and the locked scope decisions that keep this project focused.

## Dev setup

Node version is pinned in [`.nvmrc`](./.nvmrc) (Node 22).

```bash
nvm use          # match the pinned Node version
npm install      # install dependencies
npm run dev      # start the Vite dev server
```

Copy `.env.example` to `.env` and fill in your Firebase web config. The Firebase
web API key is **not** a secret — see [SECURITY.md](./SECURITY.md).

## Pre-PR gate (mirrors CI)

Before opening a pull request, **all four** of these must pass locally. CI runs
the same commands and will block the PR if any fail.

```bash
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint, zero warnings allowed
npm test            # vitest run
npm run build       # tsc + vite build
```

## Locked decisions (read before proposing changes)

The scope of this project is intentionally locked. See [`claude.md`](./claude.md)
for the full rationale. Please do **not** open PRs or issues that violate these:

- **No frameworks.** No React, Vue, Svelte, or similar. The UI is plain, typed
  DOM with a central state object.
- **No backend / no Cloud Functions.** Firebase (Anonymous Auth + Firestore)
  only. No custom servers.
- **No accounts.** Anonymous Auth only — no sign-up, no email/password, no OAuth.
- **Web only.**
- **Scope is the 4 game modes** (Craps, C-Lo, 4-5-6, 10,000) **plus invites.**
  New game modes or features outside this set are out of scope.

## Firestore writes

All game state writes go through `runTransaction` to keep turn order, wagers, and
dice results consistent across clients. **Do not** add raw `setDoc`/`updateDoc`
calls for game state — route them through the existing transaction helpers.

## Commit & PR conventions

- Keep changes small and verifiable. Prefer a series of small, reviewable steps
  over one large PR.
- Write clear, imperative commit messages (e.g. `Add C-Lo scoring helper`).
- Link the related issue in your PR description and fill out the PR template
  checklist.
- Add or update tests for any behavior change.
- Include screenshots for UI changes.

## Agent workflow

This repo uses specialized Claude Code agents defined under
[`.claude/agents/`](./.claude/agents/) for planning, frontend, Firebase, testing,
and review. If you use them, respect the same locked decisions and pre-PR gate.
