export function mount(root: HTMLElement): () => void {
  root.textContent = "splash screen — TODO";
  return () => {
    root.textContent = "";
  };
}
