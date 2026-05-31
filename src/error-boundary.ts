export interface ErrorBoundaryOptions {
  onError: (message: string) => void;
}

export interface ErrorBoundary {
  uninstall: () => void;
}

function safeInvoke(onError: (message: string) => void, message: string): void {
  try {
    onError(message);
  } catch {
    // Never let the boundary become its own crash source.
  }
}

function messageFromRejection(reason: unknown): string {
  if (reason && typeof reason === "object" && "message" in reason) {
    const m = (reason as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  if (reason === undefined || reason === null) {
    return "Unhandled promise rejection";
  }
  const str = String(reason);
  return str.length > 0 ? str : "Unhandled promise rejection";
}

export function installErrorBoundary(
  opts: ErrorBoundaryOptions,
): ErrorBoundary {
  const onErrorEvent = (e: ErrorEvent): void => {
    const fromError =
      e.error && typeof e.error === "object" && "message" in e.error
        ? (e.error as { message: unknown }).message
        : undefined;
    const msg =
      (typeof fromError === "string" && fromError.length > 0
        ? fromError
        : null) ??
      (typeof e.message === "string" && e.message.length > 0
        ? e.message
        : null) ??
      "Unknown error";
    safeInvoke(opts.onError, msg);
  };

  const onRejection = (e: PromiseRejectionEvent): void => {
    safeInvoke(opts.onError, messageFromRejection(e.reason));
  };

  window.addEventListener("error", onErrorEvent);
  window.addEventListener("unhandledrejection", onRejection);

  return {
    uninstall: () => {
      window.removeEventListener("error", onErrorEvent);
      window.removeEventListener("unhandledrejection", onRejection);
    },
  };
}
