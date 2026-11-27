/**
 * Roteamento de modelo (inspirado no RouteLLM): perguntas claramente
 * simples vão para o tier leve; o resto fica no tier do agente.
 * Regra local e conservadora: 0 tokens para decidir.
 */
import type { ModelTier } from "../adapters/claude";

const COMPLEXO =
  /\b(erro|falha|falhou|quebr|n[aã]o funciona|timeout|50[0-9]|40[0-9]|configur|instal|terraform|pipeline|deploy|migr|arquitet|desenh|custo|pre[cç]o|seguran|iam|policy|pol[ií]tica|script|comando|passo a passo|implant|produ[cç][aã]o|backup|restore|escal|performance|lento|log)/i;
const SIMPLES =
  /^\s*(o que (é|e|s[aã]o|significa)|oq (é|e)|pra que serve|para que serve|qual (é )?a diferen[cç]a|o que quer dizer|defina|define|explica (rapidinho|r[aá]pido)|me explica o que)/i;

export const SIMPLE_MAX_CHARS = 160;

export function routeTier(
  texto: string,
  agentTier: ModelTier,
  opts: { imagem?: boolean; diagrama?: boolean } = {},
): ModelTier {
  if (agentTier === "quick" || opts.imagem || opts.diagrama) return agentTier;
  const t = texto.trim();
  if (!t || t.length > SIMPLE_MAX_CHARS || COMPLEXO.test(t)) return agentTier;
  return SIMPLES.test(t) ? "quick" : agentTier;
}
