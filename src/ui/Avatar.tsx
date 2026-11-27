const COLORS: Record<string, string> = {
  aws: "#e8890c",
  oci: "#c74634",
  devops: "#2f6fd6",
  sintetizador: "#7a4fc9",
  moderador: "#5c6670",
  voce: "#1d7a5f",
};

const PALETA = ["#0b8a7a", "#9b4dca", "#d14d72", "#3c7d3f", "#b0721b", "#4d5fd1"];
function corPara(id: string): string {
  if (COLORS[id]) return COLORS[id];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

export function Avatar({ id, label, size = 36 }: { id: string; label: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: corPara(id), width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}
