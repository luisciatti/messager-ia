import { useEffect, useMemo, useState } from "react";
import { ChatView } from "./ChatView";
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
          {contatos.map((a) => (
            <li key={a.id}>
              <button className={a.id === agente.id ? "ativo" : ""} onClick={() => setSelecionado(a.id)}>
                <Avatar id={a.id} label={a.nome} />
                <span>
                  <strong>{a.nome}</strong>
                  <small>{a.skills.slice(0, 3).join(", ")}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <ChatView key={agente.id} services={services} agent={agente} />
    </div>
  );
}
