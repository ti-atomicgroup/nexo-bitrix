import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const SRC = fileURLToPath(new URL("../../src", import.meta.url));

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}

async function loadProxy(env: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env);
  return import("@/proxy");
}

afterEach(() => vi.unstubAllEnvs());

describe("Content-Security-Policy das páginas", () => {
  it("em produção não tem unsafe-inline nem unsafe-eval, e só admite o painel da Onnira como moldura", async () => {
    const { pageContentSecurityPolicy } = await loadProxy("production");
    const policy = pageContentSecurityPolicy("abc123");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-abc123'");
    expect(policy).toContain("frame-ancestors 'self' https://app.onnira.com https://app.onnira.com.br");
    expect(policy).not.toContain("localhost");
    expect(policy).toContain("object-src 'none'");
  });

  it("cada página recebe um nonce novo, com 128 bits, entregue também ao Next", async () => {
    const { proxy } = await loadProxy("production");
    const nonces = [1, 2].map(() => {
      const response = proxy(new NextRequest("http://localhost/entrar"));
      const policy = response.headers.get("content-security-policy") ?? "";
      const nonce = /'nonce-([^']+)'/.exec(policy)?.[1] ?? "";
      expect(Buffer.from(nonce, "base64")).toHaveLength(16);
      expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
      expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
      return nonce;
    });
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it("o matcher deixa de fora a API e os envios do link, que passam de 10 MB", async () => {
    const { config } = await loadProxy("production");
    const pattern = new RegExp(`^${config.matcher[0]!.source}$`);
    for (const path of ["/", "/entrar", "/hoje", "/j/abc", "/j/teste", "/diagnostico", "/pessoas/1"]) expect(pattern.test(path), path).toBe(true);
    for (const path of ["/api/me", "/api/probe", "/health", "/_next/static/x.js", "/icon.svg", "/j/abc/documento", "/j/abc/feito"]) expect(pattern.test(path), path).toBe(false);
  });
});

describe("nada depende de estilo inline", () => {
  it("nenhum componente usa o atributo style: em produção, o navegador o ignoraria no HTML vindo do servidor", () => {
    const offenders = filesIn(SRC)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => /\bstyle=\{/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it("toda tag <style> em página pública leva o nonce", () => {
    for (const file of filesIn(SRC).filter((item) => item.endsWith(".tsx"))) {
      const text = readFileSync(file, "utf8");
      const bare = /<style>/.test(text);
      expect(bare, relative(SRC, file)).toBe(false);
    }
  });
});
