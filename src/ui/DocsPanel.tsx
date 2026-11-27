import { useEffect, useMemo, useState } from "react";
import { searchDocs, type Doc } from "../core/memory";
import { Markdown } from "./Markdown";
import type { Services } from "./services";

const data = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");

export function DocsPanel({ services }: { services: Services }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function recarregar() {
    setDocs((await services.memory.load()).docs);
  }
  useEffect(() => {
    void recarregar();
  }, [services]);

  const lista = useMemo(() => {
    if (!docs) return [];
    const ordenados = [...docs].sort((a, b) => b.atualizadoEm - a.atualizadoEm);
    if (!busca.trim()) return ordenados;
    return searchDocs(docs, busca, Number.MAX_SAFE_INTEGER, docs.length);
  }, [docs, busca]);

  const nome = (id: string) => services.agents.get(id)?.nome ?? (id === "sintetizador" ? "#cloud" : id);

  async function copiar(d: Doc) {
    try {
      await navigator.clipboard.writeText(`# ${d.titulo}\n\n${d.conteudo}`);
      setCopiado(d.id);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* navegador recusou: sem cópia */
    }
  }

  if (!docs) return <section className="painel"><p>Carregando…</p></section>;

  return (
    <section className="painel">
      <h2>Docs</h2>
      <p className="ajuda">
        Sínteses curtas do que foi resolvido ou decidido. Criados no <code>/clear</code> (só quando vale a pena) ou com{" "}
        <code>/doc</code>. Os agentes consultam o doc relevante sozinhos, com busca local (0 tokens para buscar).
      </p>
      <input
        className="busca"
        type="search"
        placeholder="Buscar nos docs"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar nos docs"
      />
      {lista.length === 0 && (
        <p className="ajuda">{docs.length ? "Nenhum doc com esses termos." : "Nenhum doc ainda. Resolva algo com um agente e use /clear ou /doc."}</p>
      )}
      <ul className="docs">
        {lista.map((d) => (
          <li key={d.id} className={aberto === d.id ? "aberto" : ""}>
            <button className="doc-cabeca" onClick={() => setAberto(aberto === d.id ? null : d.id)} aria-expanded={aberto === d.id}>
              <strong>{d.titulo}</strong>
              <small>
                {nome(d.agentId)} · {data(d.atualizadoEm)}
                {d.tags.length ? ` · ${d.tags.join(", ")}` : ""}
              </small>
            </button>
            {aberto === d.id && (
              <div className="doc-corpo">
                <Markdown texto={d.conteudo} />
                <div className="faixa-acoes">
                  <button className="secundario" onClick={() => void copiar(d)}>{copiado === d.id ? "Copiado" : "Copiar"}</button>
                  <button className="secundario" onClick={() => void services.memory.removeDoc(d.id).then(recarregar)}>Excluir</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
