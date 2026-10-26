"use client";

import { useEffect, useState } from "react";

/** Devolve `value` só depois de `delayMs` sem mudanças (busca enquanto digita). */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
