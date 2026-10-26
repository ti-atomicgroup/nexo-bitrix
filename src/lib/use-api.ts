"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type DependencyList } from "react";
import { type ApiError, isAbortError, toApiError } from "./api-client";

export interface UseApiOptions {
  /** Recarrega sozinho a cada N ms enquanto a aba está visível. */
  refreshMs?: number;
  /** `false` adia a leitura (ex.: falta um parâmetro). */
  enabled?: boolean;
  /** Recarrega quando a janela volta ao foco (padrão: sim). */
  revalidateOnFocus?: boolean;
}

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  /** Ainda não há resultado para os parâmetros atuais. */
  loading: boolean;
  /** Há um resultado na tela e uma nova leitura em andamento. */
  refreshing: boolean;
  reload: () => void;
  /** Atualiza o dado local (ex.: com a resposta de uma ação), sem nova leitura. */
  mutate: (next: T | ((current: T | undefined) => T | undefined)) => void;
}

interface Settled<T> {
  depsKey: string | null;
  requestKey: string | null;
  data: T | undefined;
  error: ApiError | null;
}

const FOCUS_THROTTLE_MS = 5_000;

/**
 * Leitura mínima da API: `{ data, error, loading, reload }`, cancelando a requisição anterior ao trocar
 * os parâmetros e ao desmontar. Mantém o dado anterior na tela enquanto recarrega.
 */
export function useApi<T>(loader: (signal: AbortSignal) => Promise<T>, deps: DependencyList, options: UseApiOptions = {}): ApiState<T> {
  const { refreshMs, enabled = true, revalidateOnFocus = true } = options;
  const depsKey = JSON.stringify(deps);
  const [nonce, setNonce] = useState(0);
  const requestKey = `${depsKey}#${nonce}`;
  const [settled, setSettled] = useState<Settled<T>>({ depsKey: null, requestKey: null, data: undefined, error: null });
  const lastStartRef = useRef(0);

  const load = useEffectEvent((signal: AbortSignal) => loader(signal));

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    lastStartRef.current = Date.now();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ depsKey, requestKey, data, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setSettled((previous) => ({
          depsKey,
          requestKey,
          data: previous.depsKey === depsKey ? previous.data : undefined,
          error: toApiError(error),
        }));
      },
    );
    return () => controller.abort();
  }, [depsKey, requestKey, enabled]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNonce((value) => value + 1);
    }, refreshMs);
    return () => window.clearInterval(id);
  }, [enabled, refreshMs]);

  useEffect(() => {
    if (!enabled || !revalidateOnFocus) return;
    const revalidate = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastStartRef.current < FOCUS_THROTTLE_MS) return;
      setNonce((value) => value + 1);
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [enabled, revalidateOnFocus]);

  const mutate = useCallback((next: T | ((current: T | undefined) => T | undefined)) => {
    setSettled((previous) => ({
      ...previous,
      data: typeof next === "function" ? (next as (current: T | undefined) => T | undefined)(previous.data) : next,
    }));
  }, []);

  const current = settled.depsKey === depsKey;
  return {
    data: current ? settled.data : undefined,
    error: current ? settled.error : null,
    loading: enabled && !current,
    refreshing: enabled && current && settled.requestKey !== requestKey,
    reload,
    mutate,
  };
}
