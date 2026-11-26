import { describe, expect, it } from "vitest";
import { loadGroups, parseGroup } from "../src/core/groups";
import { groups } from "../src/core/registry";

describe("grupos", () => {
  it("carrega o grupo Cloud", () => {
    expect(groups.get("cloud")!.membros).toEqual(["aws", "oci", "devops"]);
  });

  it("rejeita membro desconhecido e grupo inválido", () => {
    expect(() => loadGroups({ x: { id: "g", nome: "G", membros: ["gcp"] } }, new Set(["aws"]))).toThrow(/desconhecido/);
    expect(() => parseGroup({ id: "g" })).toThrow(/inválido/);
  });
});
