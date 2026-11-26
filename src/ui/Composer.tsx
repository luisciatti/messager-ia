import { IconSend } from "./icons";

export function Composer(props: {
  valor: string;
  placeholder: string;
  desabilitado: boolean;
  onChange: (v: string) => void;
  onEnviar: () => void;
}) {
  const { valor, placeholder, desabilitado, onChange, onEnviar } = props;
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
    >
      <div className="composer-caixa">
        <textarea
          value={valor}
          placeholder={placeholder}
          rows={2}
          disabled={desabilitado}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onEnviar();
            }
          }}
        />
        <div className="composer-rodape">
          <small>Enter envia · Shift+Enter quebra linha</small>
          <button type="submit" disabled={desabilitado || !valor.trim()} aria-label="Enviar">
            <IconSend />
          </button>
        </div>
      </div>
    </form>
  );
}
