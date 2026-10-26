/**
 * Acesso seguro ao armazenamento do navegador. Dentro do iframe da Onnira (cross-site) o navegador pode
 * bloquear `localStorage` e `sessionStorage` lançando exceção: cada acesso fica em try/catch.
 */
export type StorageArea = "local" | "session";

function area(kind: StorageArea): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGet(kind: StorageArea, key: string): string | null {
  try {
    return area(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Devolve `true` só se gravou e conseguiu ler de volta. */
export function safeSet(kind: StorageArea, key: string, value: string): boolean {
  try {
    const storage = area(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

export function safeRemove(kind: StorageArea, key: string): void {
  try {
    area(kind)?.removeItem(key);
  } catch {
    /* armazenamento bloqueado: nada a remover */
  }
}
