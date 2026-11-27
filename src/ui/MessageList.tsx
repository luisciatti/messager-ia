import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { IconDown, IconPin, IconUp } from "./icons";
import { Markdown } from "./Markdown";
import { safeImageUrl } from "../adapters/imageStore";

export interface ThreadItem {
  autorId: string;
  autorNome: string;
  texto: string;
  tokens?: number;
}

export interface Row {
  key: string;
  autorId: string;
  autorNome: string;
  at: number;
  texto: string;
  tokens?: number;
  reaproveitada?: boolean;
  pendente?: boolean;
  onPin?: () => void;
  thread?: ThreadItem[];
  imagemUrl?: string;
  imagemTokens?: number;
  feedback?: 1 | -1;
  onVoto?: (v: 1 | -1) => void;
  leve?: boolean;
  onRefazer?: () => void;
  onReplica?: () => void;
  onVerificar?: () => void;
  /** Pergunta sobre algo que muda (preço, versão, limite…): botão em destaque. */
  verificarDestaque?: boolean;
  fontes?: { url: string; titulo: string; data?: string }[];
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function dia(ms: number): string {
  const d = new Date(ms);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function Thread({ itens }: { itens: ThreadItem[] }) {
  const [aberto, setAberto] = useState(false);
  const total = itens.reduce((s, i) => s + (i.tokens ?? 0), 0);
  return (
    <div className="thread">
      <button className="thread-toggle" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <span className="thread-avatares">
          {itens.map((i) => <Avatar key={i.autorId} id={i.autorId} label={i.autorNome} size={20} />)}
        </span>
        {aberto ? "Ocultar" : "Ver"} {itens.length} falas dos agentes
        <span className="meta"> · ~{total} tok</span>
      </button>
      {aberto && (
        <div className="thread-itens">
          {itens.map((i) => (
            <div key={i.autorId} className="thread-item">
              <Avatar id={i.autorId} label={i.autorNome} size={24} />
              <div>
                <span className="autor">{i.autorNome}</span>
                <Markdown texto={i.texto} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const httpsOk = (u: string) => {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
};

function Fontes({ fontes }: { fontes: NonNullable<Row["fontes"]> }) {
  return (
    <ol className="fontes" aria-label="Fontes">
      {fontes.map((f, i) => (
        <li key={i}>
          <span className="fonte-n">[{i + 1}]</span>{" "}
          {httpsOk(f.url) ? (
            <a href={f.url} target="_blank" rel="noopener noreferrer">{f.titulo}</a>
          ) : (
            <span>{f.titulo}</span>
          )}
          {f.data && <span className="meta"> · {f.data}</span>}
        </li>
      ))}
    </ol>
  );
}

export function MessageList({
  rows,
  vazio,
  extra,
  ocultas,
}: {
  rows: Row[];
  vazio: ReactNode;
  extra?: ReactNode;
  ocultas?: { n: number; mostrando: boolean; alternar: () => void };
}) {
  const fimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [rows, extra]);

  return (
    <div className="mensagens" role="log">
      {ocultas && ocultas.n > 0 && (
        <div className="ocultas">
          <button onClick={ocultas.alternar}>
            {ocultas.mostrando ? "Ocultar mensagens antes do /clear" : `Mostrar ${ocultas.n} mensagens anteriores ao /clear`}
          </button>
        </div>
      )}
      {rows.length === 0 && !extra && <div className="vazio">{vazio}</div>}
      {rows.map((r, i) => {
        const ant = rows[i - 1];
        const novoDia = !ant || dia(ant.at) !== dia(r.at);
        const compacta = !novoDia && ant && ant.autorId === r.autorId && r.at - ant.at < 5 * 60_000 && !ant.thread && !r.onVoto;
        return (
          <div key={r.key}>
            {novoDia && (
              <div className="divisor">
                <span>{dia(r.at)}</span>
              </div>
            )}
            <article className={`msg ${compacta ? "compacta" : ""} ${r.pendente ? "pendente" : ""}`}>
              <div className="msg-lado">
                {compacta ? <time className="msg-hora-lado">{hora(r.at)}</time> : <Avatar id={r.autorId} label={r.autorId === "voce" ? "Eu" : r.autorNome} />}
              </div>
              <div className="msg-corpo">
                {!compacta && (
                  <header>
                    <strong>{r.autorNome}</strong>
                    <time>{hora(r.at)}</time>
                    {r.tokens !== undefined && !r.reaproveitada && <span className="meta">~{r.tokens} tok</span>}
                    {r.reaproveitada && <span className="tag">reaproveitada · 0 tok</span>}
                    {r.leve && <span className="tag" title="Respondido pelo modelo mais leve (mais rápido)">modelo leve</span>}
                    {r.feedback && <span className="voto-dado" aria-label={r.feedback === 1 ? "Você aprovou" : "Você reprovou"}>{r.feedback === 1 ? <IconUp /> : <IconDown />}</span>}
                  </header>
                )}
                {r.imagemTokens !== undefined && (
                  safeImageUrl(r.imagemUrl)
                    ? <img className="msg-img" src={safeImageUrl(r.imagemUrl)} alt="Imagem enviada" />
                    : <span className="tag">imagem · ~{r.imagemTokens} tok</span>
                )}
                {r.texto && <Markdown texto={r.texto} />}
                {r.fontes && r.fontes.length > 0 && <Fontes fontes={r.fontes} />}
                {r.thread && r.thread.length > 0 && <Thread itens={r.thread} />}
                {r.onVerificar && (
                  <button
                    className={`refazer ${r.verificarDestaque ? "destaque" : ""}`}
                    onClick={r.onVerificar}
                    title="Busca fontes reais no Parallel Search e revisa a resposta com citações (~1 mil tokens)"
                  >
                    🔎 Verificar na web
                  </button>
                )}
                {r.onReplica && (
                  <button className="refazer" onClick={r.onReplica} title="Os agentes revisam esta resposta; só falam se discordarem (2 a 4 chamadas)">
                    Pedir réplica
                  </button>
                )}
                {r.onRefazer && (
                  <button className="refazer" onClick={r.onRefazer} title="Pergunta de novo no modelo padrão (1 chamada a mais)">
                    Refazer no modelo padrão
                  </button>
                )}
              </div>
              {(r.onPin || r.onVoto) && (
                <div className="msg-acoes">
                  {r.onVoto && (
                    <>
                      <button className={r.feedback === 1 ? "marcado" : ""} onClick={() => r.onVoto!(1)} title="Boa resposta" aria-label="Boa resposta" aria-pressed={r.feedback === 1}>
                        <IconUp />
                      </button>
                      <button className={r.feedback === -1 ? "marcado" : ""} onClick={() => r.onVoto!(-1)} title="Resposta ruim" aria-label="Resposta ruim" aria-pressed={r.feedback === -1}>
                        <IconDown />
                      </button>
                    </>
                  )}
                  {r.onPin && (
                    <button onClick={r.onPin} title="Fixar resposta na memória" aria-label="Fixar resposta na memória">
                      <IconPin />
                    </button>
                  )}
                </div>
              )}
            </article>
          </div>
        );
      })}
      {extra}
      <div ref={fimRef} />
    </div>
  );
}
