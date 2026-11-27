import { useEffect, useState } from "react";
import type { Services } from "./services";

/** true quando o conector de busca está disponível (resolve depois da abertura). */
export function useWeb(services: Services): boolean {
  const [ok, setOk] = useState(!!services.web);
  useEffect(() => {
    const on = () => setOk(!!services.web);
    on();
    globalThis.addEventListener?.("web-pronta", on);
    return () => globalThis.removeEventListener?.("web-pronta", on);
  }, [services]);
  return ok;
}
