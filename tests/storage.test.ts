import { describe, expect, it } from "vitest";
import { createArtifactStorage, createMemoryStorage, createStorage, safeKey } from "../src/adapters/storage";

describe("safeKey", () => {
  it("troca caracteres inválidos", () => {
    expect(safeKey("conv/direto aws")).toBe("conv_direto_aws");
    expect(safeKey("..")).toBe("_");
  });
});

describe("memory storage", () => {
  it("grava e lê", async () => {
    const s = createMemoryStorage();
    expect(await s.get("x")).toBeNull();
    await s.set("x", { a: 1 });
    expect(await s.get("x")).toEqual({ a: 1 });
  });

  it("enfileira escritas na mesma chave (a última vence)", async () => {
    const s = createMemoryStorage();
    await Promise.all([s.set("k", { v: 1 }), s.set("k", { v: 2 }), s.set("k", { v: 3 })]);
    expect(await s.get("k")).toEqual({ v: 3 });
  });
});

describe("artifact storage", () => {
  it("usa a área privada do usuário", async () => {
    const paths: string[] = [];
    const docs = new Map<string, Record<string, unknown>>();
    const db = {
      collection(path: string) {
        return {
          doc(id: string) {
            const full = `${path}/${id}`;
            paths.push(full);
            return {
              async get() {
                const d = docs.get(full);
                return { exists: !!d, data: () => d };
              },
              async set(data: Record<string, unknown>) {
                docs.set(full, data);
              },
            };
          },
        };
      },
    };
    const s = createArtifactStorage(db, "u1");
    await s.set("nucleo", { fatos: [] });
    expect(paths[0]).toBe("data/users/u1/nucleo");
    expect(await s.get("nucleo")).toEqual({ fatos: [] });
  });
});

describe("createStorage", () => {
  it("cai na memória sem runtime nem localStorage", async () => {
    expect((await createStorage(undefined, undefined)).mode).toBe("memory");
  });

  it("não usa o db sem id de usuário", async () => {
    const runtime = { use: async (n: string) => (n === "user" ? { id: async () => null } : {}) };
    expect((await createStorage(runtime, undefined)).mode).toBe("memory");
  });
});
