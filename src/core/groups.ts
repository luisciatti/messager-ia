export interface GroupDef {
  id: string;
  nome: string;
  membros: string[];
  maxFalantes: number;
}

export function parseGroup(raw: unknown, file = "grupo"): GroupDef {
  const g = raw as Partial<GroupDef>;
  if (!g || typeof g.id !== "string" || typeof g.nome !== "string" || !Array.isArray(g.membros) || !g.membros.length) {
    throw new Error(`${file}: grupo inválido`);
  }
  return { id: g.id, nome: g.nome, membros: g.membros.map(String), maxFalantes: Math.max(1, Number(g.maxFalantes) || 3) };
}

export function loadGroups(files: Record<string, unknown>, agentIds: Set<string>): Map<string, GroupDef> {
  const map = new Map<string, GroupDef>();
  for (const [path, raw] of Object.entries(files)) {
    const g = parseGroup(raw, path);
    for (const m of g.membros) if (!agentIds.has(m)) throw new Error(`${path}: membro desconhecido ${m}`);
    map.set(g.id, g);
  }
  return map;
}
