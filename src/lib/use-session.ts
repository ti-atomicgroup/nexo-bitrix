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

/** Aceita só caminhos internos ("/pessoas/1"), nunca "//outro-site" ou "https://...". */
export function safeReturnPath(value: string | null | undefined, fallback = "/hoje"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/entrar") || value.startsWith("/instalar")) return fallback;
  return value;
}
