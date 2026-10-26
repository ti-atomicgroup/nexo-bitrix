import "server-only";

/**
 * Codificador no estilo `http_build_query` do PHP, usado nos comandos de `batch`:
 * { filter: { ID: [1, 2] }, select: ["ID"] } → "filter[ID][0]=1&filter[ID][1]=2&select[0]=ID".
 * null/undefined e listas vazias somem (como no PHP); booleanos viram 1/0; datas viram ISO.
 */
export function buildQuery(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) append(pairs, encodeURIComponent(key), value);
  return pairs.join("&");
}

function append(pairs: string[], prefix: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (value instanceof Date) {
    pairs.push(`${prefix}=${encodeURIComponent(value.toISOString())}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => append(pairs, `${prefix}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) append(pairs, `${prefix}[${encodeURIComponent(key)}]`, item);
    return;
  }
  const scalar = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  pairs.push(`${prefix}=${encodeURIComponent(scalar)}`);
}
