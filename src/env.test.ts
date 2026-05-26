import { describe, it, expect } from "vitest";
import { env, TEST_MODE } from "./env";

describe("env", () => {
  it("exposes the six Firebase config keys", () => {
    const keys = Object.keys(env).sort();
    expect(keys).toEqual([
      "apiKey",
      "appId",
      "authDomain",
      "messagingSenderId",
      "projectId",
      "storageBucket",
    ]);
  });

  it("each value is string-or-undefined", () => {
    for (const value of Object.values(env)) {
      if (value !== undefined) expect(typeof value).toBe("string");
    }
  });
});

describe("TEST_MODE", () => {
  it("is a boolean (automatic, never a manual flag)", () => {
    expect(typeof TEST_MODE).toBe("boolean");
  });

  it("is true under Vitest because MODE !== 'production'", () => {
    expect(import.meta.env.MODE).not.toBe("production");
    expect(TEST_MODE).toBe(true);
  });
});
