import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadInstanceEnvironment, pinAppOrigin } from "../../src/server/security";
import { Store } from "../../src/server/store";
import { BitrixClient } from "../../src/server/bitrix";
import { Auth } from "../../src/server/auth";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function instance() { const dir = mkdtempSync(join(tmpdir(), "nexo-install-")); dirs.push(dir); return dir; }

describe("instalação com somente webhook e senha", () => {
  it("gera uma chave privada estável e fixa apenas a origem HTTPS da instância Onnira", () => {
    const dir = instance();
    const first = loadInstanceEnvironment({ NEXO_DATA_DIR: dir });
    expect(first.encryptionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.appUrl).toBe("");
    expect(readFileSync(join(dir, ".nexo-instance-key"), "utf8")).toBe(first.encryptionKey);
    if (process.platform !== "win32") expect(statSync(join(dir, ".nexo-instance-key")).mode & 0o077).toBe(0);
    const store = new Store(join(dir, "nexo.sqlite"));
    expect(pinAppOrigin(first, store, "https://8437def3-67ef-4f7f-8aae-09e468ba4a5f.onnira.com.br/api/status")).toBe("https://8437def3-67ef-4f7f-8aae-09e468ba4a5f.onnira.com.br");
    store.close();
    const second = loadInstanceEnvironment({ NEXO_DATA_DIR: dir });
    expect(second.encryptionKey).toBe(first.encryptionKey);
    const reopened = new Store(join(dir, "nexo.sqlite"));
    expect(pinAppOrigin(second, reopened, "https://8437def3-67ef-4f7f-8aae-09e468ba4a5f.onnira.com.br/api/status")).toBe(first.appUrl);
    expect(() => pinAppOrigin(second, reopened, "https://evil.example.com/api/status")).toThrow();
    reopened.close();
  });

  it("usa o host público encaminhado pelo proxy quando Next.js expõe 0.0.0.0", () => {
    const dir = instance();
    const env = loadInstanceEnvironment({ NEXO_DATA_DIR: dir });
    const store = new Store(join(dir, "nexo.sqlite"));
    const internalUrl = "http://0.0.0.0:3000/api/status";
    const headers = new Headers({ host: "0.0.0.0:3000", "x-forwarded-host": "8437def3-67ef-4f7f-8aae-09e468ba4a5f.onnira.com.br", "x-forwarded-proto": "https" });
    try {
      expect(pinAppOrigin(env, store, internalUrl, headers)).toBe("https://8437def3-67ef-4f7f-8aae-09e468ba4a5f.onnira.com.br");
      expect(() => pinAppOrigin(env, store, internalUrl, new Headers({ host: "evil.example.com", "x-forwarded-proto": "https" }))).toThrow();
    } finally { store.close(); }
  });

  it("só permite ao navegador que conectou o webhook criar o primeiro RH", async () => {
    const dir = instance();
    const env = loadInstanceEnvironment({ NEXO_DATA_DIR: dir, NEXO_APP_URL: "https://nexo.example.com" });
    const store = new Store(join(dir, "nexo.sqlite"));
    const bitrix = new BitrixClient(store, env, async (input) => {
      const url = String(input);
      if (url.includes("user.current.json")) return Response.json({ result: { ID: "42", NAME: "Ana", LAST_NAME: "RH", ACTIVE: true } });
      if (url.includes("scope.json")) return Response.json({ result: ["task", "crm", "userfieldconfig", "user_brief"] });
      if (url.includes("user.get.json")) return Response.json({ result: [{ ID: "42", NAME: "Ana", LAST_NAME: "RH", ACTIVE: true }] });
      throw new Error(`Chamada inesperada: ${url}`);
    });
    const auth = new Auth(store, env, bitrix);
    const url = "https://cliente.bitrix24.com.br/rest/42/secret-code/";
    const verified = await bitrix.testWebhook(url);
    bitrix.configureWebhook(url, verified.userId);
    const grant = auth.issueInstallGrant();
    await expect(auth.bootstrapWithGrant("other-browser", "rh@example.com", "Senha-forte-de-RH-2026")).rejects.toMatchObject({ code: "INSTALL_GRANT_INVALID" });
    const result = await auth.bootstrapWithGrant(grant, "rh@example.com", "Senha-forte-de-RH-2026");
    expect(result.session.role).toBe("admin");
    expect(result.session.user.id).toBe("42");
    await expect(auth.bootstrapWithGrant(grant, "other@example.com", "Outra-senha-forte-2026")).rejects.toMatchObject({ code: "BOOTSTRAP_CLOSED" });
    store.close();
  });
});
