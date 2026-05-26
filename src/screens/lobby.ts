export function mount(root: HTMLElement): () => void {
  root.textContent = "lobby screen — TODO";
  return () => {
    root.textContent = "";
  };
}
