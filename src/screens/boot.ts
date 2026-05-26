export function mount(root: HTMLElement): () => void {
  root.textContent = "boot screen — TODO";
  return () => {
    root.textContent = "";
  };
}
