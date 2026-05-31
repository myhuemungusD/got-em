import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetState, setState, state, subscribe } from "./state";

describe("state", () => {
  beforeEach(() => {
    resetState();
  });

  it("starts on the boot screen with no game", () => {
    expect(state.screen).toBe("boot");
    expect(state.game).toBeNull();
    expect(state.currentRoom).toBeNull();
    expect(state.myUid).toBeNull();
  });

  it("uses the prototype's defaults for mode and player count", () => {
    expect(state.selectedMode).toBe("craps");
    expect(state.selectedPlayerCount).toBe(2);
  });

  it("setState shallow-merges and leaves unrelated fields untouched", () => {
    setState({ myName: "Ace" });
    setState({ selectedMode: "ten" });
    expect(state.myName).toBe("Ace");
    expect(state.selectedMode).toBe("ten");
    expect(state.selectedPlayerCount).toBe(2);
    expect(state.screen).toBe("boot");
  });

  it("fires subscribers on setState with the latest state", () => {
    const fn = vi.fn();
    subscribe(fn);
    setState({ screen: "splash" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[0].screen).toBe("splash");
  });

  it("unsubscribe stops further notifications", () => {
    const fn = vi.fn();
    const off = subscribe(fn);
    setState({ screen: "splash" });
    off();
    setState({ screen: "mode-select" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("notifies every subscriber on each change", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe(a);
    subscribe(b);
    setState({ screen: "lobby" });
    setState({ currentRoom: "ABCD" });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("can hold a full GameState patch", () => {
    setState({
      currentRoom: "WXYZ",
      game: {
        v: 1,
        code: "WXYZ",
        mode: "craps",
        hostUid: "u1",
        numSlots: 2,
        slots: [
          { uid: "u1", name: "Ace", score: 0, onBoard: false },
          { uid: "u2", name: "Blaze", score: 0, onBoard: false },
        ],
        playerUids: ["u1", "u2"],
        current: 0,
        status: "in_progress",
        winner: null,
        lastRoll: null,
        lastResult: null,
        lastRollId: null,
        lastRolledBy: null,
        turnStartedAt: null,
        turnDeadline: null,
        turnDurationMs: 30000,
        craps: { phase: "comeout", point: null },
      },
    });
    expect(state.game?.mode).toBe("craps");
    expect(state.game?.slots).toHaveLength(2);
    expect(state.game?.craps?.phase).toBe("comeout");
  });

  it("resetState restores defaults and clears subscribers", () => {
    setState({ screen: "play", myName: "Ace" });
    const fn = vi.fn();
    subscribe(fn);
    resetState();
    expect(state.screen).toBe("boot");
    expect(state.myName).toBe("");
    setState({ screen: "splash" });
    expect(fn).not.toHaveBeenCalled();
  });
});
