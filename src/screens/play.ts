export function mount(root: HTMLElement): () => void {
  root.textContent = "play screen — TODO";
  return () => {
    root.textContent = "";
  };
}
