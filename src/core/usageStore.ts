/**
 * Persiste o log de uso: um documento por dia ("uso-AAAA-MM-DD"),
 * para não criar um documento por chamada (o db tem limite de documentos).
 */

import type { Storage } from "../adapters/storage";
import type { UsageEntry, UsageLog } from "./tokens";

export const USAGE_DAY_MAX = 1000; // ~200 bytes/entrada, bem abaixo dos 256 KiB do documento
export const USAGE_DAYS = 7;

type Saved = Omit<UsageEntry, "id">;

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `uso-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function loadRecentUsage(storage: Storage, now = Date.now(), days = USAGE_DAYS): Promise<Saved[]> {
  const keys = Array.from({ length: days }, (_, i) => dayKey(now - i * 86_400_000));
  const docs = await Promise.all(keys.map((k) => storage.get<{ itens: Saved[] }>(k)));
  return docs.flatMap((d) => d?.itens ?? []);
}

/** Grava cada nova entrada no documento do dia. Retorna o "unsubscribe". */
export function persistUsage(log: UsageLog, storage: Storage, inicial: Saved[] = []): () => void {
  const cache = new Map<string, Saved[]>();
  for (const e of inicial) {
    const k = dayKey(e.at);
    cache.set(k, [...(cache.get(k) ?? []), e]);
  }
  return log.subscribe((entry) => {
    const { id: _id, ...e } = entry;
    void _id;
    const k = dayKey(e.at);
    const itens = [...(cache.get(k) ?? []), e].slice(-USAGE_DAY_MAX);
    cache.set(k, itens);
    void storage.set(k, { itens });
  });
}
