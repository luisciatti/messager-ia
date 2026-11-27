/**
 * 👍/👎 por resposta (0 tokens). Guarda agente e tier para medir qualidade
 * e, depois, validar o roteamento de modelo com dados de preferência.
 */
import type { ModelTier } from "../adapters/claude";
import type { Storage } from "../adapters/storage";
import type { Conversation } from "./conversation";

export const FEEDBACK_MAX = 500;
const KEY = "feedback";

export interface FeedbackItem {
  id: string; // conversa + horário da mensagem
  agentId: string;
  tier: ModelTier;
  valor: 1 | -1;
  at: number;
  tokens: number;
}

export interface FeedbackStats {
  up: number;
  down: number;
  /** Fração de 👍 (null sem votos). */
  aprovacao: number | null;
}

export function stats(itens: FeedbackItem[], chave: (i: FeedbackItem) => string): Record<string, FeedbackStats> {
  const out: Record<string, FeedbackStats> = {};
  for (const i of itens) {
    const k = chave(i);
    out[k] ??= { up: 0, down: 0, aprovacao: null };
    if (i.valor === 1) out[k].up++;
    else out[k].down++;
  }
  for (const s of Object.values(out)) s.aprovacao = s.up + s.down ? s.up / (s.up + s.down) : null;
  return out;
}

export async function loadFeedback(storage: Storage): Promise<FeedbackItem[]> {
  return (await storage.get<{ itens: FeedbackItem[] }>(KEY))?.itens ?? [];
}

/**
 * Registra (ou remove, se repetir o mesmo voto) o feedback da mensagem `index`.
 * Atualiza a conversa e a lista agregada.
 */
export async function votar(
  storage: Storage,
  convKey: string,
  conv: Conversation,
  index: number,
  valor: 1 | -1,
): Promise<Conversation> {
  const m = conv.mensagens[index];
  if (!m || m.role !== "assistant") return conv;
  const novo = m.feedback === valor ? undefined : valor;
  const mensagens = conv.mensagens.map((x, i) => (i === index ? { ...x, feedback: novo } : x));
  const atualizada = { ...conv, mensagens };

  const id = `${convKey}:${m.at}:${index}`;
  const itens = (await loadFeedback(storage)).filter((i) => i.id !== id);
  if (novo) itens.push({ id, agentId: m.agentId ?? "?", tier: m.tier ?? "default", valor: novo, at: Date.now(), tokens: m.tokens ?? 0 });

  await storage.set(convKey, atualizada);
  await storage.set(KEY, { itens: itens.slice(-FEEDBACK_MAX) });
  return atualizada;
}
