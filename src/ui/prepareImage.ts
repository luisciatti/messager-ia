import { fitImage } from "../core/images";

export interface Anexo {
  blob: Blob;
  tokens: number;
  previewUrl: string;
  thumb: string;
}

async function toBlob(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("falha ao converter imagem"))), type, q));
}

/** Reduz a imagem até o teto de tokens e gera uma miniatura para o histórico. */
export async function prepareImage(file: Blob): Promise<Anexo> {
  const bmp = await createImageBitmap(file);
  const alvo = fitImage(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = alvo.width;
  canvas.height = alvo.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, alvo.width, alvo.height);
  ctx.drawImage(bmp, 0, 0, alvo.width, alvo.height);
  const blob = await toBlob(canvas, "image/jpeg", 0.9);

  const escala = Math.min(1, 360 / Math.max(alvo.width, alvo.height));
  const mini = document.createElement("canvas");
  mini.width = Math.round(alvo.width * escala);
  mini.height = Math.round(alvo.height * escala);
  mini.getContext("2d")!.drawImage(canvas, 0, 0, mini.width, mini.height);

  return { blob, tokens: alvo.tokens, previewUrl: URL.createObjectURL(blob), thumb: mini.toDataURL("image/jpeg", 0.7) };
}

export function imageFromClipboard(e: React.ClipboardEvent | DragEvent | React.DragEvent): File | null {
  const dt = "clipboardData" in e ? e.clipboardData : e.dataTransfer;
  if (!dt) return null;
  for (const f of Array.from(dt.files)) if (f.type.startsWith("image/")) return f;
  return null;
}
