import { readFileSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedTarget, guardedLookup, isAllowedPortalHost, isBlockedAddress, safeFetch } from "../../../scripts/lib/bitrix-policy.mjs";
import { parseWebhookUrl } from "@/server/bitrix/webhook-url";

describe("portais permitidos", () => {
  it.each(["empresa.bitrix24.com.br", "EMPRESA.bitrix24.com", "a.bitrix24.eu", "b.bitrix24.de", "c.bitrix24.com.tr", "minha-empresa.bitrix24.es"])("aceita %s", (host) => {
    expect(isAllowedPortalHost(host, {})).toBe(true);
  });

  it.each([
    "bitrix24.com.br",
    "a.b.bitrix24.com",
    "empresa.bitrix24.evil",
    "empresa.bitrix24.com.evil.com",
    "bitrix24.com.evil.com",
    "empresa-bitrix24.com",
    "crm.minhaempresa.com",
    "localhost",
    "10.0.0.5",
    "169.254.169.254",
    "",
  ])("recusa %s", (host) => {
    expect(isAllowedPortalHost(host, {})).toBe(false);
  });

  it("domínio próprio só entra pela lista administrada no servidor", () => {
    expect(isAllowedPortalHost("crm.minhaempresa.com", { NEXO_BITRIX_ALLOWED_HOSTS: " CRM.minhaempresa.com , outro.exemplo.com" })).toBe(true);
    expect(isAllowedPortalHost("x.minhaempresa.com", { NEXO_BITRIX_ALLOWED_HOSTS: "crm.minhaempresa.com" })).toBe(false);
    // A lista não libera endereço IP nem nome interno.
    expect(isAllowedPortalHost("10.0.0.5", { NEXO_BITRIX_ALLOWED_HOSTS: "10.0.0.5" })).toBe(false);
    expect(isAllowedPortalHost("localhost", { NEXO_BITRIX_ALLOWED_HOSTS: "localhost" })).toBe(false);
  });

  it("o endereço completo precisa ser https, sem usuário nem porta, e só em /rest/", () => {
    expect(allowedTarget("https://empresa.bitrix24.com.br/rest/1/abc/user.current.json", {})?.hostname).toBe("empresa.bitrix24.com.br");
    for (const url of [
      "http://empresa.bitrix24.com.br/rest/1/abc/x.json",
      "https://user:pw@empresa.bitrix24.com.br/rest/1/abc/x.json",
      "https://empresa.bitrix24.com.br:8443/rest/1/abc/x.json",
      "https://empresa.bitrix24.com.br/outra/1/abc/x.json",
      "https://crm.minhaempresa.com/rest/1/abc/x.json",
      "lixo",
    ]) {
      expect(allowedTarget(url, {}), url).toBeNull();
    }
  });

  it("o webhook aplica a mesma política ao ser colado", () => {
    expect(() => parseWebhookUrl("https://crm.minhaempresa.com/rest/27/k3y_value")).toThrow(/portal Bitrix24/);
    expect(parseWebhookUrl("https://empresa.bitrix24.com.br/rest/27/k3y_value").portal).toBe("https://empresa.bitrix24.com.br");
    vi.stubEnv("NEXO_BITRIX_ALLOWED_HOSTS", "crm.minhaempresa.com");
    expect(parseWebhookUrl("https://crm.minhaempresa.com/rest/27/k3y_value").portal).toBe("https://crm.minhaempresa.com");
    vi.unstubAllEnvs();
  });
});

describe("endereços privados e reservados", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "100::1",
    "2001:db8::1",
    "2001::1",
    "2002:a00:1::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
    "isto não é IP",
  ])("bloqueia %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["200.195.165.43", "8.8.8.8", "172.32.0.1", "11.0.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2800:3f0:4001::1"])("permite %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

/** Promessa em volta do `lookup` que o módulo https usa, com a resolução real trocada. */
function lookupWith(resolved: Array<{ address: string; family: number }>, options: { all?: boolean } = {}) {
  return new Promise<{ error: NodeJS.ErrnoException | null; result: unknown }>((resolve) => {
    guardedLookup("empresa.bitrix24.com.br", options, (error: NodeJS.ErrnoException | null, result: unknown) => resolve({ error, result }), (_host: string, _options: unknown, done: (error: null, list: typeof resolved) => void) => done(null, resolved));
  });
}

describe("resolução de DNS na hora de conectar", () => {
  it("entrega só endereços públicos, nas duas formas que o Node pede", async () => {
    const list = [{ address: "200.195.165.43", family: 4 }];
    expect((await lookupWith(list, { all: true })).result).toEqual(list);
    expect((await lookupWith(list)).result).toBe("200.195.165.43");
  });

  it("recusa se qualquer endereço resolvido for privado", async () => {
    const { error } = await lookupWith([{ address: "200.195.165.43", family: 4 }, { address: "10.0.0.5", family: 4 }], { all: true });
    expect(error?.code).toBe("NEXO_BLOCKED_ADDRESS");
  });
});

describe("cópia do envio", () => {
  it("o código da política não aparece fora do módulo: worker e servidor importam o mesmo arquivo", () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    for (const file of ["../../../scripts/bitrix-worker.mjs", "../../../src/server/bitrix/webhook-url.ts", "../../../src/server/runtime/egress.ts", "../../../src/server/bitrix/relay.ts", "../../../src/server/bitrix/client.ts"]) {
      expect(read(file), file).toContain("lib/bitrix-policy.mjs");
      expect(read(file), file).not.toMatch(/\\\.bitrix24\\\./);
    }
    expect(read("../../../src/server/bitrix/relay.ts")).not.toMatch(/\bfetch\(input, init\)\s*;?\s*$/m);
  });
});

describe("transporte direto", () => {
  const closers: Array<() => void> = [];
  afterEach(() => {
    for (const close of closers.splice(0)) close();
    vi.unstubAllEnvs();
  });

  it("recusa host fora da política sem abrir conexão", async () => {
    await expect(safeFetch("https://crm.minhaempresa.com/rest/1/abc/x.json", { method: "POST" })).rejects.toMatchObject({ cause: { code: "NEXO_TARGET_BLOCKED" } });
  });

  it("rebinding: nome permitido que passa a resolver para IP interno não recebe a conexão", async () => {
    let connected = false;
    const internal = createTcpServer(() => {
      connected = true;
    });
    await new Promise<void>((resolve) => internal.listen(0, "127.0.0.1", resolve));
    closers.push(() => internal.close());
    const port = (internal.address() as { port: number }).port;
    vi.stubEnv("NEXO_BITRIX_ALLOWED_HOSTS", "portal.exemplo.com");
    const attack = (_host: string, _options: unknown, done: (error: null, list: Array<{ address: string; family: number }>) => void) => done(null, [{ address: "127.0.0.1", family: 4 }]);
    await expect(safeFetch(`https://portal.exemplo.com/rest/1/abc/x.json`, { method: "POST", port, resolver: attack } as RequestInit)).rejects.toMatchObject({ cause: { code: "NEXO_BLOCKED_ADDRESS" } });
    expect(connected).toBe(false);
  });
});
