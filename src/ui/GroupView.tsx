import { useEffect, useMemo, useState } from "react";
import { ImagesUnsupportedError } from "../adapters/claude";
import { BudgetExceededError } from "../core/budget";
import { loadConversation } from "../core/chat";
import { visibleFrom, type Conversation } from "../core/conversation";
import { groupKey, sendGroup, type GroupEvent } from "../core/group";
import { requestReplica } from "../core/replica";
import type { GroupDef } from "../core/groups";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { IconBroom, IconDoc, IconHash } from "./icons";
import { useTopic } from "./useTopic";
import { MessageList, type Row, type ThreadItem } from "./MessageList";
import type { Anexo } from "./prepareImage";
import { bloqueioMeta, type Services } from "./services";
import { votar } from "../core/feedback";

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
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [anexoEnviado, setAnexoEnviado] = useState<Anexo | null>(null);
  const [diagrama, setDiagrama] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarAntigas, setMostrarAntigas] = useState(false);
  const topico = useTopic(services, groupKey(group.id), "sintetizador", setConv, group.id);

  const [revisando, setRevisando] = useState(false);

  async function replica() {
    if (prog || revisando) return;
    setErro(null);
    setAviso("Agentes revisando a resposta…");
    setRevisando(true);
    try {
      const r = await requestReplica(services, group.id);
      setConv(r.conversa);
      setAviso(
        r.revisou
          ? `Réplica: ${r.objecoes.map((o) => nome(o.agentId)).join(", ")} apontou ajuste; síntese revisada.`
          : "Réplica: todos confirmaram a resposta. Nada mudou.",
      );
    } catch (e) {
      setAviso(null);
      setErro(e instanceof BudgetExceededError ? e.message : "Não consegui pedir a réplica agora.");
    } finally {
      setRevisando(false);
    }
  }

  async function comando(c: "clear" | "doc") {
    setErro(null);
    setAviso(c === "clear" ? "Arquivando e limpando…" : "Gerando doc…");
    setAviso(await topico.executar(c));
    setMostrarAntigas(false);
  }
  const nome = (id: string) => services.agents.get(id)?.nome ?? (id === "sintetizador" ? "Síntese" : id === "visao" ? "Visão" : id);

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
    if ((!t && !anexo) || prog) return;
    setErro(null);
    setAviso(null);
    const bloqueio = bloqueioMeta(services);
    if (bloqueio) {
      setErro(bloqueio);
      return;
    }
    setEnviado(t);
    setTexto("");
    const img = anexo;
    setAnexoEnviado(img);
    setAnexo(null);
    setProg({ falas: [] });
    try {
      const url = img ? await services.images.save(img.blob, img.thumb) : undefined;
      const r = await sendGroup(services, group.id, t, onEvent, {
        imagem: img ? { blob: img.blob, tokens: img.tokens, url } : undefined,
        diagrama,
      });
      setConv(r.conversa);
      setDiagrama(false);
      if (img) URL.revokeObjectURL(img.previewUrl);
    } catch (e) {
      setTexto(t);
      setAnexo(img);
      setErro(
        e instanceof BudgetExceededError || e instanceof ImagesUnsupportedError
          ? e.message
          : "O grupo não conseguiu responder. Tente de novo.",
      );
    } finally {
      setProg(null);
      setEnviado(null);
      setAnexoEnviado(null);
    }
  }

  // Falas internas viram "thread" da mensagem final que vem logo depois delas.
  const inicio = conv && !mostrarAntigas ? visibleFrom(conv) : 0;
  const rows = useMemo<Row[]>(() => {
    if (!conv) return [];
    const out: Row[] = [];
    let pend: ThreadItem[] = [];
    conv.mensagens.forEach((m, i) => {
      if (i < inicio) return;
      if (m.interna) {
        pend.push({ autorId: m.agentId ?? "", autorNome: nome(m.agentId ?? ""), texto: m.content, tokens: m.tokens });
        return;
      }
      const deUsuario = m.role === "user";
      out.push({
        key: `${i}-${m.at}`,
        autorId: deUsuario ? "voce" : m.agentId ?? "sintetizador",
        autorNome: deUsuario ? "Você" : m.replica ? "Síntese revisada" : nome(m.agentId ?? "sintetizador"),
        at: m.at,
        texto: m.content,
        tokens: deUsuario ? undefined : m.tokens,
        thread: pend.length ? pend : undefined,
        imagemUrl: m.imagem?.url,
        imagemTokens: m.imagem?.tokens,
        feedback: m.feedback,
        leve: !deUsuario && m.tier === "quick",
        onVoto: deUsuario ? undefined : async (v) => setConv(await votar(services.storage, groupKey(group.id), conv, i, v)),
      });
      pend = [];
    });
    // "Pedir réplica" só na última resposta final.
    const ultima = out.at(-1);
    if (ultima && ultima.autorId !== "voce") ultima.onReplica = () => void replica();
    return out;
  }, [conv, services, inicio]);

  const status = prog
    ? prog.falantes
      ? `${prog.viaMencao ? "Chamados por @menção" : "Moderador chamou"}: ${prog.falantes.map(nome).join(", ")}`
      : "Moderador escolhendo quem responde…"
    : null;

  const extra = prog ? (
    <>
      <article className="msg pendente">
        <div className="msg-lado"><Avatar id="voce" label="Eu" /></div>
        <div className="msg-corpo">
          <header><strong>Você</strong></header>
          {anexoEnviado && <img className="msg-img" src={anexoEnviado.thumb} alt="Imagem enviada" />}
          {enviado && <p>{enviado}</p>}
        </div>
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
        <div className="canal-acoes">
          <button onClick={() => void comando("doc")} disabled={topico.ocupado || !!prog} title="Cria um doc do assunto atual (/doc)">
            <IconDoc /> Gerar doc
          </button>
          <button onClick={() => void comando("clear")} disabled={topico.ocupado || !!prog} title="Limpa a conversa e guarda o que importa na memória (/clear)">
            <IconBroom /> Limpar
          </button>
        </div>
      </header>

      <MessageList
        rows={rows}
        ocultas={conv ? { n: visibleFrom(conv), mostrando: mostrarAntigas, alternar: () => setMostrarAntigas((v) => !v) } : undefined}
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

      {aviso && <p className="faixa faixa-aviso">{aviso}</p>}
      {erro && <p className="faixa faixa-erro">{erro}</p>}

      <Composer
        valor={texto}
        placeholder={`Mensagem para #${group.nome.toLowerCase()}`}
        desabilitado={!!prog || topico.ocupado || revisando}
        anexo={anexo}
        diagrama={diagrama}
        onAnexo={setAnexo}
        onDiagrama={setDiagrama}
        onChange={setTexto}
        onEnviar={() => void enviar()}
        onComando={(c) => void comando(c)}
      />
    </section>
  );
}
