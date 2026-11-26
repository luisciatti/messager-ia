import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/adapters/storage";
import {
  findFixada,
  memoryBlock,
  MemoryStore,
  mergeNotas,
  NOTAS_MAX,
  searchNotes,
  terms,
  type Nota,
} from "../src/core/memory";

const nota = (texto: string, criadaEm = 1): Nota => ({ id: texto, texto, agentId: "aws", criadaEm });

describe("terms", () => {
  it("normaliza acentos, caixa e remove palavras vazias", () => {
    expect([...terms("Configuração do RDS na região")]).toEqual(["configuracao", "rds", "regiao"]);
  });
});

describe("searchNotes", () => {
  const notas = [
    nota("Backup do RDS via snapshot diário, retenção 7 dias"),
    nota("Tasy roda na OCI região Vinhedo"),
    nota("Pipeline usa GitHub Actions com Terraform"),
  ];

  it("acha só as notas relevantes", () => {
    const r = searchNotes(notas, "como está o backup do rds?");
    expect(r.map((n) => n.texto)).toEqual([notas[0].texto]);
  });

  it("não devolve nada sem termos em comum", () => {
    expect(searchNotes(notas, "olá tudo bem")).toEqual([]);
  });

  it("respeita o teto de tokens", () => {
    const grandes = [nota("rds " + "x".repeat(600)), nota("rds curto")];
    expect(searchNotes(grandes, "rds", 50).map((n) => n.texto)).toEqual(["rds curto"]);
  });
});

describe("findFixada", () => {
  const fixadas = [{ id: "1", agentId: "aws", pergunta: "Como fazer backup do RDS?", resposta: "Snapshots.", criadaEm: 1 }];

  it("acha pergunta parecida do mesmo agente", () => {
    expect(findFixada(fixadas, "aws", "como faço backup do rds")).not.toBeNull();
  });

  it("ignora outro agente ou pergunta diferente", () => {
    expect(findFixada(fixadas, "oci", "como fazer backup do rds")).toBeNull();
    expect(findFixada(fixadas, "aws", "qual o custo do S3?")).toBeNull();
  });
});

describe("mergeNotas", () => {
  it("substitui nota quase igual em vez de duplicar", () => {
    const r = mergeNotas([nota("Backup do RDS diário")], [{ texto: "backup do RDS diario", agentId: "aws", criadaEm: 2 }]);
    expect(r).toHaveLength(1);
    expect(r[0].criadaEm).toBe(2);
  });

  it("limita o total guardando as mais novas", () => {
    const muitas = Array.from({ length: NOTAS_MAX }, (_, i) => nota(`fato numero ${i} item${i}`, i));
    const r = mergeNotas(muitas, [{ texto: "fato novissimo zzz", agentId: "aws", criadaEm: 9999 }]);
    expect(r).toHaveLength(NOTAS_MAX);
    expect(r.at(-1)!.texto).toBe("fato novissimo zzz");
  });
});

describe("memoryBlock", () => {
  it("fica vazio sem memória", () => {
    expect(memoryBlock([], [])).toBe("");
  });

  it("marca notas como possivelmente desatualizadas", () => {
    expect(memoryBlock(["Tasy na OCI"], [nota("x")])).toMatch(/desatualizadas/);
  });
});

describe("MemoryStore", () => {
  it("salva núcleo e barra quando passa do teto", async () => {
    const m = new MemoryStore(createMemoryStorage());
    await m.saveNucleo(["Tasy na OCI", " ", "Native na AWS"]);
    expect((await m.load()).nucleo).toEqual(["Tasy na OCI", "Native na AWS"]);
    await expect(m.saveNucleo(["x".repeat(1000)])).rejects.toThrow(/Núcleo/);
  });

  it("fixa e remove respostas", async () => {
    const m = new MemoryStore(createMemoryStorage());
    await m.fixar({ agentId: "aws", pergunta: "p", resposta: "r", criadaEm: 5 });
    expect((await m.load()).fixadas).toHaveLength(1);
    await m.removeFixada("5");
    expect((await m.load()).fixadas).toHaveLength(0);
  });
});
