import { describe, expect, it } from "vitest";
import { clientOrigin } from "@/server/http/client-origin";

const request = (headers: Record<string, string>) => new Request("http://localhost/api/auth/login", { headers });

describe("origem do pedido para os limites", () => {
  it("conta a partir da direita: quem o cliente inventa à esquerda não engana o limite", () => {
    expect(clientOrigin(request({ "x-forwarded-for": "6.6.6.6, 200.195.165.43" }), {})).toBe("200.195.165.43");
    expect(clientOrigin(request({ "x-forwarded-for": "200.195.165.43" }), {})).toBe("200.195.165.43");
  });

  it("respeita quantos proxies confiáveis existem na frente", () => {
    const headers = { "x-forwarded-for": "6.6.6.6, 200.195.165.43, 10.0.0.1" };
    expect(clientOrigin(request(headers), { NEXO_TRUSTED_PROXY_HOPS: "2" })).toBe("200.195.165.43");
    expect(clientOrigin(request(headers), { NEXO_TRUSTED_PROXY_HOPS: "9" })).toBe("6.6.6.6");
    expect(clientOrigin(request(headers), { NEXO_TRUSTED_PROXY_HOPS: "abc" })).toBe("10.0.0.1");
  });

  it("sem cabeçalho de proxy, todos dividem a mesma chave: o limite continua valendo", () => {
    expect(clientOrigin(request({}), {})).toBe("desconhecida");
    expect(clientOrigin(request({ "x-real-ip": "200.195.165.43" }), {})).toBe("200.195.165.43");
  });

  it("com 0 proxies, ignora o cabeçalho: o cliente poderia inventá-lo", () => {
    expect(clientOrigin(request({ "x-forwarded-for": "6.6.6.6" }), { NEXO_TRUSTED_PROXY_HOPS: "0" })).toBe("desconhecida");
  });

  it("não deixa o cliente estourar a chave com um valor gigante", () => {
    expect(clientOrigin(request({ "x-forwarded-for": "x".repeat(5000) }), {}).length).toBeLessThanOrEqual(64);
  });
});
