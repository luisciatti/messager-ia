import { useRef, useState } from "react";
import { IconDiagram, IconImage, IconSend } from "./icons";
import { imageFromClipboard, prepareImage, type Anexo } from "./prepareImage";

export function Composer(props: {
  valor: string;
  placeholder: string;
  desabilitado: boolean;
  anexo: Anexo | null;
  diagrama: boolean;
  onChange: (v: string) => void;
  onAnexo: (a: Anexo | null) => void;
  onDiagrama: (v: boolean) => void;
  onEnviar: () => void;
}) {
  const { valor, placeholder, desabilitado, anexo, diagrama, onChange, onAnexo, onDiagrama, onEnviar } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  async function anexar(file: File | null | undefined) {
    if (!file) return;
    setErro(null);
    setProcessando(true);
    try {
      if (anexo) URL.revokeObjectURL(anexo.previewUrl);
      onAnexo(await prepareImage(file));
    } catch {
      setErro("Não consegui ler essa imagem.");
    } finally {
      setProcessando(false);
    }
  }

  // Não envia enquanto a imagem está sendo reduzida (senão sairia sem ela).
  const podeEnviar = !desabilitado && !processando && (!!valor.trim() || !!anexo);

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (podeEnviar) onEnviar();
      }}
    >
      <div
        className={`composer-caixa ${arrastando ? "arrastando" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void anexar(imageFromClipboard(e));
        }}
      >
        {anexo && (
          <div className="anexo">
            <img src={anexo.previewUrl} alt="Imagem anexada" />
            <span>~{anexo.tokens} tok</span>
            <button
              type="button"
              aria-label="Remover imagem"
              onClick={() => {
                URL.revokeObjectURL(anexo.previewUrl);
                onAnexo(null);
              }}
            >
              ×
            </button>
          </div>
        )}
        <textarea
          value={valor}
          placeholder={anexo ? "Mensagem opcional sobre a imagem" : placeholder}
          rows={2}
          disabled={desabilitado}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const f = imageFromClipboard(e);
            if (f) {
              e.preventDefault();
              void anexar(f);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (podeEnviar) onEnviar();
            }
          }}
        />
        <div className="composer-rodape">
          <div className="composer-ferramentas">
            <button type="button" className="ferramenta" title="Anexar imagem (ou cole com Ctrl+V)" aria-label="Anexar imagem" onClick={() => inputRef.current?.click()}>
              <IconImage />
            </button>
            <button
              type="button"
              className={`ferramenta ${diagrama ? "ligada" : ""}`}
              title="Pedir um diagrama na resposta (~+150 tokens)"
              aria-pressed={diagrama}
              onClick={() => onDiagrama(!diagrama)}
            >
              <IconDiagram /> <span>Diagrama</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void anexar(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <small>{erro ?? (processando ? "Preparando imagem…" : "Enter envia · Ctrl+V cola imagem")}</small>
          </div>
          <button type="submit" className="enviar" disabled={!podeEnviar} aria-label="Enviar">
            <IconSend />
          </button>
        </div>
      </div>
    </form>
  );
}
