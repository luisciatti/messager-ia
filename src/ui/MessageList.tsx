import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { IconPin } from "./icons";
import { Markdown } from "./Markdown";

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

export function MessageList({ rows, vazio, extra }: { rows: Row[]; vazio: ReactNode; extra?: ReactNode }) {
  const fimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [rows, extra]);

  return (
    <div className="mensagens" role="log">
      {rows.length === 0 && !extra && <div className="vazio">{vazio}</div>}
      {rows.map((r, i) => {
        const ant = rows[i - 1];
        const novoDia = !ant || dia(ant.at) !== dia(r.at);
        const compacta = !novoDia && ant && ant.autorId === r.autorId && r.at - ant.at < 5 * 60_000 && !ant.thread;
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
                  </header>
                )}
                {r.texto && <Markdown texto={r.texto} />}
                {r.thread && r.thread.length > 0 && <Thread itens={r.thread} />}
              </div>
              {r.onPin && (
                <div className="msg-acoes">
                  <button onClick={r.onPin} title="Fixar resposta na memória" aria-label="Fixar resposta na memória">
                    <IconPin />
                  </button>
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
