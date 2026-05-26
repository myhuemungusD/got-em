# Got Em

Real-time multiplayer street dice — friends create a room, share a code or link, and play from their own phones. Four game modes (Craps, C-Lo, 4-5-6, 10,000). Casual, friends-only, browser-based. No app store, no accounts.

## Status

- **Phase 0** — done. Vite + TypeScript scaffold landed and the scoring engine is ported from the prototype with **89 passing Vitest cases**.
- **Phase 1** — in progress. Bulletproofing: ESLint, env config, error boundary, GitHub Actions CI.
- **Phase 2** — turn timer, dead-game cleanup, reconnection. The headline work.
- **Phase 3** — polish (PWA, icons, sound).

See [`claude.md`](./claude.md) for the locked architecture decisions and the full phase plan.

## Stack

Vite · TypeScript (strict) · Vitest · Firebase Anonymous Auth + Cloud Firestore (planned, Phase 2) · Vercel for deploy.

**No** UI framework. **No** server. **No** accounts. **No** app store.

## Getting started

```sh
nvm use            # Node 22 per .nvmrc
npm install
npm run dev        # local dev server
npm test           # run the Vitest suite
npm run build      # typecheck + production build
```

## Repo layout

```
src/scoring/        dice + scoring engine (89 tests, locked)
src/main.ts         entry stub
index.html          Vite entry
prototypes/         the validated source-of-truth HTML prototype
.claude/agents/     project-scoped Claude Code subagents (the dev team)
claude.md           locked decisions and phase plan
```

## Working with the dev team

The repo ships with a five-agent Claude Code team in `.claude/agents/` — `gotem-architect`, `gotem-frontend`, `gotem-firebase`, `gotem-test`, and `gotem-reviewer`. See [`.claude/agents/README.md`](./.claude/agents/README.md) for the workflow.
