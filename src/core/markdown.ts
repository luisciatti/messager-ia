/**
 * Markdown leve, sem HTML: vira blocos que a UI renderiza como elementos React
 * (nunca innerHTML), então texto do modelo não injeta markup.
 */

export type Inline = { t: "txt" | "b" | "code" | "i"; v: string };
export type Block =
  | { t: "p"; inl: Inline[] }
  | { t: "h"; inl: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "code"; lang: string; code: string };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ t: "txt", v: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ t: "b", v: tok.slice(2, -2) });
    else if (tok.startsWith("`")) out.push({ t: "code", v: tok.slice(1, -1) });
    else out.push({ t: "i", v: tok.slice(1, -1) });
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push({ t: "txt", v: text.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", inl: parseInline(para.join("\n")) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      blocks.push({ t: "code", lang: fence[1].toLowerCase(), code: code.join("\n") });
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ t: "h", inl: parseInline(h[1]) });
      continue;
    }
    const li = line.match(/^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/);
    if (li) {
      flush();
      const tipo = li[1] ? "ul" : "ol";
      const prev = blocks.at(-1);
      const item = parseInline(li[3]);
      if (prev && prev.t === tipo) prev.items.push(item);
      else blocks.push({ t: tipo, items: [item] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}
