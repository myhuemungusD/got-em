export function mount(root: HTMLElement): () => void {
  root.textContent = "gameover screen — TODO";
  return () => {
    root.textContent = "";
  };
}
