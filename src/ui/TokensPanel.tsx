import { useEffect, useMemo, useState } from "react";
import { CHARS_PER_TOKEN, type UsageEntry, type UsageTotals } from "../core/tokens";
import { loadFeedback, stats, type FeedbackItem } from "../core/feedback";
import { saveConfig } from "../core/settings";
import { metaHoje, type Services } from "./services";

type Periodo = "hoje" | "7d";
const MOTIVOS: Record<string, string> = { resposta: "Respostas", moderacao: "Moderação", sintese: "Síntese", resumo: "Resumos", visao: "Imagens", fontes: "Fontes (web)" };

function soma(list: readonly UsageEntry[]): UsageTotals {
  const t = { calls: list.length, inTokens: 0, outTokens: 0, total: 0 };
  for (const e of list) {
    t.inTokens += e.inTokens;
    t.outTokens += e.outTokens;
  }
  t.total = t.inTokens + t.outTokens;
  return t;
}

function agrupar(list: readonly UsageEntry[], chave: (e: UsageEntry) => string) {
  const m = new Map<string, UsageEntry[]>();
  for (const e of list) m.set(chave(e), [...(m.get(chave(e)) ?? []), e]);
  return [...m.entries()].map(([k, v]) => ({ k, t: soma(v) })).sort((a, b) => b.t.total - a.t.total);
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

function Barras({ titulo, linhas }: { titulo: string; linhas: { k: string; rotulo: string; t: UsageTotals }[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.t.total));
  return (
    <div className="cartao">
      <h3>{titulo}</h3>
      {linhas.length === 0 && <p className="ajuda">Sem chamadas no período.</p>}
      {linhas.map((l) => (
        <div key={l.k} className="barra-linha">
          <span>{l.rotulo}</span>
          <div className="barra">
            <div className="barra-in" style={{ width: `${(l.t.inTokens / max) * 100}%` }} />
            <div className="barra-out" style={{ width: `${(l.t.outTokens / max) * 100}%` }} />
          </div>
          <small>
            ~{fmt(l.t.total)} · {l.t.calls}×
          </small>
        </div>
      ))}
    </div>
  );
}

function MetaDiaria({ services }: { services: Services }) {
  const [meta, setMeta] = useState(String(services.config.metaDiaria));
  const [pausar, setPausar] = useState(services.config.pausarNaMeta);
  const [salvo, setSalvo] = useState(false);
  const m = metaHoje(services);

  async function salvar() {
    const nova = { metaDiaria: Math.max(1000, Number(meta) || 0), pausarNaMeta: pausar };
    await saveConfig(services.storage, nova);
    Object.assign(services.config, nova);
    setMeta(String(nova.metaDiaria));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 1500);
  }

  return (
    <div className="cartao">
      <h3>Meta diária</h3>
      <div className={`medidor-grande medidor-${m.nivel}`}>
        <span className="medidor-barra"><span style={{ width: `${Math.min(100, m.pct * 100)}%` }} /></span>
        <small>~{fmt(m.usado)} de {fmt(m.meta)} tokens hoje ({Math.round(m.pct * 100)}%)</small>
      </div>
      <div className="linha meta-form">
        <label>
          Meta (tokens/dia){" "}
          <input type="number" min={1000} step={1000} value={meta} onChange={(e) => setMeta(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={pausar} onChange={(e) => setPausar(e.target.checked)} /> Pausar envios ao atingir 100%
        </label>
        <button onClick={() => void salvar()}>{salvo ? "Salvo" : "Salvar"}</button>
      </div>
      <p className="ajuda">Aviso aos 80%. A pausa não bloqueia o /clear.</p>
    </div>
  );
}

function Qualidade({ services }: { services: Services }) {
  const [itens, setItens] = useState<FeedbackItem[] | null>(null);
  useEffect(() => {
    void loadFeedback(services.storage).then(setItens);
  }, [services]);
  if (!itens) return null;
  const nome = (id: string) => services.agents.get(id)?.nome ?? (id === "sintetizador" ? "Síntese" : id);
  const linhas = (r: Record<string, { up: number; down: number; aprovacao: number | null }>, rot: (k: string) => string) =>
    Object.entries(r).map(([k, v]) => (
      <tr key={k}>
        <td>{rot(k)}</td>
        <td>{v.up}</td>
        <td>{v.down}</td>
        <td>{v.aprovacao === null ? "—" : `${Math.round(v.aprovacao * 100)}%`}</td>
      </tr>
    ));
  return (
    <div className="cartao">
      <h3>Qualidade das respostas</h3>
      {itens.length === 0 ? (
        <p className="ajuda">Use 👍/👎 nas respostas (passe o mouse sobre elas). Com isso dá para ver se o modelo leve mantém a qualidade.</p>
      ) : (
        <table className="tabela">
          <thead><tr><th>Agente / modelo</th><th>👍</th><th>👎</th><th>Aprovação</th></tr></thead>
          <tbody>
            {linhas(stats(itens, (i) => i.agentId), nome)}
            {linhas(stats(itens, (i) => `tier:${i.tier}`), (k) => (k === "tier:quick" ? "Modelo leve" : k === "tier:default" ? "Modelo padrão" : "Modelo avançado"))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TokensPanel({ services }: { services: Services }) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [versao, setVersao] = useState(0);

  useEffect(() => services.log.subscribe(() => setVersao((v) => v + 1)), [services]);

  const lista = useMemo(() => {
    const inicio = periodo === "hoje" ? new Date().setHours(0, 0, 0, 0) : Date.now() - 7 * 86_400_000;
    return services.log.entries().filter((e) => e.at >= inicio);
  }, [services, periodo, versao]);

  const nome = (id: string) =>
    services.agents.get(id)?.nome ?? ({ visao: "Visão (imagens)", memoria: "Memória (/clear)" } as Record<string, string>)[id] ?? id;
  const total = soma(lista);
  const falhas = lista.filter((e) => e.failed).length;

  return (
    <section className="painel">
      <div className="linha">
        <h2>Uso de tokens</h2>
        <div className="abas">
          {(["hoje", "7d"] as const).map((p) => (
            <button key={p} className={p === periodo ? "" : "secundario"} onClick={() => setPeriodo(p)}>
              {p === "hoje" ? "Hoje" : "7 dias"}
            </button>
          ))}
        </div>
      </div>
      <p className="ajuda">
        Estimativa (~{CHARS_PER_TOKEN.toLocaleString("pt-BR")} caracteres por token): o artifact não informa a contagem exata. Serve para comparar
        quem gasta mais.
      </p>

      <div className="numeros">
        <div><strong>{fmt(total.total)}</strong><small>tokens (~)</small></div>
        <div><strong>{fmt(total.inTokens)}</strong><small>entrada</small></div>
        <div><strong>{fmt(total.outTokens)}</strong><small>saída</small></div>
        <div><strong>{total.calls}</strong><small>chamadas{falhas ? ` · ${falhas} falha(s)` : ""}</small></div>
      </div>

      <MetaDiaria services={services} />
      <Qualidade services={services} />
      <p className="legenda"><span className="barra-in" /> entrada <span className="barra-out" /> saída</p>
      <Barras titulo="Por agente" linhas={agrupar(lista, (e) => e.agentId).map((l) => ({ ...l, rotulo: nome(l.k) }))} />
      <Barras titulo="Por motivo" linhas={agrupar(lista, (e) => e.reason).map((l) => ({ ...l, rotulo: MOTIVOS[l.k] ?? l.k }))} />
      <Barras
        titulo="Por conversa"
        linhas={agrupar(lista, (e) => e.groupId ?? `direto:${e.agentId}`).map((l) => ({
          ...l,
          rotulo: l.k.startsWith("direto:") ? `1:1 ${nome(l.k.slice(7))}` : `Grupo ${services.groups.get(l.k)?.nome ?? l.k}`,
        }))}
      />

      <div className="cartao">
        <h3>Últimas chamadas</h3>
        <table className="tabela">
          <thead>
            <tr><th>Hora</th><th>Agente</th><th>Motivo</th><th>Tier</th><th>Entrada</th><th>Saída</th><th>Tempo</th></tr>
          </thead>
          <tbody>
            {[...lista].reverse().slice(0, 20).map((e) => (
              <tr key={e.id} className={e.failed ? "falhou" : ""}>
                <td>{new Date(e.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>{nome(e.agentId)}</td>
                <td>{MOTIVOS[e.reason] ?? e.reason}</td>
                <td>{e.tier}</td>
                <td>{fmt(e.inTokens)}</td>
                <td>{fmt(e.outTokens)}</td>
                <td>{(e.ms / 1000).toFixed(1)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
