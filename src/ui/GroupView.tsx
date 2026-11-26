import { useEffect, useRef, useState } from "react";
import { BudgetExceededError } from "../core/budget";
import { loadConversation } from "../core/chat";
import type { Conversation } from "../core/conversation";
import { groupKey, sendGroup, type GroupEvent } from "../core/group";
import type { GroupDef } from "../core/groups";
import type { Services } from "./services";
import { Avatar } from "./Avatar";

interface Progresso {
  falantes?: string[];
  viaMencao?: boolean;
  falas: { agentId: string; texto: string; passou: boolean }[];
  sintese?: string;
}

export function GroupView({ services, group }: { services: Services; group: GroupDef }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [texto, setTexto] = useState("");
  const [prog, setProg] = useState<Progresso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const nome = (id: string) => services.agents.get(id)?.nome ?? id;

  useEffect(() => {
    let vivo = true;
    loadConversation(services.storage, groupKey(group.id)).then((c) => vivo && setConv(c));
    return () => {
      vivo = false;
    };
  }, [services, group.id]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [conv, prog]);

  const enviando = prog !== null;

  function onEvent(e: GroupEvent) {
    setProg((p) => {
      const base = p ?? { falas: [] };
      if (e.tipo === "falantes") return { ...base, falantes: e.ids, viaMencao: e.viaMencao };
      if (e.tipo === "fala") return { ...base, falas: [...base.falas, e] };
      return { ...base, sintese: e.texto };
    });
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setErro(null);
    setProg({ falas: [] });
    try {
      const r = await sendGroup(services, group.id, t, onEvent);
      setConv(r.conversa);
      setTexto("");
    } catch (e) {
      setErro(e instanceof BudgetExceededError ? e.message : "O grupo não conseguiu responder. Tente de novo.");
    } finally {
      setProg(null);
    }
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <Avatar id="grupo" label={group.nome} />
        <div>
          <strong>{group.nome}</strong>
          <small>{group.membros.map(nome).join(", ")} · use @{group.membros[0]} para chamar direto</small>
        </div>
      </header>

      <div className="mensagens">
        {!conv && <p className="vazio">Carregando…</p>}
        {conv?.resumo && <p className="resumo">Mensagens antigas resumidas para economizar tokens.</p>}
        {conv?.mensagens.map((m, i) => (
          <div key={i} className={`bolha ${m.role} ${m.interna ? "interna" : ""}`}>
            {m.role === "assistant" && <span className="autor">{nome(m.agentId ?? "")}</span>}
            <p>{m.content}</p>
            {m.role === "assistant" && <small>~{m.tokens ?? 0} tok{m.interna ? " · fala interna" : ""}</small>}
          </div>
        ))}
        {enviando && (
          <>
            <div className="bolha user pendente">
              <p>{texto}</p>
            </div>
            <p className="resumo">
              {prog.falantes
                ? `${prog.viaMencao ? "Chamados por @menção" : "Moderador chamou"}: ${prog.falantes.map(nome).join(", ")}`
                : "Moderador escolhendo quem responde…"}
            </p>
            {prog.falas.map((f) => (
              <div key={f.agentId} className="bolha assistant interna">
                <span className="autor">{nome(f.agentId)}</span>
                <p>{f.passou ? "PASSO (nada novo a acrescentar)" : f.texto}</p>
              </div>
            ))}
            {prog.sintese !== undefined && (
              <div className="bolha assistant">
                <span className="autor">Síntese</span>
                <p>{prog.sintese || "escrevendo…"}</p>
              </div>
            )}
          </>
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
          placeholder={`Mensagem para o grupo ${group.nome}`}
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
