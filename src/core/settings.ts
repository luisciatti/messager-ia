/** Preferências do usuário (0 tokens). */
import type { Storage } from "../adapters/storage";

export interface Config {
  /** Meta diária de tokens estimados. */
  metaDiaria: number;
  /** Se true, bloqueia novas mensagens ao atingir 100% da meta. */
  pausarNaMeta: boolean;
}

export const DEFAULT_CONFIG: Config = { metaDiaria: 20000, pausarNaMeta: false };
const KEY = "config";

export async function loadConfig(storage: Storage): Promise<Config> {
  return { ...DEFAULT_CONFIG, ...((await storage.get<Partial<Config>>(KEY)) ?? {}) };
}

export async function saveConfig(storage: Storage, c: Config): Promise<void> {
  await storage.set(KEY, { metaDiaria: Math.max(1000, Math.round(c.metaDiaria)), pausarNaMeta: !!c.pausarNaMeta });
}

export type NivelMeta = "ok" | "alerta" | "estourado";

export function statusMeta(usado: number, meta: number): { pct: number; nivel: NivelMeta } {
  const pct = meta > 0 ? usado / meta : 0;
  return { pct, nivel: pct >= 1 ? "estourado" : pct >= 0.8 ? "alerta" : "ok" };
}

export function inicioDoDia(now = Date.now()): number {
  return new Date(now).setHours(0, 0, 0, 0);
}
