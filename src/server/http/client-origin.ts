import "server-only";

/**
 * De onde veio o pedido, para os limites de tentativas. Conta `X-Forwarded-For` a partir da direita, porque a borda
 * acrescenta o endereço que viu no fim da lista: o que o cliente inventa fica à esquerda e não engana o limite.
 * NEXO_TRUSTED_PROXY_HOPS diz quantos proxies confiáveis há na frente do Nexo (padrão: 1). Com 0 (Nexo exposto direto), o
 * cabeçalho é ignorado, porque o cliente poderia inventá-lo: todos dividem a mesma chave, e o limite por conta segue valendo.
 */
const MAX_LENGTH = 64;

export function clientOrigin(request: Request, env: Record<string, string | undefined> = process.env): string {
  const parsed = Number.parseInt(env.NEXO_TRUSTED_PROXY_HOPS ?? "", 10);
  const hops = Number.isInteger(parsed) && parsed >= 0 ? parsed : 1;
  if (hops === 0) return "desconhecida";
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const origin = chain[Math.max(0, chain.length - hops)] ?? request.headers.get("x-real-ip")?.trim();
  return (origin || "desconhecida").slice(0, MAX_LENGTH);
}
