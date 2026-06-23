# Got Em — Street Dice · Engineering Roadmap

Prioritized engineering work, ordered by severity. P0 is a correctness/security
blocker; lower priorities are progressively more "nice to have." Each item is a
one-liner rationale plus the concrete work it implies.

The locked architectural decisions in [`claude.md`](../claude.md) stand: no
framework, no server / Cloud Functions, anonymous auth only, web-only on
Vercel, the four modes + invite as the scope. Nothing below proposes violating
them.

---

## P0 — Security: rewrite `firestore.rules` — DONE

Field-scoped update rules, turn ownership, score caps, wager/chip conservation,
additive joins, validated create, host-drives-NPC allowance, delete
reconciliation, auth-gated reads, and a rules test harness — all shipped.
Hardened further with `chipsNonNegativeInt()`, `wagerIntegrity()`, and
`turnDurationMs` immutability guards (PR #55).

---

## P1 — NPC hardening & build-safety — DONE (PR #42)

- **Remove-NPC-from-lobby control** — `removeNpc` op and lobby UI shipped.
- **Broader NPC test coverage** — clo/s456/ten decision paths covered in
  `npc.test.ts`.
- **Flip the `TEST_MODE` default** — now defaults to real Firebase; mock
  requires an explicit signal.

---

## P2 — PWA / store readiness

- **Privacy policy** — DONE (`public/privacy.html`, linked from splash footer).
- **Content-rating disclaimer** — DONE. "Simulated dice — no real-money wagering"
  shown on splash screen and in the lobby wager section.
- **Manifest screenshots + a designed icon** — DONE. 1024/512/192 designed
  PNGs + maskable variant, 4 portrait screenshots in manifest, feature graphic.
- **Play Store wrap** — scaffolded. TWA config (`twa/twa-values.json`),
  Bubblewrap setup scripts, and `assetlinks.template.json` ready. Needs signing
  key SHA-256 fingerprint to finalize `/.well-known/assetlinks.json`.

---

## P3 — Polish

- **In-app service-worker update prompt** — DONE (toast with SKIP_WAITING flow).
- **`robots.txt` + `sitemap`** — DONE (`robots.txt` + `sitemap.xml` shipped).
- **Coverage reporting in CI** — DONE (`test:coverage` script + CI artifact).
- **Firebase rules test harness** — scaffolded (`firebase.json` + emulator
  config + `rules.test.ts` with critical test cases). Requires Firebase
  emulator to run locally/in CI.
- **Production blocker fix** — DONE (PR #55). `gameplay.ts:nowTs()` no longer
  throws in production builds.
- **Invite deep-link flow** — DONE (PR #56). Invite banner shows on splash,
  join code auto-populates, `saveName()` persists player name across sessions.
- **Recent rooms** — DONE (PR #56). Recent rooms rendered on splash with
  one-tap rejoin.
- **Shared utilities** — DONE (PR #56). `escHtml`, `escAttr`, `humanError`
  extracted to `src/utils/`, removed 5 duplicate copies.
- **Dependency security** — DONE. `npm audit fix` applied; remaining moderate
  alerts are in firebase-tools (dev-only, not shipped).
