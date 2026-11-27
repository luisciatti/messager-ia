import { useEffect, useMemo, useState } from "react";
import { BudgetExceededError } from "../core/budget";
import { loadConversation } from "../core/chat";
import type { Conversation } from "../core/conversation";
import { groupKey, sendGroup, type GroupEvent } from "../core/group";
import type { GroupDef } from "../core/groups";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { IconHash } from "./icons";
import { MessageList, type Row, type ThreadItem } from "./MessageList";
import type { Services } from "./services";

interface Progresso {
  falantes?: string[];
  viaMencao?: boolean;
  falas: { agentId: string; texto: string; passou: boolean }[];
  sintese?: string;
}

export function GroupView({ services, group }: { services: Services; group: GroupDef }) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [prog, setProg] = useState<Progresso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nome = (id: string) => services.agents.get(id)?.nome ?? (id === "sintetizador" ? "Síntese" : id);

  useEffect(() => {
    let vivo = true;
    loadConversation(services.storage, groupKey(group.id)).then((c) => vivo && setConv(c));
    return () => {
      vivo = false;
    };
  }, [services, group.id]);

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
    if (!t || prog) return;
    setErro(null);
    setEnviado(t);
    setTexto("");
    setProg({ falas: [] });
    try {
      const r = await sendGroup(services, group.id, t, onEvent);
      setConv(r.conversa);
    } catch (e) {
      setTexto(t);
      setErro(e instanceof BudgetExceededError ? e.message : "O grupo não conseguiu responder. Tente de novo.");
    } finally {
      setProg(null);
      setEnviado(null);
    }
  }

  // Falas internas viram "thread" da mensagem final que vem logo depois delas.
  const rows = useMemo<Row[]>(() => {
    if (!conv) return [];
    const out: Row[] = [];
    let pend: ThreadItem[] = [];
    conv.mensagens.forEach((m, i) => {
      if (m.interna) {
        pend.push({ autorId: m.agentId ?? "", autorNome: nome(m.agentId ?? ""), texto: m.content, tokens: m.tokens });
        return;
      }
      const deUsuario = m.role === "user";
      out.push({
        key: `${i}-${m.at}`,
        autorId: deUsuario ? "voce" : m.agentId ?? "sintetizador",
        autorNome: deUsuario ? "Você" : nome(m.agentId ?? "sintetizador"),
        at: m.at,
        texto: m.content,
        tokens: deUsuario ? undefined : m.tokens,
        thread: pend.length ? pend : undefined,
      });
      pend = [];
    });
    return out;
  }, [conv, services]);

  const status = prog
    ? prog.falantes
      ? `${prog.viaMencao ? "Chamados por @menção" : "Moderador chamou"}: ${prog.falantes.map(nome).join(", ")}`
      : "Moderador escolhendo quem responde…"
    : null;

  const extra = prog ? (
    <>
      <article className="msg pendente">
        <div className="msg-lado"><Avatar id="voce" label="Eu" /></div>
        <div className="msg-corpo"><header><strong>Você</strong></header><p>{enviado}</p></div>
      </article>
      <p className="status">{status}</p>
      {prog.falas.map((f) => (
        <article key={f.agentId} className="msg msg-fala">
          <div className="msg-lado"><Avatar id={f.agentId} label={nome(f.agentId)} size={28} /></div>
          <div className="msg-corpo">
            <header><strong>{nome(f.agentId)}</strong><span className="meta">fala</span></header>
            <p>{f.passou ? "PASSO: nada novo a acrescentar." : f.texto}</p>
          </div>
        </article>
      ))}
      {prog.sintese !== undefined && (
        <article className="msg">
          <div className="msg-lado"><Avatar id="sintetizador" label="Síntese" /></div>
          <div className="msg-corpo"><header><strong>Síntese</strong></header><p>{prog.sintese || "escrevendo…"}</p></div>
        </article>
      )}
    </>
  ) : undefined;

  return (
    <section className="canal">
      <header className="canal-topo">
        <div className="canal-titulo">
          <IconHash />
          <h1>{group.nome.toLowerCase()}</h1>
          <span className="membros">
            {group.membros.map((id) => <Avatar key={id} id={id} label={nome(id)} size={20} />)}
            <small>{group.membros.length}</small>
          </span>
        </div>
        <p className="canal-desc">
          {group.membros.map(nome).join(", ")} · use @{group.membros[0]} para chamar alguém direto
        </p>
      </header>

      <MessageList
        rows={rows}
        extra={extra}
        vazio={
          <>
            <span className="vazio-icone"><IconHash /></span>
            <h2>Este é o início de #{group.nome.toLowerCase()}</h2>
            <p>
              O moderador escolhe quem responde. Use @{group.membros.join(", @")} para chamar direto e economizar uma
              chamada.
            </p>
          </>
        }
      />

      {erro && <p className="faixa faixa-erro">{erro}</p>}

      <Composer
        valor={texto}
        placeholder={`Mensagem para #${group.nome.toLowerCase()}`}
        desabilitado={!!prog}
        onChange={setTexto}
        onEnviar={() => void enviar()}
      />
    </section>
  );
}
