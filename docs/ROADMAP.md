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
- **Manifest screenshots + a designed icon** — TODO. Store listings require
  `screenshots` in the manifest and a properly designed (not placeholder) icon
  set.
- **Play Store wrap** — TODO. Trusted Web Activity via Bubblewrap, plus
  `/.well-known/assetlinks.json` for Digital Asset Links.

---

## P3 — Polish

- **In-app service-worker update prompt** — DONE (toast with SKIP_WAITING flow).
- **`robots.txt` + `sitemap`** — DONE (`robots.txt` + `sitemap.xml` shipped).
- **Coverage reporting in CI** — DONE (`test:coverage` script + CI artifact).
- **Firebase rules test harness** — scaffolded (`firebase.json` + emulator
  config + `rules.test.ts` with critical test cases). Requires Firebase
  emulator to run locally/in CI.
