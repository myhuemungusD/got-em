const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => MAP[c] ?? c);
}
