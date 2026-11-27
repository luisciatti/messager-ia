/**
 * "Verificar na web": fontes reais sob demanda.
 *
 * Por que assim (custo x qualidade):
 * - Sob demanda, nunca automático: buscar só quando precisa rende mais do que
 *   buscar sempre (Self-RAG, Asai et al. 2023) e não dobra o custo das
 *   perguntas conceituais.
 * - A busca roda no conector (0 token da assinatura). Só os trechos entram no
 *   Claude: 3 resultados x ~600 caracteres (~500 tokens). Poucos trechos curtos
 *   funcionam melhor que muitos longos ("Lost in the Middle", Liu et al. 2023).
 * - Consultas montadas localmente (0 token), sem chamada extra para "planejar".
 * - A resposta é revisada no lugar (não duplica no contexto das próximas perguntas).
 */
import { buildSystemPrompt } from "./agents";
import { loadConversation } from "./chat";
import type { ChatDeps } from "./chat";
import type { Conversation } from "./conversation";
import { estimateTokens } from "./tokens";

export interface Fonte {
  url: string;
  titulo: string;
  data?: string;
  trecho: string;
}

export interface WebSearch {
  buscar(objetivo: string, consultas: string[]): Promise<Fonte[]>;
}

export const MAX_FONTES = 3;
export const MAX_TRECHO = 600;

export const FONTES_RULE =
  "Revise sua resposta anterior com as fontes abaixo. Corrija o que elas contradizem e marque [n] ao lado do que vier da fonte n. " +
  "Não cite fonte que não trate do ponto e não invente dados. Não liste as fontes no fim (o app mostra). " +
  "Se as fontes não ajudarem, mantenha a resposta e diga isso em 1 frase.";

/** Assuntos que mudam com o tempo: o botão aparece em destaque. */
const MUTAVEL =
  /\b(pre[çc]os?|custos?|valor|quanto custa|vers[ãa]o|vers[õo]es|limites?|quotas?|cotas?|atual|atualmente|hoje|recente|novo|nova|lan[çc]amento|descontinuad|deprecad|suporte|dispon[ií]vel|regi[ãa]o|regi[õo]es|20\d\d)\b/i;

export function precisaFontes(texto: string): boolean {
  return MUTAVEL.test(texto);
}

const STOP = new Set(
  ("a o as os um uma uns umas de do da dos das em no na nos nas por pra para com sem que qual quais como " +
    "e ou se eu me meu minha voce você isso esse essa este esta é e ser ter tem tenho quero queria preciso " +
    "pode posso consigo fazer faz sobre mais menos muito ao à às aos já não sim lá aqui ai aí")
    .split(" "),
);

/** 1-2 consultas de 3-6 palavras-chave, montadas sem gastar tokens. */
export function montarConsultas(pergunta: string, area?: string): string[] {
  const palavras = pergunta
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !STOP.has(p));
  const unicas = [...new Set(palavras)];
  const temArea = area ? unicas.includes(area.toLowerCase()) : true;
  const base = [...(temArea || !area ? [] : [area.toLowerCase()]), ...unicas].slice(0, 6);
  if (!base.length) return [pergunta.slice(0, 60)];
  const consultas = [base.join(" ")];
  if (unicas.length > 6) consultas.push([...(temArea || !area ? [] : [area.toLowerCase()]), ...unicas.slice(-5)].join(" "));
  if (precisaFontes(pergunta) && !/20\d\d/.test(pergunta)) consultas.push(`${base.slice(0, 5).join(" ")} ${new Date().getFullYear()}`);
  return [...new Set(consultas)].slice(0, 3);
}

/** Corta no limite de palavra, sem quebrar no meio. */
export function cortar(texto: string, max = MAX_TRECHO): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const ultimo = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimo > max * 0.6 ? ultimo : max)}…`;
}

/** Converte o payload do Parallel Search: só https, sem domínio repetido, trechos curtos. */
export function parseParallel(payload: unknown): Fonte[] {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const vistos = new Set<string>();
  const out: Fonte[] = [];
  for (const r of results as Record<string, unknown>[]) {
    const url = typeof r.url === "string" ? r.url : "";
    if (!url.startsWith("https://")) continue;
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (vistos.has(host)) continue;
    const excerpts = Array.isArray(r.excerpts) ? r.excerpts.filter((e): e is string => typeof e === "string") : [];
    const trecho = cortar(excerpts.join(" "));
    if (!trecho) continue;
    vistos.add(host);
    out.push({
      url,
      titulo: cortar(typeof r.title === "string" && r.title ? r.title : host, 120),
      data: typeof r.publish_date === "string" ? r.publish_date.slice(0, 10) : undefined,
      trecho,
    });
    if (out.length >= MAX_FONTES) break;
  }
  return out;
}

export function blocoFontes(fontes: Fonte[]): string {
  return fontes.map((f, i) => `[${i + 1}] ${f.titulo}${f.data ? ` (${f.data})` : ""}\n${f.trecho}`).join("\n\n");
}

export interface VerificarDeps extends ChatDeps {
  web: WebSearch;
}

export interface VerificarResult {
  conversa: Conversation;
  fontes: Fonte[];
  revisou: boolean;
}

export class SemFontesError extends Error {
  constructor() {
    super("A busca não trouxe fontes úteis para esta pergunta.");
    this.name = "SemFontesError";
  }
}

/** Última resposta visível (não interna) e a pergunta do usuário antes dela. */
export function ultimaResposta(conv: Conversation): { iPergunta: number; iResposta: number } | null {
  for (let i = conv.mensagens.length - 1; i >= 0; i--) {
    const m = conv.mensagens[i];
    if (m.role === "user") return null;
    if (m.interna) continue;
    for (let j = i - 1; j >= 0; j--) if (conv.mensagens[j].role === "user") return { iPergunta: j, iResposta: i };
    return null;
  }
  return null;
}

/**
 * Busca, recorta e revisa a última resposta da conversa `key` com citações.
 * 1 chamada ao conector + 1 chamada ao Claude.
 */
export async function verificarNaWeb(deps: VerificarDeps, key: string, groupId?: string): Promise<VerificarResult> {
  let conv = await loadConversation(deps.storage, key);
  const alvo = ultimaResposta(conv);
  if (!alvo) throw new Error("nada para verificar");
  const pergunta = conv.mensagens[alvo.iPergunta].content || "";
  const resposta = conv.mensagens[alvo.iResposta];
  const agentId = resposta.agentId ?? "sintetizador";
  const agent = deps.agents.get(agentId);
  if (!agent) throw new Error(`agente desconhecido: ${agentId}`);

  const area = agent.nome.length <= 12 && agent.papel === "especialista" ? agent.nome : undefined;
  const objetivo = `${pergunta.slice(0, 300)}${area ? ` (contexto: ${area})` : ""}. Prefira documentação oficial e fontes recentes.`;
  const fontes = await deps.web.buscar(objetivo, montarConsultas(pergunta || resposta.content.slice(0, 120), area));
  if (!fontes.length) throw new SemFontesError();

  const r = await deps.metered.ask(
    {
      system: `${buildSystemPrompt(agent, "direto")}\n${FONTES_RULE}`,
      messages: [{ role: "user", content: `Pergunta: ${pergunta || "[imagem]"}\n\nSua resposta anterior:\n${resposta.content}\n\nFontes:\n${blocoFontes(fontes)}` }],
      modelTier: agent.tier === "quick" ? "default" : agent.tier,
    },
    { agentId, groupId, reason: "fontes" },
  );

  const mensagens = conv.mensagens.slice();
  mensagens[alvo.iResposta] = {
    ...resposta,
    content: r.text,
    tokens: estimateTokens(r.text),
    fontes: fontes.map(({ url, titulo, data }) => ({ url, titulo, data })),
    feedback: undefined,
  };
  conv = { ...conv, mensagens, atualizadoEm: Date.now() };
  await deps.storage.set(key, conv);
  return { conversa: conv, fontes, revisou: true };
}
