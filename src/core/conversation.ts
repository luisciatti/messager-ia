/**
 * Conversa e janela de contexto.
 *
 * O histórico completo fica guardado para exibir, mas o Claude só recebe:
 *   resumo (das mensagens antigas) + mensagens depois do ponto compactado.
 * Quando acumulam COMPACT_AT mensagens não resumidas, as mais antigas
 * (todas menos as KEEP_LAST últimas) viram resumo numa chamada "quick".
 */

import type { AskRequest, ChatMessage } from "../adapters/claude";
import type { ImagemSalva } from "./images";

export const KEEP_LAST = 6;
export const COMPACT_AT = 14;
/** Limite de mensagens guardadas para exibição (tamanho do documento). */
export const MAX_STORED = 300;
export const SUMMARY_MAX_WORDS = 120;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  at: number;
  agentId?: string;
  /** Tokens estimados da resposta (só assistant). */
  tokens?: number;
  /** Resposta reaproveitada de uma fixada (0 tokens). */
  reaproveitada?: boolean;
  /** Imagem enviada pelo usuário. No histórico vira só um marcador de texto. */
  imagem?: ImagemSalva;
  /** Fala individual de agente no grupo: exibida, mas fora do contexto (a síntese já a cobre). */
  interna?: boolean;
}

export interface Conversation {
  id: string;
  resumo: string;
  mensagens: StoredMessage[];
  /** Mensagens com índice < compactadoAte já estão no resumo. */
  compactadoAte: number;
  atualizadoEm: number;
}

export function emptyConversation(id: string): Conversation {
  return { id, resumo: "", mensagens: [], compactadoAte: 0, atualizadoEm: 0 };
}

/** Junta mensagens seguidas do mesmo papel e garante que comece com "user". */
function normalize(list: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of list) {
    const last = out.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ ...m });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

export function imageMarker(img: ImagemSalva): string {
  return img.descricao ? `[imagem anexada: ${img.descricao}]` : "[imagem anexada]";
}

export function buildContext(conv: Conversation, userText: string): ChatMessage[] {
  const recent = conv.mensagens
    .slice(conv.compactadoAte)
    .filter((m) => !m.interna)
    .map(({ role, content, imagem }) => ({ role, content: imagem ? `${imageMarker(imagem)}${content ? `\n${content}` : ""}` : content }));
  const msgs = normalize([...recent, { role: "user", content: userText }]);
  if (conv.resumo) {
    msgs[0] = { ...msgs[0], content: `<resumo_anterior>\n${conv.resumo}\n</resumo_anterior>\n\n${msgs[0].content}` };
  }
  return msgs;
}

/** Mensagens que contam para o contexto (não compactadas e não internas). */
function contextIndexes(conv: Conversation): number[] {
  const idx: number[] = [];
  for (let i = conv.compactadoAte; i < conv.mensagens.length; i++) if (!conv.mensagens[i].interna) idx.push(i);
  return idx;
}

export function needsCompaction(conv: Conversation): boolean {
  return contextIndexes(conv).length >= COMPACT_AT;
}

/** Índice bruto onde começam as KEEP_LAST últimas mensagens de contexto. */
function compactionCut(conv: Conversation): number {
  const idx = contextIndexes(conv);
  return idx[idx.length - KEEP_LAST] ?? conv.mensagens.length;
}

export function compactionRequest(conv: Conversation): AskRequest {
  const end = compactionCut(conv);
  const trecho = conv.mensagens
    .slice(conv.compactadoAte, end)
    .filter((m) => !m.interna)
    .map((m) => `${m.role === "user" ? "U" : "A"}: ${m.content}`)
    .join("\n");
  const anterior = conv.resumo ? `Resumo anterior:\n${conv.resumo}\n\n` : "";
  return {
    // Mesma chamada resume E extrai notas para a memória: sem chamada extra.
    system: [
      `Resuma a conversa em até ${SUMMARY_MAX_WORDS} palavras: fatos, decisões, números e pendências.`,
      "Extraia até 3 notas duráveis (fato do ambiente ou decisão), até 20 palavras cada; [] se nada.",
      'Responda só JSON: {"resumo":"...","notas":["..."]}',
    ].join("\n"),
    messages: [{ role: "user", content: `${anterior}Novas mensagens:\n${trecho}` }],
    modelTier: "quick",
  };
}

export interface CompactionResult {
  resumo: string;
  notas: string[];
}

/** Aceita JSON (com ou sem texto em volta); se falhar, usa o texto como resumo. */
export function parseCompaction(text: string): CompactionResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { resumo?: unknown; notas?: unknown };
      if (typeof j.resumo === "string") {
        const notas = Array.isArray(j.notas) ? j.notas.filter((n): n is string => typeof n === "string").slice(0, 3) : [];
        return { resumo: j.resumo, notas };
      }
    } catch {
      /* cai no fallback */
    }
  }
  return { resumo: text, notas: [] };
}

export function applyCompaction(conv: Conversation, resumo: string): Conversation {
  return { ...conv, resumo: resumo.trim(), compactadoAte: compactionCut(conv) };
}

/** Acrescenta mensagens respeitando MAX_STORED (corta as mais antigas). */
export function appendMessages(conv: Conversation, ...novas: StoredMessage[]): Conversation {
  let mensagens = [...conv.mensagens, ...novas];
  let compactadoAte = conv.compactadoAte;
  const excesso = mensagens.length - MAX_STORED;
  if (excesso > 0) {
    mensagens = mensagens.slice(excesso);
    compactadoAte = Math.max(0, compactadoAte - excesso);
  }
  return { ...conv, mensagens, compactadoAte, atualizadoEm: Date.now() };
}
