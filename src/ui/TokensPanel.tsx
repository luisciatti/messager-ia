import { useEffect, useMemo, useState } from "react";
import { CHARS_PER_TOKEN, type UsageEntry, type UsageTotals } from "../core/tokens";
import type { Services } from "./services";

type Periodo = "hoje" | "7d";
const MOTIVOS: Record<string, string> = { resposta: "Respostas", moderacao: "Moderação", sintese: "Síntese", resumo: "Resumos" };

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

export function TokensPanel({ services }: { services: Services }) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [versao, setVersao] = useState(0);

  useEffect(() => services.log.subscribe(() => setVersao((v) => v + 1)), [services]);

  const lista = useMemo(() => {
    const inicio = periodo === "hoje" ? new Date().setHours(0, 0, 0, 0) : Date.now() - 7 * 86_400_000;
    return services.log.entries().filter((e) => e.at >= inicio);
  }, [services, periodo, versao]);

  const nome = (id: string) => services.agents.get(id)?.nome ?? id;
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
