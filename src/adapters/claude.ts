/**
 * Único ponto do app que fala com o Claude.
 *
 * - "artifact": roda dentro do artifact e usa claude.use("sample"),
 *   consumindo os limites da assinatura.
 * - "mock": desenvolvimento local (vite dev / testes), sem gastar nada.
 *
 * Para migrar para a API no futuro, basta criar outro adapter que
 * implemente ClaudeClient.
 */

export type ModelTier = "quick" | "default" | "complex";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskRequest {
  /** Instruções do agente (persona, skills, estilo). */
  system: string;
  /** Histórico já recortado/resumido. Deve terminar com role "user". */
  messages: ChatMessage[];
  modelTier?: ModelTier;
  onText?: (fullText: string) => void;
  signal?: AbortSignal;
}

export interface AskResult {
  text: string;
  truncated: boolean;
}

export interface ClaudeClient {
  mode: "artifact" | "mock";
  ask(req: AskRequest): Promise<AskResult>;
}

/** O sample não tem campo "system": as instruções vão no início da 1ª msg. */
export function buildInput(req: AskRequest): ChatMessage[] {
  if (req.messages.length === 0 || req.messages.at(-1)!.role !== "user") {
    throw new Error("messages deve terminar com uma mensagem do usuário");
  }
  const [first, ...rest] = req.messages;
  return [
    { role: first.role, content: `<instrucoes>\n${req.system}\n</instrucoes>\n\n${first.content}` },
    ...rest,
  ];
}

type SampleFn = (
  input: ChatMessage[],
  opts?: {
    modelTier?: ModelTier;
    signal?: AbortSignal;
    cache?: boolean;
    onText?: (e: { text: string; delta: string }) => void;
  },
) => Promise<AskResult>;

interface ArtifactRuntime {
  use(name: string): Promise<unknown>;
}

export function createArtifactClient(sample: SampleFn): ClaudeClient {
  return {
    mode: "artifact",
    async ask(req) {
      const res = await sample(buildInput(req), {
        modelTier: req.modelTier ?? "default",
        signal: req.signal,
        cache: false,
        onText: req.onText ? (e) => req.onText!(e.text) : undefined,
      });
      return { text: res.text, truncated: res.truncated };
    },
  };
}

export function createMockClient(): ClaudeClient {
  return {
    mode: "mock",
    async ask(req) {
      const last = req.messages.at(-1)?.content ?? "";
      const text = `[mock] recebi: "${last.slice(0, 80)}"`;
      req.onText?.(text);
      return { text, truncated: false };
    },
  };
}

/** Usa o runtime do artifact se existir; senão cai no mock. */
export async function createClaudeClient(
  runtime: ArtifactRuntime | undefined = (globalThis as { claude?: ArtifactRuntime }).claude,
): Promise<ClaudeClient> {
  if (runtime?.use) {
    const sample = (await runtime.use("sample")) as SampleFn | null;
    if (sample) return createArtifactClient(sample);
  }
  return createMockClient();
}
