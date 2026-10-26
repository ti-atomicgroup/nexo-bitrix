import { describe, expect, it } from "vitest";
import { buildQuery } from "@/server/bitrix/query";
import { maskWebhookUrl, normalizeWebhookUrl, parseWebhookUrl, redactWebhookSecrets } from "@/server/bitrix/webhook-url";
import { parsePhpQuery } from "../../fakes/fake-bitrix";

describe("buildQuery (http_build_query do PHP)", () => {
  it("codifica listas e objetos aninhados com colchetes", () => {
    expect(buildQuery({ filter: { ID: [1, 2] }, select: ["ID", "TITLE"] })).toBe("filter[ID][0]=1&filter[ID][1]=2&select[0]=ID&select[1]=TITLE");
  });

  it("escapa valores e chaves com operadores", () => {
    expect(buildQuery({ TASKID: 5, FIELDS: { TITLE: "Olá & tchau", PARENT_ID: 0 } })).toBe("TASKID=5&FIELDS[TITLE]=Ol%C3%A1%20%26%20tchau&FIELDS[PARENT_ID]=0");
    expect(buildQuery({ filter: { ">=CREATED_DATE": "2026-10-26" } })).toBe("filter[%3E%3DCREATED_DATE]=2026-10-26");
  });

  it("omite nulos e listas vazias e converte booleanos", () => {
    expect(buildQuery({ a: null, b: undefined, c: [], d: true, e: false })).toBe("d=1&e=0");
  });

  it("é lido de volta como o PHP faria", () => {
    const params = { TASKID: 7, FIELDS: { TITLE: "Revogar acesso: Google Workspace", PARENT_ID: 1001 }, select: ["ID", "XML_ID"] };
    expect(parsePhpQuery(buildQuery(params))).toEqual({ TASKID: "7", FIELDS: { TITLE: "Revogar acesso: Google Workspace", PARENT_ID: "1001" }, select: ["ID", "XML_ID"] });
  });
});

describe("parseWebhookUrl", () => {
  it("separa portal, usuário e segredo (barra final opcional, domínio próprio aceito)", () => {
    expect(parseWebhookUrl("https://Empresa.Bitrix24.com.br/rest/1/abc123def456/")).toEqual({ portal: "https://empresa.bitrix24.com.br", userId: "1", secret: "abc123def456" });
    expect(parseWebhookUrl(" https://crm.minhaempresa.com/rest/27/k3y_value ")).toEqual({ portal: "https://crm.minhaempresa.com", userId: "27", secret: "k3y_value" });
    expect(parseWebhookUrl("https://empresa.bitrix24.com:443/rest/1/abc123/").portal).toBe("https://empresa.bitrix24.com");
  });

  it.each([
    ["http://empresa.bitrix24.com.br/rest/1/abc123/", /https/],
    ["https://user:pass@empresa.bitrix24.com.br/rest/1/abc123/", /usuário ou senha/],
    ["https://empresa.bitrix24.com.br/rest/1/abc123/?x=1", /\?/],
    ["https://empresa.bitrix24.com.br/rest/1/abc123/#frag", /\?/],
    ["https://empresa.bitrix24.com.br:8443/rest/1/abc123/", /porta/],
    ["https://10.0.0.5/rest/1/abc123/", /IP/],
    ["https://[::1]/rest/1/abc123/", /IP/],
    ["https://localhost/rest/1/abc123/", /público/],
    ["https://bitrix.local/rest/1/abc123/", /público/],
    ["https://bitrix.internal/rest/1/abc123/", /público/],
    ["https://empresa.bitrix24.com.br/rest/abc/abc123/", /caminho/],
    ["https://empresa.bitrix24.com.br/rest/1/abc-123/", /caminho/],
    ["https://empresa.bitrix24.com.br/rest/1/abc123/user.get", /caminho/],
    ["não é url", /endereço completo/],
  ])("recusa %s", (url, message) => {
    expect(() => parseWebhookUrl(url)).toThrow(message);
  });

  it("mascara e normaliza sem expor o segredo", () => {
    expect(maskWebhookUrl("https://empresa.bitrix24.com.br/rest/1/abc123def456/")).toBe("https://empresa.bitrix24.com.br/rest/1/••••••/");
    expect(maskWebhookUrl("lixo")).toBe("••••••");
    expect(normalizeWebhookUrl({ portal: "https://a.bitrix24.com", userId: "3", secret: "xyz9" })).toBe("https://a.bitrix24.com/rest/3/xyz9/");
    expect(redactWebhookSecrets("falhou em https://a.bitrix24.com/rest/3/xyz9/user.get.json")).toBe("falhou em https://a.bitrix24.com/rest/3/••••••/user.get.json");
  });
});
