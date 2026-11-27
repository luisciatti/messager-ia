/**
 * Fechamento de assunto (/clear e /doc).
 *
 * Uma chamada "quick" lê o trecho desde o último /clear e devolve, num JSON só:
 * - notas duráveis (fatos/decisões do ambiente);
 * - um doc SÓ se algo foi resolvido ou decidido e servirá de referência.
 * Depois o contexto é zerado: o próximo assunto começa leve (menos tokens e
 * menos "context rot"), e o que importa continua acessível pela memória.
 */

import { BudgetTracker, COMPACTION_BUDGET } from "./budget";
import { loadConversation, type ChatDeps } from "./chat";
import { clearConversation, visibleFrom, type Conversation } from "./conversation";
import type { Doc } from "./memory";
import { estimateTokens } from "./tokens";

/** Teto do trecho enviado no fechamento (mantém o fim, que é onde está a conclusão). */
export const CLOSING_MAX_TOKENS = 1500;
/** Respostas antigas do agente entram encurtadas; as últimas, inteiras (é onde costuma estar a solução). */
export const CLOSING_FULL_LAST = 2;
export const CLOSING_OLD_REPLY_CHARS = 300;
export const CLOSING_AGENT_ID = "memoria";
export const CLOSING_MIN_TOKENS = 10;

const BASE = [
  "Você arquiva um assunto encerrado de uma conversa técnica.",
  "notas: até 3 fatos ou decisões duráveis sobre o ambiente do usuário (até 20 palavras cada).",
];
const DOC_AUTO =
  'doc: só se um problema foi RESOLVIDO ou um procedimento/decisão foi DEFINIDO e servirá de referência. Pergunta conceitual genérica (ex.: "o que é load balancer") NÃO vira doc: use null.';
const DOC_FORCADO = "doc: obrigatório, sintetizando o assunto.";
const FORMATO =
  'Formato do doc: título curto; conteúdo em markdown até 120 palavras (problema, solução ou passos, cuidados); até 4 tags. Responda só JSON: {"notas":["..."],"doc":{"titulo":"...","conteudo":"...","tags":["..."]} ou null}';

/**
 * Trecho do fechamento, sem duplicar: o que já foi compactado entra só pelo
 * resumo; depois vêm as mensagens ainda não resumidas.
 */
export function closingTranscript(conv: Conversation): string {
  const inicio = Math.max(visibleFrom(conv), conv.compactadoAte);
  const msgs = conv.mensagens.slice(inicio).filter((m) => !m.interna);
  const respostas = msgs.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0);
  const inteiras = new Set(respostas.slice(-CLOSING_FULL_LAST));
  const linhas = msgs.map((m, i) => {
    let texto = m.content;
    if (m.role === "assistant" && !inteiras.has(i) && texto.length > CLOSING_OLD_REPLY_CHARS) {
      texto = `${texto.slice(0, CLOSING_OLD_REPLY_CHARS)}…`;
    }
    return `${m.role === "user" ? "U" : "A"}: ${m.imagem ? "[imagem] " : ""}${texto}`;
  });
  let texto = linhas.join("\n");
  const maxChars = CLOSING_MAX_TOKENS * 3.5;
  if (texto.length > maxChars) texto = `[…início omitido]\n${texto.slice(-maxChars)}`;
  return conv.resumo ? `Resumo anterior: ${conv.resumo}\n\n${texto}` : texto;
}

export interface ClosingResult {
  notas: string[];
  doc: { titulo: string; conteudo: string; tags: string[] } | null;
}

export function parseClosing(text: string): ClosingResult {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { notas: [], doc: null };
  try {
    const j = JSON.parse(m[0]) as { notas?: unknown; doc?: unknown };
    const notas = Array.isArray(j.notas) ? j.notas.filter((n): n is string => typeof n === "string" && !!n.trim()).slice(0, 3) : [];
    const d = j.doc as { titulo?: unknown; conteudo?: unknown; tags?: unknown } | null | undefined;
    const doc =
      d && typeof d.titulo === "string" && typeof d.conteudo === "string" && d.titulo.trim() && d.conteudo.trim()
        ? { titulo: d.titulo.trim(), conteudo: d.conteudo.trim(), tags: Array.isArray(d.tags) ? d.tags.map(String).slice(0, 4) : [] }
        : null;
    return { notas, doc };
  } catch {
    return { notas: [], doc: null };
  }
}

export interface CloseResult {
  conversa: Conversation;
  notas: number;
  doc?: Doc;
  /** false quando não havia o que arquivar (nenhuma chamada feita). */
  chamou: boolean;
}

/**
 * modo "clear": arquiva (doc só se relevante) e limpa.
 * modo "doc": força o doc e NÃO limpa.
 */
export async function closeTopic(
  deps: ChatDeps,
  key: string,
  agentId: string,
  modo: "clear" | "doc",
  groupId?: string,
): Promise<CloseResult> {
  const conv = await loadConversation(deps.storage, key);
  const novas = conv.mensagens.slice(visibleFrom(conv)).filter((m) => !m.interna);
  // /clear só chama o Claude se houver conversa de verdade (evita gastar com "oi"/"ok").
  // /doc é pedido explícito: basta ter alguma mensagem.
  const temConteudo =
    modo === "doc"
      ? novas.some((m) => m.role === "user")
      : novas.length >= 2 && estimateTokens(novas.map((m) => m.content).join(" ")) >= CLOSING_MIN_TOKENS;

  let notas = 0;
  let doc: Doc | undefined;
  if (temConteudo) {
    const res = await deps.metered.ask(
      {
        system: [...BASE, modo === "doc" ? DOC_FORCADO : DOC_AUTO, FORMATO].join("\n"),
        messages: [{ role: "user", content: closingTranscript(conv) }],
        modelTier: "quick",
      },
      { agentId: CLOSING_AGENT_ID, groupId, reason: "resumo" },
      new BudgetTracker(COMPACTION_BUDGET),
    );
    const r = parseClosing(res.text);
    const at = Date.now();
    if (r.notas.length) await deps.memory.addNotas(r.notas.map((texto) => ({ texto, agentId, criadaEm: at })));
    notas = r.notas.length;
    if (r.doc) doc = await deps.memory.addDoc({ ...r.doc, agentId, criadaEm: at });
  }

  const conversa = modo === "clear" ? clearConversation(conv) : conv;
  if (modo === "clear") await deps.storage.set(key, conversa);
  return { conversa, notas, doc, chamou: temConteudo };
}
