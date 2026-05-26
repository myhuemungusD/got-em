# Got Em — Senior Dev Team

Project-scoped Claude Code subagents. Each agent has a focused role, a strict scope, and is pinned to Opus.

| Agent | Role | When to invoke |
|---|---|---|
| `gotem-architect` | Tech lead | Plan the next chunk, split work, hold the scope line, decide who picks it up |
| `gotem-frontend`  | DOM/TS engineer | Build screens, components, central state — plain typed DOM, no framework |
| `gotem-firebase`  | Backend engineer | Firestore data model, security rules, `runTransaction`, TEST_MODE mock, env config |
| `gotem-test`      | Test engineer | Vitest specs alongside every behavior change, mock-driven Firestore coverage |
| `gotem-reviewer`  | Independent reviewer | Read-only pre-merge review: scope, secrets, tests, locked-decision compliance |

## How to use the team

Open Claude Code from inside this repo's root (not from elsewhere — these are project-scoped agents). Then invoke an agent the normal way:

> Use the gotem-architect to plan the next step of Phase 1.

Each agent reads `claude.md` and the relevant `prototypes/` source before acting. Their system prompts pin them to the locked decisions — they will push back if you ask them to break those decisions.

## What's locked (in `claude.md`)

Vite + TypeScript, no UI framework. Firebase Anonymous Auth + Firestore only. No accounts. Web only, Vercel deploy. Four game modes + invite + rematch + bulletproof turn handling. Port from `prototypes/gotem.html` — don't rewrite logic that works.

## Workflow

1. **Plan:** `gotem-architect` produces a minimal next step.
2. **Build:** `gotem-frontend` or `gotem-firebase` executes it on a feature branch.
3. **Test:** `gotem-test` ensures coverage ships in the same PR.
4. **Review:** `gotem-reviewer` reviews the diff before merge.
5. **Merge:** Jason merges via GitHub UI.
