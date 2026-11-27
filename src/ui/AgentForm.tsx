import { useMemo, useState } from "react";
import { buildSystemPrompt } from "../core/agents";
import { buildCustomAgent, saveCustomAgent, validar } from "../core/customAgents";
import { recarregarAgentes, type Services } from "./services";

export function AgentForm({ services, onCriado }: { services: Services; onCriado: (id: string) => void }) {
  const [nome, setNome] = useState("");
  const [escopo, setEscopo] = useState("");
  const [checklist, setChecklist] = useState("");
  const [skills, setSkills] = useState("");
  const [noGrupo, setNoGrupo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const agente = useMemo(
    () =>
      buildCustomAgent({
        nome,
        escopo,
        checklist,
        skills: skills.split(","),
        grupos: noGrupo ? [...services.groups.keys()].slice(0, 1) : [],
      }),
    [nome, escopo, checklist, skills, noGrupo, services],
  );
  const v = validar(agente, services.agents);
  const pronto = v.ok && escopo.trim().length >= 5;

  async function salvar() {
    if (!pronto) return;
    setSalvando(true);
    await saveCustomAgent(services.storage, agente);
    await recarregarAgentes(services);
    setSalvando(false);
    onCriado(agente.id);
  }

  return (
    <section className="painel">
      <h2>Novo agente</h2>
      <p className="ajuda">
        Mesmo formato dos agentes do projeto: escopo, checklist e regra contra invenção. Sem "você é um especialista
        sênior": pesquisa mostra que persona não melhora a precisão e custa tokens em toda chamada.
      </p>
      <form
        className="form-agente"
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Tasy" maxLength={30} />
        </label>
        <label>
          Escopo (do que ele cuida)
          <textarea rows={2} value={escopo} onChange={(e) => setEscopo(e.target.value)} placeholder="Ex.: operação e sustentação do Tasy na OCI" />
        </label>
        <label>
          Checklist (o que sempre considerar ao recomendar)
          <input value={checklist} onChange={(e) => setChecklist(e.target.value)} placeholder="Ex.: banco Oracle, janela de manutenção, backup" />
        </label>
        <label>
          Skills (separadas por vírgula)
          <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Ex.: tasy, oracle, ords" />
        </label>
        <label className="check">
          <input type="checkbox" checked={noGrupo} onChange={(e) => setNoGrupo(e.target.checked)} /> Participar do
          #{[...services.groups.values()][0]?.nome.toLowerCase()} (o moderador passa a considerá-lo: ~+10 tokens por mensagem
          no grupo)
        </label>

        <div className={`contador ${v.tokens > v.limite ? "alerta" : ""}`}>
          ~{v.tokens}/{v.limite} tokens por chamada
        </div>
        {nome && escopo && (
          <details>
            <summary>Ver o prompt que será enviado</summary>
            <pre className="md-code"><code>{buildSystemPrompt(agente, "direto")}</code></pre>
          </details>
        )}
        {v.erros.filter((e) => nome || !e.startsWith("Dê")).map((e) => <p key={e} className="alerta">{e}</p>)}
        <button type="submit" disabled={!pronto || salvando}>{salvando ? "Criando…" : "Criar agente"}</button>
      </form>
    </section>
  );
}
