import { useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { ChatView } from "./ChatView";
import { GroupView } from "./GroupView";
import { IconChart, IconHash, IconMemory, IconMenu } from "./icons";
import { MemoryPanel } from "./MemoryPanel";
import { createServices, type Services } from "./services";
import { TokensPanel } from "./TokensPanel";

export function App() {
  const [services, setServices] = useState<Services | null>(null);
  const [selecionado, setSelecionado] = useState("grupo:cloud");
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    createServices().then(setServices);
  }, []);

  const contatos = useMemo(
    () => (services ? [...services.agents.values()].filter((a) => a.papel === "especialista") : []),
    [services],
  );

  if (!services) return <p className="carregando">Carregando…</p>;

  const ir = (id: string) => {
    setSelecionado(id);
    setMenuAberto(false);
  };
  const item = (id: string) => `item ${selecionado === id ? "ativo" : ""}`;
  const grupoId = selecionado.startsWith("grupo:") ? selecionado.slice(6) : null;
  const agente = services.agents.get(selecionado);
  const mock = services.client.mode === "mock";

  let principal;
  if (selecionado === "memoria") principal = <MemoryPanel services={services} />;
  else if (selecionado === "tokens") principal = <TokensPanel services={services} />;
  else if (grupoId && services.groups.has(grupoId)) principal = <GroupView key={selecionado} services={services} group={services.groups.get(grupoId)!} />;
  else principal = <ChatView key={(agente ?? contatos[0]).id} services={services} agent={agente ?? contatos[0]} />;

  return (
    <div className={`app ${menuAberto ? "menu-aberto" : ""}`}>
      <aside className="lateral">
        <header className="espaco">
          <strong>Messager de IA</strong>
          <small>
            <span className={`ponto ${mock ? "ponto-mock" : ""}`} /> {mock ? "Modo simulado" : "Claude conectado"}
          </small>
        </header>

        <nav>
          <button className={item("memoria")} onClick={() => ir("memoria")}>
            <IconMemory /> Memória
          </button>
          <button className={item("tokens")} onClick={() => ir("tokens")}>
            <IconChart /> Uso de tokens
          </button>

          <h2>Canais</h2>
          {[...services.groups.values()].map((g) => (
            <button key={g.id} className={item(`grupo:${g.id}`)} onClick={() => ir(`grupo:${g.id}`)}>
              <IconHash /> {g.nome.toLowerCase()}
            </button>
          ))}

          <h2>Mensagens diretas</h2>
          {contatos.map((a) => (
            <button key={a.id} className={item(a.id)} onClick={() => ir(a.id)}>
              <span className="dm-avatar">
                <Avatar id={a.id} label={a.nome} size={20} />
                <span className="online" />
              </span>
              {a.nome}
            </button>
          ))}
        </nav>
      </aside>

      <main className="principal">
        <button className="abrir-menu" onClick={() => setMenuAberto((m) => !m)} aria-label="Abrir menu">
          <IconMenu />
        </button>
        {mock && (
          <p className="faixa faixa-mock">
            Modo simulado: fora do artifact as respostas são de teste e não gastam tokens. Para o Claude de verdade, abra o
            artifact no claude.ai.
          </p>
        )}
        {principal}
      </main>
      {menuAberto && <div className="sombra" onClick={() => setMenuAberto(false)} />}
    </div>
  );
}
