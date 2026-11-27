import { useEffect, useMemo, useState } from "react";
import type { AgentDef } from "../core/agents";
import { ImagesUnsupportedError } from "../adapters/claude";
import { BudgetExceededError } from "../core/budget";
import { directKey, loadConversation, retryLast, sendDirect, useSaved } from "../core/chat";
import { visibleFrom, type Conversation } from "../core/conversation";
import { findFixada, type Fixada } from "../core/memory";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { IconBroom, IconDoc } from "./icons";
import { useTopic } from "./useTopic";
import { MessageList, type Row } from "./MessageList";
import type { Anexo } from "./prepareImage";
import { bloqueioMeta, recarregarAgentes, type Services } from "./services";
import { removeCustomAgent } from "../core/customAgents";
import { votar } from "../core/feedback";
import { precisaFontes, SemFontesError, ultimaResposta, verificarNaWeb } from "../core/fontes";
import { useWeb } from "./useWeb";
import { WebSearchError } from "../adapters/webSearch";

export function ChatView({ services, agent, onRemovido }: { services: Services; agent: AgentDef; onRemovido?: () => void }) {
  const custom = (agent as { custom?: boolean }).custom === true;
  const [confirmar, setConfirmar] = useState(false);

  async function excluir() {
    if (!confirmar) {
      setConfirmar(true);
      return;
    }
    await removeCustomAgent(services.storage, agent.id);
    await recarregarAgentes(services);
    onRemovido?.();
  }
  const [conv, setConv] = useState<Conversation | null>(null);
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [parcial, setParcial] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<Fixada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [diagrama, setDiagrama] = useState(false);
  const [anexoEnviado, setAnexoEnviado] = useState<Anexo | null>(null);
  const [mostrarAntigas, setMostrarAntigas] = useState(false);
  const topico = useTopic(services, directKey(agent.id), agent.id, setConv);

  async function comando(c: "clear" | "doc") {
    setErro(null);
    setAviso(c === "clear" ? "Arquivando e limpando…" : "Gerando doc…");
    setAviso(await topico.executar(c));
    setMostrarAntigas(false);
  }

  useEffect(() => {
    let vivo = true;
    loadConversation(services.storage, directKey(agent.id)).then((c) => vivo && setConv(c));
    return () => {
      vivo = false;
    };
  }, [services, agent.id]);

  const enviando = parcial !== null;

  async function enviar(ignorarFixada = false) {
    const t = texto.trim();
    if ((!t && !anexo) || enviando) return;
    setErro(null);
    setAviso(null);
    const bloqueio = bloqueioMeta(services);
    if (bloqueio) {
      setErro(bloqueio);
      return;
    }
    if (!ignorarFixada && !anexo) {
      const f = findFixada((await services.memory.load()).fixadas, agent.id, t);
      if (f) {
        setSugestao(f);
        return;
      }
    }
    setSugestao(null);
    setEnviado(t);
    setTexto("");
    const img = anexo;
    setAnexoEnviado(img);
    setAnexo(null);
    setParcial("");
    try {
      const url = img ? await services.images.save(img.blob, img.thumb) : undefined;
      const r = await sendDirect(services, agent.id, t, setParcial, {
        imagem: img ? { blob: img.blob, tokens: img.tokens, url } : undefined,
        diagrama,
      });
      setConv(r.conversa);
      setDiagrama(false);
      if (img) URL.revokeObjectURL(img.previewUrl);
      const usou = [r.notasUsadas ? `${r.notasUsadas} nota(s)` : "", ...r.docsUsados.map((d) => `doc "${d}"`)].filter(Boolean);
      if (usou.length) setAviso(`Consultou a memória: ${usou.join(", ")}.`);
    } catch (e) {
      setTexto(t);
      setAnexo(img);
      setErro(
        e instanceof BudgetExceededError || e instanceof ImagesUnsupportedError
          ? e.message
          : "Não consegui falar com o agente. Tente de novo.",
      );
    } finally {
      setParcial(null);
      setEnviado(null);
      setAnexoEnviado(null);
    }
  }

  async function refazer() {
    if (enviando || !conv) return;
    setErro(null);
    setAviso(null);
    // mostra a pergunta de novo como pendente, sem a resposta antiga
    setEnviado(conv.mensagens.at(-2)?.content ?? "");
    setConv({ ...conv, mensagens: conv.mensagens.slice(0, -2) });
    setParcial("");
    try {
      const r = await retryLast(services, agent.id, "default", setParcial);
      setConv(r.conversa);
    } catch {
      setErro("Não consegui refazer agora.");
      setConv(await loadConversation(services.storage, directKey(agent.id)));
    } finally {
      setParcial(null);
      setEnviado(null);
    }
  }

  const webOk = useWeb(services);
  const [verificando, setVerificando] = useState(false);
  async function verificar() {
    if (enviando || verificando || !services.web) return;
    setErro(null);
    setAviso("Buscando fontes na web…");
    setVerificando(true);
    try {
      const r = await verificarNaWeb({ ...services, web: services.web }, directKey(agent.id));
      setConv(r.conversa);
      setAviso(`Resposta revisada com ${r.fontes.length} fonte(s).`);
    } catch (e) {
      setAviso(null);
      setErro(e instanceof BudgetExceededError || e instanceof SemFontesError || e instanceof WebSearchError ? e.message : "Não consegui verificar agora.");
    } finally {
      setVerificando(false);
    }
  }

  async function usarFixada(f: Fixada) {
    setConv(await useSaved(services, agent.id, texto.trim(), f));
    setTexto("");
    setSugestao(null);
    setAviso("Resposta reaproveitada: 0 tokens.");
  }

  const inicio = conv && !mostrarAntigas ? visibleFrom(conv) : 0;
  const rows = useMemo<Row[]>(() => {
    if (!conv) return [];
    return conv.mensagens.slice(inicio).map((m, j) => {
      const i = j + inicio;
      const deUsuario = m.role === "user";
      const row: Row = {
        key: `${i}-${m.at}`,
        autorId: deUsuario ? "voce" : agent.id,
        autorNome: deUsuario ? "Você" : agent.nome,
        at: m.at,
        texto: m.content,
        tokens: deUsuario ? undefined : m.tokens,
        reaproveitada: m.reaproveitada,
        imagemUrl: m.imagem?.url,
        imagemTokens: m.imagem?.tokens,
        feedback: m.feedback,
        leve: !deUsuario && m.tier === "quick",
        fontes: m.fontes,
      };
      if (!deUsuario && !m.reaproveitada) {
        row.onVoto = async (v) => setConv(await votar(services.storage, directKey(agent.id), conv, i, v));
      }
      if (!deUsuario && m.tier === "quick" && i === conv.mensagens.length - 1 && !conv.mensagens[i - 1]?.imagem) {
        row.onRefazer = () => void refazer();
      }
      if (webOk && !verificando && !m.fontes && ultimaResposta(conv)?.iResposta === i) {
        const pergunta = conv.mensagens[i - 1]?.content ?? "";
        row.onVerificar = () => void verificar();
        row.verificarDestaque = precisaFontes(pergunta);
      }
      if (!deUsuario && !m.reaproveitada) {
        row.onPin = async () => {
          const pergunta = [...conv.mensagens.slice(0, i)].reverse().find((x) => x.role === "user");
          if (!pergunta) return;
          await services.memory.fixar({ agentId: agent.id, pergunta: pergunta.content, resposta: m.content, criadaEm: Date.now() });
          setAviso("Resposta fixada na memória.");
        };
      }
      return row;
    });
  }, [conv, agent, services, inicio, webOk, verificando]);

  const pendentes: Row[] = enviando
    ? [
        {
          key: "p-user", autorId: "voce", autorNome: "Você", at: Date.now(), texto: enviado ?? "", pendente: true,
          imagemUrl: anexoEnviado?.thumb, imagemTokens: anexoEnviado?.tokens,
        },
        { key: "p-agent", autorId: agent.id, autorNome: agent.nome, at: Date.now(), texto: parcial || "digitando…", pendente: !parcial },
      ]
    : [];

  return (
    <section className="canal">
      <header className="canal-topo">
        <div className="canal-titulo">
          <Avatar id={agent.id} label={agent.nome} size={24} />
          <h1>{agent.nome}</h1>
        </div>
        <p className="canal-desc">{agent.skills.join(" · ")}</p>
        <div className="canal-acoes">
          <button onClick={() => void comando("doc")} disabled={topico.ocupado || enviando} title="Cria um doc do assunto atual (/doc)">
            <IconDoc /> Gerar doc
          </button>
          <button onClick={() => void comando("clear")} disabled={topico.ocupado || enviando} title="Limpa a conversa e guarda o que importa na memória (/clear)">
            <IconBroom /> Limpar
          </button>
          {custom && (
            <button onClick={() => void excluir()} onBlur={() => setConfirmar(false)} className={confirmar ? "perigo" : ""}>
              {confirmar ? "Confirmar exclusão" : "Excluir agente"}
            </button>
          )}
        </div>
      </header>

      <MessageList
        rows={[...rows, ...pendentes]}
        ocultas={conv ? { n: visibleFrom(conv), mostrando: mostrarAntigas, alternar: () => setMostrarAntigas((v) => !v) } : undefined}
        vazio={
          <>
            <Avatar id={agent.id} label={agent.nome} size={56} />
            <h2>Conversa com {agent.nome}</h2>
            <p>{agent.instrucoes.split("\n")[0]}</p>
          </>
        }
      />

      {sugestao && (
        <div className="faixa faixa-sugestao">
          <p>
            Resposta fixada em {new Date(sugestao.criadaEm).toLocaleDateString("pt-BR")} para algo parecido:{" "}
            <em>"{sugestao.pergunta}"</em>
          </p>
          <div className="faixa-acoes">
            <button onClick={() => void usarFixada(sugestao)}>Usar (0 tokens)</button>
            <button className="secundario" onClick={() => void enviar(true)}>Perguntar mesmo assim</button>
          </div>
        </div>
      )}
      {aviso && <p className="faixa faixa-aviso">{aviso}</p>}
      {erro && <p className="faixa faixa-erro">{erro}</p>}

      <Composer
        valor={texto}
        placeholder={`Mensagem para ${agent.nome}`}
        desabilitado={enviando || topico.ocupado}
        anexo={anexo}
        diagrama={diagrama}
        onAnexo={setAnexo}
        onDiagrama={setDiagrama}
        onChange={(v) => {
          setTexto(v);
          setSugestao(null);
        }}
        onEnviar={() => void enviar()}
        onComando={(c) => void comando(c)}
      />
    </section>
  );
}
