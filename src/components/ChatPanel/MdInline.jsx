import { MONO } from "./constants.js";

export default function MdInline({ text }) {
  const parts = [];
  let remaining = text;
  let k = 0;
  while (remaining.length > 0) {
    const bold   = /\*\*(.+?)\*\*/s.exec(remaining);
    const italic = /(?<!\*)\*([^*\n]+?)\*(?!\*)/.exec(remaining);
    const code   = /`([^`\n]+)`/.exec(remaining);
    const hits   = [
      bold   && { idx: bold.index,   match: bold,   type: "b" },
      italic && { idx: italic.index, match: italic, type: "i" },
      code   && { idx: code.index,   match: code,   type: "c" },
    ].filter(Boolean).sort((a, b) => a.idx - b.idx);
    if (!hits.length) { parts.push(remaining); break; }
    const { idx, match, type } = hits[0];
    if (idx > 0) parts.push(remaining.slice(0, idx));
    if (type === "b") parts.push(<strong key={k++} style={{ fontWeight: 700 }}>{match[1]}</strong>);
    else if (type === "i") parts.push(<em key={k++}>{match[1]}</em>);
    else parts.push(
      <code key={k++} style={{ fontFamily: MONO, fontSize: "0.88em", background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3 }}>{match[1]}</code>
    );
    remaining = remaining.slice(idx + match[0].length);
  }
  return <>{parts}</>;
}
