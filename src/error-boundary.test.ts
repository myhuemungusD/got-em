import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installErrorBoundary } from "./error-boundary";

type OnError = (message: string) => void;

if (typeof globalThis.PromiseRejectionEvent === "undefined") {
  class PromiseRejectionEventPolyfill extends Event {
    readonly reason: unknown;
    readonly promise: Promise<unknown>;
    constructor(type: string, init: PromiseRejectionEventInit) {
      super(type);
      this.reason = init.reason;
      this.promise = init.promise;
    }
  }
  (globalThis as { PromiseRejectionEvent: unknown }).PromiseRejectionEvent =
    PromiseRejectionEventPolyfill;
}

function dispatchErrorEvent(opts: { message?: string; error?: Error | null }): void {
  const init: ErrorEventInit = {
    message: opts.message ?? "",
    error: opts.error ?? null,
  };
  window.dispatchEvent(new ErrorEvent("error", init));
}

function dispatchRejectionEvent(reason: unknown): void {
  const promise = Promise.reject(reason);
  // swallow the rejection so jsdom/happy-dom doesn't complain
  promise.catch(() => {
    /* noop */
  });
  const init: PromiseRejectionEventInit = {
    reason,
    promise,
  };
  window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", init));
}

describe("installErrorBoundary - window error events", () => {
  let onError: ReturnType<typeof vi.fn<OnError>>;
  let uninstall: () => void;

  beforeEach(() => {
    onError = vi.fn<OnError>();
    uninstall = installErrorBoundary({ onError }).uninstall;
  });

  afterEach(() => {
    uninstall();
  });

  it("calls onError with error.message when ErrorEvent has an error object", () => {
    dispatchErrorEvent({ message: "outer", error: new Error("boom") });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("falls back to event.message when ErrorEvent.error is undefined", () => {
    dispatchErrorEvent({ message: "just-msg", error: null });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("just-msg");
  });

  it("falls back to 'Unknown error' when neither error.message nor event.message is set", () => {
    dispatchErrorEvent({ message: "", error: null });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Unknown error");
  });
});

describe("installErrorBoundary - unhandled promise rejections", () => {
  let onError: ReturnType<typeof vi.fn<OnError>>;
  let uninstall: () => void;

  beforeEach(() => {
    onError = vi.fn<OnError>();
    uninstall = installErrorBoundary({ onError }).uninstall;
  });

  afterEach(() => {
    uninstall();
  });

  it("calls onError with reason.message when reason is an Error", () => {
    dispatchRejectionEvent(new Error("async-boom"));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("async-boom");
  });

  it("calls onError with stringified reason when reason is a plain string", () => {
    dispatchRejectionEvent("string-reason");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("string-reason");
  });

  it("calls onError with stringified reason when reason is a number", () => {
    dispatchRejectionEvent(42);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("42");
  });
});

describe("installErrorBoundary - uninstall", () => {
  it("stops calling onError after uninstall for error events", () => {
    const onError = vi.fn<OnError>();
    const { uninstall } = installErrorBoundary({ onError });
    uninstall();
    dispatchErrorEvent({ message: "ignored", error: new Error("ignored") });
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops calling onError after uninstall for unhandledrejection events", () => {
    const onError = vi.fn<OnError>();
    const { uninstall } = installErrorBoundary({ onError });
    uninstall();
    dispatchRejectionEvent(new Error("ignored-async"));
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("installErrorBoundary - throwing handlers", () => {
  it("swallows onError throws on error events and keeps boundary alive for next event", () => {
    let callCount = 0;
    const onError = vi.fn(() => {
      callCount += 1;
      if (callCount === 1) throw new Error("handler-blew-up");
    });
    const { uninstall } = installErrorBoundary({ onError });

    expect(() => {
      dispatchErrorEvent({ message: "first", error: new Error("first") });
    }).not.toThrow();

    expect(() => {
      dispatchErrorEvent({ message: "second", error: new Error("second") });
    }).not.toThrow();

    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenNthCalledWith(1, "first");
    expect(onError).toHaveBeenNthCalledWith(2, "second");

    uninstall();
  });

  it("swallows onError throws on unhandledrejection events", () => {
    const onError = vi.fn(() => {
      throw new Error("handler-blew-up");
    });
    const { uninstall } = installErrorBoundary({ onError });

    expect(() => {
      dispatchRejectionEvent(new Error("reason"));
    }).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);

    uninstall();
  });
});
