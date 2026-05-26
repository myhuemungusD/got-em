export function mount(root: HTMLElement): () => void {
  root.textContent = "setup-error screen — TODO";
  return () => {
    root.textContent = "";
  };
}
