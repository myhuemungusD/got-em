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

export function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}
