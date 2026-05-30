import { state, subscribe } from "../state";

export function mount(root: HTMLElement): () => void {
  const wrapper = document.createElement("div");
  wrapper.className = "setup-error";

  const heading = document.createElement("h1");
  heading.textContent = "Something went wrong";

  const msg = document.createElement("p");
  msg.className = "setup-error__msg";
  msg.textContent = state.lastError ?? "Unknown error";

  const button = document.createElement("button");
  button.id = "setup-error-reload";
  button.className = "setup-error__btn";
  button.type = "button";
  button.textContent = "Reload";

  const onClick = (): void => {
    window.location.reload();
  };
  button.addEventListener("click", onClick);

  wrapper.append(heading, msg, button);
  root.replaceChildren(wrapper);

  let lastRendered = state.lastError;
  const unsubscribe = subscribe((s) => {
    if (s.lastError !== lastRendered) {
      msg.textContent = s.lastError ?? "Unknown error";
      lastRendered = s.lastError;
    }
  });

  return () => {
    unsubscribe();
    button.removeEventListener("click", onClick);
    root.replaceChildren();
  };
}
