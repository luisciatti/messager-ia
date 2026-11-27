import { useEffect, useMemo, useState } from "react";
import type { AgentDef } from "../core/agents";
import { ImagesUnsupportedError } from "../adapters/claude";
import { BudgetExceededError } from "../core/budget";
import { directKey, loadConversation, sendDirect, useSaved } from "../core/chat";
import type { Conversation } from "../core/conversation";
import { findFixada, type Fixada } from "../core/memory";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageList, type Row } from "./MessageList";
import type { Anexo } from "./prepareImage";
import type { Services } from "./services";

export function ChatView({ services, agent }: { services: Services; agent: AgentDef }) {
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
      if (r.notasUsadas) setAviso(`Usou ${r.notasUsadas} nota(s) da memória.`);
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

  async function usarFixada(f: Fixada) {
    setConv(await useSaved(services, agent.id, texto.trim(), f));
    setTexto("");
    setSugestao(null);
    setAviso("Resposta reaproveitada: 0 tokens.");
  }

  const rows = useMemo<Row[]>(() => {
    if (!conv) return [];
    return conv.mensagens.map((m, i) => {
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
      };
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
  }, [conv, agent, services]);

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
      </header>

      <MessageList
        rows={[...rows, ...pendentes]}
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
        desabilitado={enviando}
        anexo={anexo}
        diagrama={diagrama}
        onAnexo={setAnexo}
        onDiagrama={setDiagrama}
        onChange={(v) => {
          setTexto(v);
          setSugestao(null);
        }}
        onEnviar={() => void enviar()}
      />
    </section>
  );
}
