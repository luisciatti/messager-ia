import { describe, expect, it } from "vitest";
import { createImageStore, safeImageUrl } from "../src/adapters/imageStore";

describe("imageStore", () => {
  it("sem assets guarda a miniatura", async () => {
    const s = await createImageStore(undefined);
    expect(s.mode).toBe("local");
    expect(await s.save(new Blob(["x"]), "data:image/jpeg;base64,AA")).toBe("data:image/jpeg;base64,AA");
  });

  it("com assets sobe o arquivo e usa a URL", async () => {
    const s = await createImageStore({ use: async () => ({ upload: async () => ({ url: "/_blob/abc" }) }) });
    expect(await s.save(new Blob(["x"]), "thumb")).toBe("/_blob/abc");
  });

  it("filtra URLs inseguras", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeImageUrl("data:text/html,oi")).toBeUndefined();
    expect(safeImageUrl("/_blob/x")).toBe("/_blob/x");
  });
});
