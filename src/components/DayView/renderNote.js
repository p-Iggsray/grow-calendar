export function renderNote(raw) {
  if (!raw?.trim()) return "";
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
  const lines = raw.split("\n");
  const parts = [];
  let inList = false;
  for (const line of lines) {
    const t = line.trimEnd();
    if (/^[-*] /.test(t)) {
      if (!inList) { parts.push("<ul>"); inList = true; }
      parts.push(`<li>${inline(t.slice(2))}</li>`);
    } else {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push(t ? `<p>${inline(t)}</p>` : "<br>");
    }
  }
  if (inList) parts.push("</ul>");
  return parts.join("");
}
