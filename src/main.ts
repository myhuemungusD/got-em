import "./styles/tokens.css";
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
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort registration; intentionally swallow errors.
    });
  });
}
