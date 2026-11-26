import { useEffect, useMemo, useState } from "react";
import { ChatView } from "./ChatView";
import { GroupView } from "./GroupView";
import { MemoryPanel } from "./MemoryPanel";
import { Avatar } from "./Avatar";
import { createServices, type Services } from "./services";

export function App() {
  const [services, setServices] = useState<Services | null>(null);
  const [selecionado, setSelecionado] = useState("aws");

  useEffect(() => {
    createServices().then(setServices);
  }, []);

  const contatos = useMemo(
    () => (services ? [...services.agents.values()].filter((a) => a.papel === "especialista") : []),
    [services],
  );

  if (!services) return <p className="carregando">Carregando…</p>;
  const agente = services.agents.get(selecionado) ?? contatos[0];

  return (
    <div className="app">
      <aside className="contatos">
        <header>
          <strong>Messager de IA</strong>
          <small>
            Claude: {services.client.mode} · dados: {services.storage.mode}
          </small>
        </header>
        <ul>
          {[...services.groups.values()].map((g) => (
            <li key={g.id}>
              <button className={selecionado === `grupo:${g.id}` ? "ativo" : ""} onClick={() => setSelecionado(`grupo:${g.id}`)}>
                <Avatar id="grupo" label={g.nome} />
                <span>
                  <strong>{g.nome}</strong>
                  <small>Grupo · {g.membros.length} agentes</small>
                </span>
              </button>
            </li>
          ))}
          {contatos.map((a) => (
            <li key={a.id}>
              <button className={a.id === selecionado ? "ativo" : ""} onClick={() => setSelecionado(a.id)}>
                <Avatar id={a.id} label={a.nome} />
                <span>
                  <strong>{a.nome}</strong>
                  <small>{a.skills.slice(0, 3).join(", ")}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <nav className="atalhos">
          <button className={selecionado === "memoria" ? "ativo" : ""} onClick={() => setSelecionado("memoria")}>
            🧠 Memória
          </button>
        </nav>
      </aside>
      {selecionado === "memoria" ? (
        <MemoryPanel services={services} />
      ) : selecionado.startsWith("grupo:") && services.groups.has(selecionado.slice(6)) ? (
        <GroupView key={selecionado} services={services} group={services.groups.get(selecionado.slice(6))!} />
      ) : (
        <ChatView key={agente.id} services={services} agent={agente} />
      )}
    </div>
  );
}
