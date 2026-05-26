export function mount(root: HTMLElement): () => void {
  root.textContent = "mode-select screen — TODO";
  return () => {
    root.textContent = "";
  };
}
