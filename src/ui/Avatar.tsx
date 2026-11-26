const COLORS: Record<string, string> = {
  aws: "#ff9900",
  oci: "#c74634",
  devops: "#2f80ed",
  grupo: "#00a884",
};

export function Avatar({ id, label }: { id: string; label: string }) {
  return (
    <span className="avatar" style={{ background: COLORS[id] ?? "#667781" }} aria-hidden>
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}
