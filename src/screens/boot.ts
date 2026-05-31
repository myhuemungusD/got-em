import "../styles/boot.css";
import { setState, state } from "../state";
import { ensureAuth, getCodeFromUrl, loadSavedName } from "../auth";

const BOOT_HTML = `
  <div class="boot">
    <div class="boot-spinner" role="status" aria-label="Loading"></div>
    <div class="boot-label">Loading…</div>
  </div>
`;

export function mount(root: HTMLElement): () => void {
  root.innerHTML = BOOT_HTML;

  let cancelled = false;

  // mount() must return a cleanup synchronously, so identity setup runs in a
  // voided async IIFE. Any failure routes to the setup-error screen rather
  // than surfacing as an unhandled rejection.
  void (async (): Promise<void> => {
    const uid = await ensureAuth();
    if (cancelled) return;

    const savedName = loadSavedName();
    setState({
      myUid: uid,
      ...(savedName && !state.myName ? { myName: savedName } : {}),
    });

    // Deep-link entry: stash any room code so it isn't lost, then hand off to
    // splash, which surfaces the invite banner and the accept-invite flow.
    const code = getCodeFromUrl();
    if (code) {
      setState({ currentRoom: code });
    }

    setState({ screen: "splash" });
  })().catch((err: unknown) => {
    if (cancelled) return;
    const message = err instanceof Error ? err.message : String(err);
    setState({ screen: "setup-error", lastError: message });
  });

  return () => {
    cancelled = true;
    root.innerHTML = "";
  };
}
