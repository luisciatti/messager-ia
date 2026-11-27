/**
 * Estimativa de tokens e log de uso.
 *
 * Dentro do artifact a resposta do Claude não traz a contagem real de tokens,
 * então estimamos pelo tamanho do texto. Português fica em torno de
 * 3,5 caracteres por token. Serve para comparar quem gasta mais, não para
 * cobrança exata.
 */

import type { ModelTier } from "../adapters/claude";

export const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export type UsageReason = "resposta" | "moderacao" | "sintese" | "resumo" | "visao";

export interface UsageEntry {
  id: number;
  at: number;
  agentId: string;
  groupId?: string;
  reason: UsageReason;
  tier: ModelTier;
  inTokens: number;
  outTokens: number;
  ms: number;
  truncated: boolean;
  /** true se a chamada falhou; os tokens de entrada ainda contam. */
  failed: boolean;
}

export interface UsageTotals {
  calls: number;
  inTokens: number;
  outTokens: number;
  total: number;
}

type GroupKey = "agentId" | "groupId" | "reason" | "tier";

export class UsageLog {
  private items: UsageEntry[] = [];
  private nextId = 1;
  private listeners = new Set<(e: UsageEntry) => void>();

  add(entry: Omit<UsageEntry, "id">): UsageEntry {
    const full = { ...entry, id: this.nextId++ };
    this.items.push(full);
    this.listeners.forEach((fn) => fn(full));
    return full;
  }

  /** Carrega entradas salvas (sem avisar inscritos). */
  hydrate(entries: Omit<UsageEntry, "id">[]): void {
    for (const e of [...entries].sort((a, b) => a.at - b.at)) this.items.push({ ...e, id: this.nextId++ });
  }

  entries(): readonly UsageEntry[] {
    return this.items;
  }

  /** Avisa a cada nova entrada (para a aba de tokens). Retorna o "unsubscribe". */
  subscribe(fn: (e: UsageEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  totals(filter?: (e: UsageEntry) => boolean): UsageTotals {
    const list = filter ? this.items.filter(filter) : this.items;
    const t = { calls: 0, inTokens: 0, outTokens: 0, total: 0 };
    for (const e of list) {
      t.calls++;
      t.inTokens += e.inTokens;
      t.outTokens += e.outTokens;
    }
    t.total = t.inTokens + t.outTokens;
    return t;
  }

  totalsBy(key: GroupKey): Record<string, UsageTotals> {
    const keys = new Set(this.items.map((e) => String(e[key] ?? "—")));
    const out: Record<string, UsageTotals> = {};
    for (const k of keys) out[k] = this.totals((e) => String(e[key] ?? "—") === k);
    return out;
  }
}
