"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getToken, subscribeToken } from "./api-client";

/** `null` enquanto renderiza no servidor (o token só existe no navegador); depois, se há sessão guardada. */
export function useHasToken(): boolean | null {
  return useSyncExternalStore(subscribeToken, hasTokenSnapshot, serverSnapshot);
}

function hasTokenSnapshot(): boolean {
  return getToken() !== null;
}

function serverSnapshot(): null {
  return null;
}

/**
 * Relógio para rótulos relativos ("há 1 min"). Arredonda para `stepMs`, então só re-renderiza quando o
 * rótulo pode mudar. `null` no servidor.
 */
export function useNow(stepMs = 30_000): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = window.setInterval(onChange, Math.min(stepMs, 30_000));
      return () => window.clearInterval(id);
    },
    [stepMs],
  );
  const snapshot = useCallback(() => Math.floor(Date.now() / stepMs) * stepMs, [stepMs]);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Base fictícia: só para o mesmo analisador de URL do navegador dizer se o caminho continua no próprio site. */
const SAME_SITE = "http://nexo.invalid";

/**
 * Aceita só caminhos internos ("/pessoas/1"), nunca "//outro-site" ou "https://...". Compara a origem depois de o
 * analisador de URL normalizar o valor, como o roteador fará: "/\t/outro-site" (tab ou quebra de linha somem) e
 * "/\outro-site" viram "//outro-site" e são recusados. Devolve o caminho já normalizado, nunca o texto cru.
 */
export function safeReturnPath(value: string | null | undefined, fallback = "/hoje"): string {
  if (!value || !value.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(value, SAME_SITE);
  } catch {
    return fallback;
  }
  if (url.origin !== SAME_SITE) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith("/entrar") || path.startsWith("/instalar")) return fallback;
  return path;
}
