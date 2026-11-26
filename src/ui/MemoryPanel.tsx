import { useEffect, useState } from "react";
import { NUCLEO_MAX_TOKENS, nucleoTokens, type Memoria } from "../core/memory";
import type { Services } from "./services";

const data = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");

export function MemoryPanel({ services }: { services: Services }) {
  const [mem, setMem] = useState<Memoria | null>(null);
  const [nucleo, setNucleo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function recarregar() {
    const m = await services.memory.load();
    setMem(m);
    setNucleo(m.nucleo.join("\n"));
  }

  useEffect(() => {
    void recarregar();
  }, [services]);

  const fatos = nucleo.split("\n");
  const tokens = nucleoTokens(fatos.map((f) => f.trim()).filter(Boolean));

  async function salvar() {
    setMsg(null);
    try {
      await services.memory.saveNucleo(fatos);
      setMsg("Núcleo salvo.");
      await recarregar();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (!mem) return <section className="painel"><p>Carregando…</p></section>;

  return (
    <section className="painel">
      <h2>Memória</h2>

      <h3>Núcleo do ambiente</h3>
      <p className="ajuda">Vai em toda conversa. Um fato por linha, curto (ex.: "Tasy roda na OCI").</p>
      <textarea rows={5} value={nucleo} onChange={(e) => setNucleo(e.target.value)} />
      <div className="linha">
        <span className={tokens > NUCLEO_MAX_TOKENS ? "alerta" : "ajuda"}>
          ~{tokens}/{NUCLEO_MAX_TOKENS} tokens por chamada
        </span>
        <button onClick={() => void salvar()} disabled={tokens > NUCLEO_MAX_TOKENS}>Salvar</button>
      </div>
      {msg && <p className="ajuda">{msg}</p>}

      <h3>Notas ({mem.notas.length})</h3>
      <p className="ajuda">Extraídas das conversas. Só entram no prompt quando a pergunta tem a ver (busca local, 0 tokens).</p>
      {mem.notas.length === 0 && <p className="ajuda">Nenhuma ainda.</p>}
      <ul className="itens">
        {[...mem.notas].reverse().map((n) => (
          <li key={n.id}>
            <span>{n.texto}</span>
            <small>{n.agentId} · {data(n.criadaEm)}</small>
            <button
              className="remover"
              aria-label="Remover nota"
              onClick={() => void services.memory.removeNota(n.id).then(recarregar)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <h3>Respostas fixadas ({mem.fixadas.length})</h3>
      <p className="ajuda">Oferecidas para reaproveitar quando você pergunta algo parecido (0 tokens).</p>
      {mem.fixadas.length === 0 && <p className="ajuda">Use o 📌 numa resposta para fixar.</p>}
      <ul className="itens">
        {[...mem.fixadas].reverse().map((f) => (
          <li key={f.id}>
            <span><strong>{f.pergunta}</strong></span>
            <small>{f.agentId} · {data(f.criadaEm)}</small>
            <button
              className="remover"
              aria-label="Remover fixada"
              onClick={() => void services.memory.removeFixada(f.id).then(recarregar)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
