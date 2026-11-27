import { Fragment, useEffect, useId, useState } from "react";
import { parseMarkdown, type Inline } from "../core/markdown";

function Inl({ inl }: { inl: Inline[] }) {
  return (
    <>
      {inl.map((x, i) =>
        x.t === "b" ? <strong key={i}>{x.v}</strong>
        : x.t === "i" ? <em key={i}>{x.v}</em>
        : x.t === "code" ? <code key={i}>{x.v}</code>
        : <Fragment key={i}>{x.v}</Fragment>,
      )}
    </>
  );
}

// Mermaid carregado sob demanda do CDN (permitido no artifact), versão fixa.
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";
type MermaidApi = {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, code: string): Promise<{ svg: string }>;
};
let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import(/* @vite-ignore */ MERMAID_URL).then((m: { default: MermaidApi }) => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    // htmlLabels false: rótulos em <text> SVG, que renderizam dentro de <img>.
    m.default.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, flowchart: { htmlLabels: false }, theme: dark ? "dark" : "neutral" });
    return m.default;
  });
  return mermaidPromise;
}

function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    loadMermaid()
      .then((m) => m.render(`mmd${id}`, code))
      .then((r) => vivo && setSvg(r.svg))
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
    };
  }, [code, id]);
  if (falhou) return <pre className="md-code"><code>{code}</code></pre>;
  if (!svg) return <div className="md-diagrama carregando-diagrama">Desenhando diagrama…</div>;
  // Exibido como <img>: SVG em imagem não executa script nem acessa a página.
  return (
    <div className="md-diagrama">
      <img alt="Diagrama gerado pelo agente" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />
    </div>
  );
}

export function Markdown({ texto }: { texto: string }) {
  const blocks = parseMarkdown(texto);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return <p key={i}><Inl inl={b.inl} /></p>;
          case "h":
            return <p key={i} className="md-h"><Inl inl={b.inl} /></p>;
          case "ul":
            return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inl inl={it} /></li>)}</ul>;
          case "ol":
            return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inl inl={it} /></li>)}</ol>;
          case "code":
            return b.lang === "mermaid" ? <Mermaid key={i} code={b.code} /> : <pre key={i} className="md-code"><code>{b.code}</code></pre>;
        }
      })}
    </div>
  );
}
