import { useEffect, useRef, useState } from "react";
import { BudgetExceededError } from "../core/budget";
import { directKey, loadConversation, sendDirect } from "../core/chat";
import type { Conversation } from "../core/conversation";
import type { AgentDef } from "../core/agents";
import type { Services } from "./services";
import { Avatar } from "./Avatar";

export function ChatView({ services, agent }: { services: Services; agent: AgentDef }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [texto, setTexto] = useState("");
  const [parcial, setParcial] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    setConv(null);
    loadConversation(services.storage, directKey(agent.id)).then((c) => vivo && setConv(c));
    return () => {
      vivo = false;
    };
  }, [services, agent.id]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [conv, parcial]);

  const enviando = parcial !== null;

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setErro(null);
    setParcial("");
    try {
      const r = await sendDirect(services, agent.id, t, setParcial);
      setConv(r.conversa);
      setTexto("");
    } catch (e) {
      setErro(e instanceof BudgetExceededError ? e.message : "Não consegui falar com o agente. Tente de novo.");
    } finally {
      setParcial(null);
    }
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <Avatar id={agent.id} label={agent.nome} />
        <div>
          <strong>{agent.nome}</strong>
          <small>{agent.skills.join(" · ")}</small>
        </div>
      </header>

      <div className="mensagens">
        {!conv && <p className="vazio">Carregando…</p>}
        {conv?.resumo && <p className="resumo">Mensagens antigas resumidas para economizar tokens.</p>}
        {conv?.mensagens.map((m, i) => (
          <div key={i} className={`bolha ${m.role}`}>
            <p>{m.content}</p>
            {m.tokens !== undefined && <small>~{m.tokens} tok</small>}
          </div>
        ))}
        {enviando && (
          <div className="bolha user pendente">
            <p>{texto}</p>
          </div>
        )}
        {enviando && (
          <div className="bolha assistant">
            <p>{parcial || "digitando…"}</p>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {erro && <p className="erro">{erro}</p>}

      <form
        className="entrada"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <textarea
          value={texto}
          placeholder={`Mensagem para ${agent.nome}`}
          rows={1}
          disabled={enviando}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
        />
        <button type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}
