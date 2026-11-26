const COLORS: Record<string, string> = {
  aws: "#e8890c",
  oci: "#c74634",
  devops: "#2f6fd6",
  sintetizador: "#7a4fc9",
  moderador: "#5c6670",
  voce: "#1d7a5f",
};

export function Avatar({ id, label, size = 36 }: { id: string; label: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: COLORS[id] ?? "#5c6670", width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}
