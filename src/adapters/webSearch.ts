/**
 * Busca na web pelo conector Parallel Search do usuário (capacidade "mcp").
 * A chamada roda com as credenciais de quem abre o app: o código nunca vê tokens.
 * Sem o conector (ou fora do artifact): null, e o botão "Verificar na web" some.
 */
import { parseParallel, type Fonte, type WebSearch } from "../core/fontes";

export const SERVIDOR = "Parallel Search";
export const FERRAMENTA = "web_search";

interface McpErro {
  code?: string;
  retryable?: boolean;
  retryAfterMs?: number;
}

interface McpRuntime {
  callTool(server: string, tool: string, input: unknown): Promise<{ payload?: unknown }>;
}

interface ArtifactRuntime {
  use(name: string): Promise<unknown>;
}

/** Mensagem certa para cada código (cada um tem uma correção diferente). */
export function mensagemErro(e: unknown): string {
  const code = (e as McpErro)?.code;
  switch (code) {
    case "needs_reauth":
      return "O Parallel Search precisa ser reconectado: claude.ai → Configurações → Conectores.";
    case "server_not_connected":
    case "server_not_found":
      return "Conecte o Parallel Search em claude.ai → Configurações → Conectores para verificar na web.";
    case "selection_required":
      return "Há mais de um conector Parallel Search: escolha um no aviso do claude.ai.";
    case "not_in_manifest":
    case "approval_required":
    case "consent_required":
      return "A busca precisa da sua autorização. Clique de novo e permita o Parallel Search.";
    case "blocked_by_policy":
      return "A política da sua organização bloqueia esta busca.";
    case "server_unavailable":
    case "rate_limited":
      return "O Parallel Search não respondeu agora. Tente de novo em alguns segundos.";
    case "tool_error":
      return "A busca falhou do lado do Parallel Search. Tente reformular a pergunta.";
    default:
      return "Não consegui buscar na web agora.";
  }
}

export class WebSearchError extends Error {
  constructor(public readonly code: string | undefined, message: string) {
    super(message);
    this.name = "WebSearchError";
  }
}

const sessao = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

export function createParallelSearch(mcp: McpRuntime, espera = (ms: number) => new Promise((r) => setTimeout(r, ms))): WebSearch {
  return {
    async buscar(objetivo, consultas) {
      const input = { objective: objetivo, search_queries: consultas, session_id: sessao };
      const chamar = async () => parseParallel((await mcp.callTool(SERVIDOR, FERRAMENTA, input)).payload);
      try {
        return await chamar();
      } catch (e) {
        const err = e as McpErro;
        // leitura idempotente: no máximo 1 nova tentativa, só se o erro permitir
        if (err?.retryable) {
          await espera(Math.min(err.retryAfterMs ?? 1500 + Math.random() * 1000, 10_000));
          try {
            return await chamar();
          } catch (e2) {
            throw new WebSearchError((e2 as McpErro)?.code, mensagemErro(e2));
          }
        }
        throw new WebSearchError(err?.code, mensagemErro(e));
      }
    },
  };
}

export function createMockSearch(): WebSearch {
  return {
    async buscar(_objetivo, consultas): Promise<Fonte[]> {
      return [
        { url: "https://docs.aws.amazon.com/", titulo: "(simulado) Documentação oficial", data: "2026-01-01", trecho: `Trecho simulado para: ${consultas[0]}` },
        { url: "https://docs.oracle.com/", titulo: "(simulado) Outra fonte", trecho: "Segundo trecho simulado." },
      ];
    },
  };
}

/** Artifact com mcp → Parallel; dev local → mock; artifact sem mcp → null. */
export async function createWebSearch(
  runtime: ArtifactRuntime | undefined = (globalThis as { claude?: ArtifactRuntime }).claude,
): Promise<WebSearch | null> {
  if (!runtime?.use) return createMockSearch();
  const mcp = (await runtime.use("mcp").catch(() => null)) as McpRuntime | null;
  return mcp ? createParallelSearch(mcp) : null;
}
