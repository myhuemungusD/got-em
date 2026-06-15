import "./styles/tokens.css";
import "./styles/a11y.css";
import "./styles/splash.css";
import { startRouter } from "./router";
import { installErrorBoundary } from "./error-boundary";
import { setState, type Screen } from "./state";

installErrorBoundary({
  onError: (message) => {
    setState({ screen: "setup-error", lastError: message });
  },
});

startRouter({
  getScreenRoot: (name: Screen) => document.getElementById(`screen-${name}`),
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showUpdateToast(registration);
            }
          });
        });
      })
      .catch(() => {
        // Best-effort registration; intentionally swallow errors.
      });
  });
}

function showUpdateToast(registration: ServiceWorkerRegistration): void {
  const existing = document.getElementById("sw-update-toast");
  if (existing) return;

  const toast = document.createElement("div");
  toast.id = "sw-update-toast";
  toast.setAttribute("role", "alert");
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "0",
    left: "0",
    right: "0",
    zIndex: "9999",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    padding: "14px 20px",
    background: "#141414",
    borderTop: "1px solid #ff6b00",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    color: "#e0e0e0",
  });

  const label = document.createElement("span");
  label.textContent = "New version available";

  const btn = document.createElement("button");
  btn.textContent = "Refresh";
  btn.type = "button";
  Object.assign(btn.style, {
    padding: "8px 18px",
    border: "none",
    borderRadius: "6px",
    background: "#ff6b00",
    color: "#0a0a0a",
    fontFamily: "inherit",
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.05em",
    cursor: "pointer",
  });

  btn.addEventListener("click", () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  });

  toast.append(label, btn);
  document.body.appendChild(toast);
}
