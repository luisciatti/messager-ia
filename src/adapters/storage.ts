/**
 * Único ponto do app que persiste dados.
 *
 * - "artifact": db do artifact, na área privada do usuário
 *   (data/users/<id>/...), que nem o dono do artifact enxerga.
 * - "local": localStorage, para desenvolvimento no navegador.
 * - "memory": testes e último recurso.
 *
 * Cada chave é um documento. Escritas na mesma chave são enfileiradas
 * (o db pede uma escrita por vez por documento).
 */

export interface Storage {
  mode: "artifact" | "local" | "memory";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: object): Promise<void>;
}

/** Só caracteres aceitos em segmento de caminho do db. */
export function safeKey(key: string): string {
  const k = key.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_");
  return k === "." || k === ".." || !k ? "_" : k;
}

function serialized(write: (key: string, value: object) => Promise<void>) {
  const queues = new Map<string, Promise<void>>();
  return (key: string, value: object): Promise<void> => {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => write(key, value));
    queues.set(key, next);
    return next;
  };
}

export function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    mode: "memory",
    async get<T>(key: string) {
      const v = data.get(safeKey(key));
      return v ? (JSON.parse(v) as T) : null;
    },
    set: serialized(async (key, value) => {
      data.set(safeKey(key), JSON.stringify(value));
    }),
  };
}

export function createLocalStorage(ls: globalThis.Storage): Storage {
  const prefix = "messager-ia:";
  return {
    mode: "local",
    async get<T>(key: string) {
      try {
        const v = ls.getItem(prefix + safeKey(key));
        return v ? (JSON.parse(v) as T) : null;
      } catch {
        return null;
      }
    },
    set: serialized(async (key, value) => {
      try {
        ls.setItem(prefix + safeKey(key), JSON.stringify(value));
      } catch {
        /* cheio ou bloqueado: segue sem persistir */
      }
    }),
  };
}

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
}
export interface ArtifactDb {
  collection(path: string): { doc(id: string): DocRef };
}

export function createArtifactStorage(db: ArtifactDb, userId: string): Storage {
  const col = () => db.collection(`data/users/${userId}`);
  return {
    mode: "artifact",
    async get<T>(key: string) {
      const snap = await col().doc(safeKey(key)).get();
      return snap.exists ? (snap.data() as T) : null;
    },
    set: serialized(async (key, value) => {
      await col().doc(safeKey(key)).set(value as Record<string, unknown>);
    }),
  };
}

interface Runtime {
  use(name: string): Promise<unknown>;
}

/** db do artifact se houver usuário; senão localStorage; senão memória. */
export async function createStorage(
  runtime: Runtime | undefined = (globalThis as { claude?: Runtime }).claude,
  ls: globalThis.Storage | undefined = (globalThis as { localStorage?: globalThis.Storage }).localStorage,
): Promise<Storage> {
  if (runtime?.use) {
    const [db, user] = await Promise.all([runtime.use("db"), runtime.use("user")]);
    const id = user ? await (user as { id(): Promise<string | null> }).id() : null;
    if (db && id) return createArtifactStorage(db as ArtifactDb, id);
  }
  if (ls) return createLocalStorage(ls);
  return createMemoryStorage();
}
