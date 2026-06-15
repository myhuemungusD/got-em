# Got Em — Street Dice · Engineering Roadmap

Prioritized engineering work, ordered by severity. P0 is a correctness/security
blocker; lower priorities are progressively more "nice to have." Each item is a
one-liner rationale plus the concrete work it implies.

The locked architectural decisions in [`claude.md`](../claude.md) stand: no
framework, no server / Cloud Functions, anonymous auth only, web-only on
Vercel, the four modes + invite as the scope. Nothing below proposes violating
them.

---

## P0 — Security: rewrite `firestore.rules`

**Why:** the live rules enforce almost nothing. `allow update` only checks that
the caller is a participant — so **any room participant can overwrite the entire
game doc**: forge a roll, set their own winning score, flip the turn to
themselves, or rewrite the wager pot and steal it. The mock backend simulates
none of this, so the suite is green while production is wide open.

Work:

- **Field-scoped update rules** mirroring the `ops.ts` invariants, validating
  the *diff* rather than just identity:
  - **Turn ownership** — only the current player may roll/score, except the
    deadline-lapsed `advanceTurn` path (any seated player after `turnDeadline`).
  - **Score caps** — reject writes that raise a score past the mode's win
    threshold or by an impossible delta.
  - **Wager / chip conservation** — total chips + pot must be conserved across a
    write; only `settlePot`/`refundWagers` may move the pot, and only to the
    recorded winner / original contributors.
  - **Additive joins** — a join may only add the caller's own uid + claim one
    empty slot; it may not mutate other slots or scores.
  - **Validated `create`** — enforce the initial shape (status `waiting`,
    zeroed scores, seeded chips, caller is host) instead of `request.auth != null`.
- **Preserve the host-drives-NPC write path.** The host writes on behalf of
  `npc-`-prefixed seats; the rules must explicitly keep allowing the host to act
  for NPC seats in its room. Make this an intentional, documented allowance, not
  an accident.
- **Resolve the delete contradiction.** Rules say `allow delete: if false`, but
  `leaveGame` deletes the doc when the last player leaves. Pick one: allow a
  scoped delete (empty room, by a participant) or change `leaveGame` to tombstone
  instead of delete. Today the two disagree.
- **Auth-gate reads.** Reads are currently fully public (`allow read: if true`).
  At minimum require `request.auth != null`; ideally scope sensitive fields.
- **Build a rules test harness — none exists today.** Add the Firestore emulator
  + `@firebase/rules-unit-testing`, with regression tests for at least:
  **wrong-turn write rejected**, **over-cap score rejected**, plus join/wager
  conservation cases. Wire it into CI.

---

## P1 — NPC hardening & build-safety

- **Remove-NPC-from-lobby control** — there's `addNpc`/`clearNpcs` but no way to
  drop a single NPC from a room; add the lobby control and the supporting op so
  hosts can adjust the table without tearing it down.
- **Broader NPC test coverage** — `npc.test.ts` exists but the clo/`s456` and
  `ten` decision paths (keep/bank/reroll heuristics) need direct coverage so
  changes to scoring don't silently break the bot.
- **Flip the `TEST_MODE` default** — today `TEST_MODE` is true unless
  `PROD === true`, so a misconfigured/misbuilt prod bundle **silently runs the
  in-memory mock** (games vanish on reload, no persistence) instead of failing
  visibly. Default to "real" and require an explicit signal for the mock, so a
  broken prod build fails loud.

---

## P2 — PWA / store readiness

- **Manifest screenshots + a designed icon** — store listings require
  `screenshots` in the manifest and a properly designed (not placeholder) icon
  set; the current icons are generated.
- **Privacy policy** — Firebase Anonymous Auth provisions and stores a
  per-device identifier; a published policy is required (and is a store
  prerequisite).
- **Play Store wrap** — Trusted Web Activity via Bubblewrap, plus
  `/.well-known/assetlinks.json` for Digital Asset Links, if a Play Store
  listing is wanted. (Stays web-only at runtime; this is just a wrapper.)
- **Content-rating note** — the dice/craps theme risks gambling-policy
  rejection. Label the app clearly as **simulated dice with no real-money
  wagering** (chips are virtual) in the listing and in-app to pre-empt review
  rejection.

---

## P3 — Polish

- **In-app service-worker update prompt** — `main.ts` registers the SW silently;
  add an "update available, reload" prompt so users aren't stuck on a stale
  cached bundle.
- **`robots.txt` + `sitemap`** — basic crawlability for the marketing surface.
- **Coverage reporting in CI** — surface Vitest coverage as a CI artifact /
  badge to keep an eye on thin modules (esp. NPC and the new rules harness).
