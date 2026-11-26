/**
 * Agentes definidos em agents/*.md (frontmatter + corpo).
 * Comentários HTML do .md são removidos no build: documentação para
 * humanos sem custo de tokens em execução.
 */

import type { ModelTier } from "../adapters/claude";

export type AgentRole = "especialista" | "moderador" | "sintese";
export type AgentStyle = "caveman" | "normal" | "json";
export type ChatMode = "direto" | "grupo";

export interface AgentDef {
  id: string;
  nome: string;
  papel: AgentRole;
  tier: ModelTier;
  estilo: AgentStyle;
  skills: string[];
  /** Corpo do .md já sem comentários e espaços extras. */
  instrucoes: string;
}

/** Regras de estilo curtas de propósito: vão em toda chamada. */
export const STYLE_RULES: Record<AgentStyle, string> = {
  caveman: "Estilo: frases curtas, sem saudação, sem repetir a pergunta. Termos e comandos exatos.",
  normal: "Estilo: claro e direto, conclusão primeiro, sem rodeios.",
  json: "Responda só JSON válido, nada fora dele.",
};

/** Formato no grupo: curto e com saída para "nada a acrescentar" (S²-MAD). */
export const GROUP_RULE =
  "No grupo: até 5 linhas (posição, motivo, risco). Se nada novo a acrescentar, responda só PASSO.";

const TIERS: ModelTier[] = ["quick", "default", "complex"];
const ROLES: AgentRole[] = ["especialista", "moderador", "sintese"];
const STYLES: AgentStyle[] = ["caveman", "normal", "json"];

export function compactBody(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function parseValue(raw: string): string | string[] {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v;
}

export function parseAgent(source: string, file = "agente"): AgentDef {
  const m = source.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: frontmatter ausente`);

  const meta: Record<string, string | string[]> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = parseValue(line.slice(idx + 1));
  }

  const str = (k: string): string => {
    const v = meta[k];
    if (typeof v !== "string" || !v) throw new Error(`${file}: campo "${k}" obrigatório`);
    return v;
  };
  const oneOf = <T extends string>(k: string, allowed: T[]): T => {
    const v = str(k) as T;
    if (!allowed.includes(v)) throw new Error(`${file}: "${k}" inválido (${v})`);
    return v;
  };

  const instrucoes = compactBody(m[2]);
  if (!instrucoes) throw new Error(`${file}: corpo vazio`);

  return {
    id: str("id"),
    nome: str("nome"),
    papel: oneOf("papel", ROLES),
    tier: oneOf("tier", TIERS),
    estilo: oneOf("estilo", STYLES),
    skills: Array.isArray(meta.skills) ? meta.skills : [],
    instrucoes,
  };
}

/** Monta o system prompt: instruções + estilo + (grupo) + índice de skills. */
export function buildSystemPrompt(agent: AgentDef, mode: ChatMode): string {
  const parts = [agent.instrucoes, STYLE_RULES[agent.estilo]];
  if (mode === "grupo" && agent.papel === "especialista") parts.push(GROUP_RULE);
  // Só o índice: conteúdo completo das skills será carregado sob demanda.
  if (agent.skills.length) parts.push(`Skills: ${agent.skills.join(", ")}.`);
  return parts.join("\n");
}

export function loadAgents(files: Record<string, string>): Map<string, AgentDef> {
  const map = new Map<string, AgentDef>();
  for (const [path, src] of Object.entries(files)) {
    const agent = parseAgent(src, path);
    if (map.has(agent.id)) throw new Error(`id duplicado: ${agent.id}`);
    map.set(agent.id, agent);
  }
  return map;
}
