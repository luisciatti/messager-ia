import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "../src/core/markdown";

describe("parseInline", () => {
  it("reconhece negrito, código e itálico", () => {
    expect(parseInline("use **ALB** com `443` e *TLS*")).toEqual([
      { t: "txt", v: "use " },
      { t: "b", v: "ALB" },
      { t: "txt", v: " com " },
      { t: "code", v: "443" },
      { t: "txt", v: " e " },
      { t: "i", v: "TLS" },
    ]);
  });

  it("mantém HTML como texto", () => {
    expect(parseInline("<script>x</script>")).toEqual([{ t: "txt", v: "<script>x</script>" }]);
  });
});

describe("parseMarkdown", () => {
  it("separa parágrafos, listas, títulos e código", () => {
    const b = parseMarkdown("**Tipos:**\n\n- ALB\n- NLB\n\n1. um\n2. dois\n\n## Título\n```mermaid\ngraph LR\nA-->B\n```");
    expect(b.map((x) => x.t)).toEqual(["p", "ul", "ol", "h", "code"]);
    expect(b[1]).toMatchObject({ items: [[{ v: "ALB" }], [{ v: "NLB" }]] });
    expect(b[4]).toEqual({ t: "code", lang: "mermaid", code: "graph LR\nA-->B" });
  });

  it("fecha bloco de código mesmo sem a cerca final", () => {
    expect(parseMarkdown("```\nabc")).toEqual([{ t: "code", lang: "", code: "abc" }]);
  });
});
