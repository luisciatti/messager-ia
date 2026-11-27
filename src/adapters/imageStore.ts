/**
 * Onde a imagem enviada fica guardada para aparecer no histórico.
 * - artifact: capability "assets" (arquivo fora do banco; o banco guarda só a URL).
 * - local: miniatura data: pequena (o documento da conversa tem limite de tamanho).
 */

export interface ImageStore {
  mode: "artifact" | "local";
  save(full: Blob, thumbDataUrl: string): Promise<string | undefined>;
}

interface Runtime {
  use(name: string): Promise<unknown>;
}
interface Assets {
  upload(blob: Blob): Promise<{ url: string }>;
}

export async function createImageStore(
  runtime: Runtime | undefined = (globalThis as { claude?: Runtime }).claude,
): Promise<ImageStore> {
  const assets = runtime?.use ? ((await runtime.use("assets")) as Assets | null) : null;
  if (assets) {
    return {
      mode: "artifact",
      async save(full, thumb) {
        try {
          return (await assets.upload(full)).url;
        } catch {
          return thumb; // sem permissão ou cota: fica a miniatura
        }
      },
    };
  }
  return { mode: "local", save: async (_full, thumb) => thumb };
}

/** Só exibe URLs seguras de imagem. */
export function safeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return /^(data:image\/(png|jpeg|webp|gif);|https:\/\/|\/_blob\/)/.test(url) ? url : undefined;
}
