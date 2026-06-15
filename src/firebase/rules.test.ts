/**
 * Firestore security rules tests for Got Em.
 *
 * These tests validate that `firestore.rules` correctly enforces turn
 * ownership, score caps, NPC authorization, status transitions, winner
 * integrity, and access control.
 *
 * REQUIRES the Firebase Firestore emulator. Run via:
 *
 *   npm run test:rules
 *
 * which executes:
 *   firebase emulators:exec --only firestore -- npx vitest run src/firebase/rules.test.ts
 *
 * The default `npm test` excludes this file (see vite.config.ts exclude).
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { describe, it, beforeAll, afterAll, afterEach } from "vitest";

/* -------------------------------------------------------------------- */
/* Constants                                                            */
/* -------------------------------------------------------------------- */

const PROJECT_ID = "demo-gotem-rules-test";
const HOST_UID = "host-uid-abc";
const PLAYER_UID = "player-uid-xyz";
const OUTSIDER_UID = "outsider-uid-999";
const NPC_UID = "npc-bot1";

/* -------------------------------------------------------------------- */
/* Helper: valid game doc factory                                       */
/* -------------------------------------------------------------------- */

/**
 * Returns a valid `games/{code}` document shape that passes all create
 * rules. Callers override individual fields to test one violation at a
 * time.
 */
function makeValidGameDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    code: "ABCD",
    mode: "craps",
    hostUid: HOST_UID,
    numSlots: 2,
    slots: [
      { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
      { uid: null, name: "", score: 0, onBoard: false, chips: 100 },
    ],
    playerUids: [HOST_UID],
    current: 0,
    status: "waiting",
    winner: null,
    lastRoll: null,
    lastResult: null,
    lastRollId: null,
    lastRolledBy: null,
    turnStartedAt: null,
    turnDeadline: null,
    turnDurationMs: 30000,
    wager: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    craps: { phase: "comeout", point: null },
    ...overrides,
  };
}

/**
 * Returns an in-progress 2-player game doc (already seeded via admin)
 * that can be used as the "before" state for update rule tests.
 */
function makeInProgressDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    code: "ABCD",
    mode: "craps",
    hostUid: HOST_UID,
    numSlots: 2,
    slots: [
      { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
      { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
    ],
    playerUids: [HOST_UID, PLAYER_UID],
    current: 0,
    status: "in_progress",
    winner: null,
    lastRoll: null,
    lastResult: null,
    lastRollId: null,
    lastRolledBy: null,
    turnStartedAt: Date.now(),
    turnDeadline: Date.now() + 30000,
    turnDurationMs: 30000,
    wager: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    craps: { phase: "comeout", point: null },
    ...overrides,
  };
}

/**
 * Seed a doc with security rules bypassed (admin context).
 */
async function seedDoc(
  testEnv: RulesTestEnvironment,
  code: string,
  data: Record<string, unknown>,
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("games").doc(code).set(data);
  });
}

/* -------------------------------------------------------------------- */
/* Test environment setup                                               */
/* -------------------------------------------------------------------- */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = resolve(__dirname, "../../firestore.rules");
  const rules = readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

/* ==================================================================== */
/* READ RULES                                                           */
/* ==================================================================== */

describe("read rules", () => {
  it("rejects unauthenticated read", async () => {
    await seedDoc(testEnv, "ABCD", makeValidGameDoc());
    const unauthed = testEnv.unauthenticatedContext();
    const db = unauthed.firestore();
    await assertFails(db.collection("games").doc("ABCD").get());
  });

  it("allows authenticated read", async () => {
    await seedDoc(testEnv, "ABCD", makeValidGameDoc());
    const authed = testEnv.authenticatedContext(HOST_UID);
    const db = authed.firestore();
    await assertSucceeds(db.collection("games").doc("ABCD").get());
  });
});

/* ==================================================================== */
/* CREATE RULES                                                         */
/* ==================================================================== */

describe("create rules", () => {
  it("allows valid create with all required fields", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc("ABCD").set(makeValidGameDoc()),
    );
  });

  it("rejects create when hostUid does not match caller", async () => {
    const ctx = testEnv.authenticatedContext(PLAYER_UID);
    const db = ctx.firestore();
    // hostUid is HOST_UID but auth is PLAYER_UID
    await assertFails(
      db.collection("games").doc("ABCD").set(makeValidGameDoc()),
    );
  });

  it("rejects create with status 'finished'", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ status: "finished" }),
      ),
    );
  });

  it("rejects create with status 'in_progress'", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ status: "in_progress" }),
      ),
    );
  });

  it("rejects create with non-zero score in slot 0", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({
          slots: [
            { uid: HOST_UID, name: "Host", score: 1, onBoard: false, chips: 100 },
            { uid: null, name: "", score: 0, onBoard: false, chips: 100 },
          ],
        }),
      ),
    );
  });

  it("rejects create with winner already set", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ winner: HOST_UID }),
      ),
    );
  });

  it("rejects create with wrong code (does not match doc id)", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ code: "ZZZZ" }),
      ),
    );
  });

  it("rejects create with invalid mode", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ mode: "poker" }),
      ),
    );
  });

  it("rejects create when playerUids[0] does not match caller", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ playerUids: [PLAYER_UID] }),
      ),
    );
  });

  it("rejects create with lastRollId already set", async () => {
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc("ABCD").set(
        makeValidGameDoc({ lastRollId: "roll-1" }),
      ),
    );
  });
});

/* ==================================================================== */
/* UPDATE RULES: TURN OWNERSHIP                                         */
/* ==================================================================== */

describe("update rules: turn ownership", () => {
  const GAME_CODE = "TURN";

  it("rejects wrong-turn player changing current/lastRollId", async () => {
    // Seed an in-progress game where current == 0 (HOST_UID's turn)
    await seedDoc(testEnv, GAME_CODE, makeInProgressDoc({ code: GAME_CODE }));

    // PLAYER_UID (slot 1, not their turn) tries to change current and lastRollId
    const ctx = testEnv.authenticatedContext(PLAYER_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        current: 1,
        lastRollId: "bad-roll-id",
        updatedAt: Date.now(),
      }),
    );
  });

  it("allows current player to change current/lastRollId", async () => {
    // current == 0 => HOST_UID's turn
    await seedDoc(testEnv, GAME_CODE, makeInProgressDoc({ code: GAME_CODE }));

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).update({
        current: 1,
        lastRollId: "roll-xyz",
        updatedAt: Date.now(),
      }),
    );
  });
});

/* ==================================================================== */
/* UPDATE RULES: NPC AUTHORIZATION                                      */
/* ==================================================================== */

describe("update rules: NPC authorization", () => {
  const GAME_CODE = "NPCT";

  function makeNpcDoc(): Record<string, unknown> {
    return makeInProgressDoc({
      code: GAME_CODE,
      slots: [
        { uid: NPC_UID, name: "Bot", score: 0, onBoard: false, chips: 100 },
        { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
      ],
      playerUids: [NPC_UID, HOST_UID],
      current: 0, // NPC's turn
    });
  }

  it("allows host to roll for NPC at current turn", async () => {
    await seedDoc(testEnv, GAME_CODE, makeNpcDoc());

    // Host acts on behalf of the NPC (seat 0, npc-bot1)
    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).update({
        current: 1,
        lastRollId: "npc-roll-1",
        updatedAt: Date.now(),
      }),
    );
  });

  it("rejects non-host rolling for NPC", async () => {
    await seedDoc(testEnv, GAME_CODE, makeNpcDoc());

    // PLAYER_UID is not the host and not the NPC
    const ctx = testEnv.authenticatedContext(PLAYER_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        current: 1,
        lastRollId: "npc-roll-bad",
        updatedAt: Date.now(),
      }),
    );
  });
});

/* ==================================================================== */
/* UPDATE RULES: SCORE CAP                                              */
/* ==================================================================== */

describe("update rules: score cap", () => {
  const GAME_CODE = "SCAP";

  it("rejects score above craps cap (> 3)", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE, mode: "craps" }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        slots: [
          { uid: HOST_UID, name: "Host", score: 4, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        updatedAt: Date.now(),
      }),
    );
  });

  it("allows score at craps cap (== 3)", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE, mode: "craps" }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).update({
        slots: [
          { uid: HOST_UID, name: "Host", score: 3, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        updatedAt: Date.now(),
      }),
    );
  });

  it("rejects score above clo cap (> 1)", async () => {
    const cloDoc = makeInProgressDoc({
      code: GAME_CODE,
      mode: "clo",
      craps: undefined,
      matchup: { rolls: {} },
    });
    // Remove craps from the doc since this is a clo game
    delete cloDoc["craps"];
    await seedDoc(testEnv, GAME_CODE, cloDoc);

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        slots: [
          { uid: HOST_UID, name: "Host", score: 2, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        updatedAt: Date.now(),
      }),
    );
  });

  it("rejects negative score", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE, mode: "craps" }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        slots: [
          { uid: HOST_UID, name: "Host", score: -1, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        updatedAt: Date.now(),
      }),
    );
  });
});

/* ==================================================================== */
/* UPDATE RULES: STATUS TRANSITIONS                                     */
/* ==================================================================== */

describe("update rules: status transitions", () => {
  const GAME_CODE = "STAT";

  it("rejects backwards transition (in_progress -> waiting)", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        status: "waiting",
        updatedAt: Date.now(),
      }),
    );
  });

  it("allows forward transition (waiting -> in_progress)", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeValidGameDoc({
        code: GAME_CODE,
        slots: [
          { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        playerUids: [HOST_UID, PLAYER_UID],
      }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).update({
        status: "in_progress",
        turnStartedAt: Date.now(),
        turnDeadline: Date.now() + 30000,
        updatedAt: Date.now(),
      }),
    );
  });

  it("allows forward transition (in_progress -> finished)", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).update({
        status: "finished",
        winner: HOST_UID,
        updatedAt: Date.now(),
      }),
    );
  });

  it("rejects skip transition (waiting -> finished)", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeValidGameDoc({
        code: GAME_CODE,
        slots: [
          { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        playerUids: [HOST_UID, PLAYER_UID],
      }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        status: "finished",
        winner: HOST_UID,
        updatedAt: Date.now(),
      }),
    );
  });
});

/* ==================================================================== */
/* UPDATE RULES: WINNER INTEGRITY                                       */
/* ==================================================================== */

describe("update rules: winner integrity", () => {
  const GAME_CODE = "WINR";

  it("rejects winner set to uid not in playerUids", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        status: "finished",
        winner: OUTSIDER_UID, // not in playerUids
        updatedAt: Date.now(),
      }),
    );
  });

  it("allows winner set to uid in playerUids", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).update({
        status: "finished",
        winner: PLAYER_UID,
        updatedAt: Date.now(),
      }),
    );
  });

  it("rejects changing winner once already set", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({
        code: GAME_CODE,
        status: "finished",
        winner: HOST_UID,
      }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        winner: PLAYER_UID,
        updatedAt: Date.now(),
      }),
    );
  });
});

/* ==================================================================== */
/* DELETE RULES                                                         */
/* ==================================================================== */

describe("delete rules", () => {
  const GAME_CODE = "DELT";

  it("allows last player to delete waiting room", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeValidGameDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertSucceeds(
      db.collection("games").doc(GAME_CODE).delete(),
    );
  });

  it("rejects delete with 2+ players", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeValidGameDoc({
        code: GAME_CODE,
        slots: [
          { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
          { uid: PLAYER_UID, name: "Player", score: 0, onBoard: false, chips: 100 },
        ],
        playerUids: [HOST_UID, PLAYER_UID],
      }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).delete(),
    );
  });

  it("rejects delete when game is in_progress", async () => {
    // Single player but in_progress (edge case)
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({
        code: GAME_CODE,
        slots: [
          { uid: HOST_UID, name: "Host", score: 0, onBoard: false, chips: 100 },
        ],
        numSlots: 1,
        playerUids: [HOST_UID],
      }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).delete(),
    );
  });

  it("rejects delete by non-participant", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeValidGameDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(OUTSIDER_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).delete(),
    );
  });

  it("rejects unauthenticated delete", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeValidGameDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.unauthenticatedContext();
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).delete(),
    );
  });
});

/* ==================================================================== */
/* UPDATE RULES: IMMUTABLE FIELDS                                       */
/* ==================================================================== */

describe("update rules: immutable fields", () => {
  const GAME_CODE = "IMMF";

  it("rejects changing mode after creation", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        mode: "ten",
        updatedAt: Date.now(),
      }),
    );
  });

  it("rejects changing code after creation", async () => {
    await seedDoc(
      testEnv,
      GAME_CODE,
      makeInProgressDoc({ code: GAME_CODE }),
    );

    const ctx = testEnv.authenticatedContext(HOST_UID);
    const db = ctx.firestore();
    await assertFails(
      db.collection("games").doc(GAME_CODE).update({
        code: "ZZZZ",
        updatedAt: Date.now(),
      }),
    );
  });
});
