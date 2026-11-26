import { useEffect, useRef, useState } from "react";
import { BudgetExceededError } from "../core/budget";
import { directKey, loadConversation, sendDirect, useSaved } from "../core/chat";
import type { Conversation } from "../core/conversation";
import type { AgentDef } from "../core/agents";
import { findFixada, type Fixada } from "../core/memory";
import type { Services } from "./services";
import { Avatar } from "./Avatar";

export function ChatView({ services, agent }: { services: Services; agent: AgentDef }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [texto, setTexto] = useState("");
  const [parcial, setParcial] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<Fixada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
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

  async function enviar(ignorarFixada = false) {
    const t = texto.trim();
    if (!t || enviando) return;
    setErro(null);
    setAviso(null);
    if (!ignorarFixada) {
      const f = findFixada((await services.memory.load()).fixadas, agent.id, t);
      if (f) {
        setSugestao(f);
        return;
      }
    }
    setSugestao(null);
    setParcial("");
    try {
      const r = await sendDirect(services, agent.id, t, setParcial);
      setConv(r.conversa);
      setTexto("");
      if (r.notasUsadas) setAviso(`Usou ${r.notasUsadas} nota(s) da memória.`);
    } catch (e) {
      setErro(e instanceof BudgetExceededError ? e.message : "Não consegui falar com o agente. Tente de novo.");
    } finally {
      setParcial(null);
    }
  }

  async function usarFixada(f: Fixada) {
    setConv(await useSaved(services, agent.id, texto.trim(), f));
    setTexto("");
    setSugestao(null);
    setAviso("Resposta reaproveitada: 0 tokens.");
  }

  async function fixar(i: number) {
    if (!conv) return;
    const resposta = conv.mensagens[i];
    const pergunta = [...conv.mensagens.slice(0, i)].reverse().find((m) => m.role === "user");
    if (!pergunta) return;
    await services.memory.fixar({ agentId: agent.id, pergunta: pergunta.content, resposta: resposta.content, criadaEm: Date.now() });
    setAviso("Resposta fixada na memória.");
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
            {m.role === "assistant" && (
              <small>
                {m.reaproveitada ? "reaproveitada · 0 tok" : `~${m.tokens ?? 0} tok`}
                {!m.reaproveitada && (
                  <button className="fixar" title="Fixar resposta na memória" onClick={() => void fixar(i)}>
                    📌
                  </button>
                )}
              </small>
            )}
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

      {sugestao && (
        <div className="sugestao">
          <p>
            Tenho uma resposta fixada em {new Date(sugestao.criadaEm).toLocaleDateString("pt-BR")} para algo parecido:
            <em> "{sugestao.pergunta}"</em>
          </p>
          <div className="linha">
            <button onClick={() => void usarFixada(sugestao)}>Usar (0 tokens)</button>
            <button className="secundario" onClick={() => void enviar(true)}>Perguntar mesmo assim</button>
          </div>
        </div>
      )}
      {aviso && <p className="aviso">{aviso}</p>}
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
          onChange={(e) => {
            setTexto(e.target.value);
            setSugestao(null);
          }}
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
