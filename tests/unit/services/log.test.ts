import { afterEach, describe, expect, it, vi } from "vitest";
import { log, redact, redactText } from "@/server/log";

const WEBHOOK = "https://empresa.bitrix24.com.br/rest/7/s3gr3d0x9k2/";

afterEach(() => vi.restoreAllMocks());

describe("log estruturado", () => {
  it("escreve uma linha JSON no stdout com nível, evento e horário", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log.info("teste", { requestId: "r1", status: 200 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({ level: "info", event: "teste", requestId: "r1", status: 200 });
    expect(typeof line.at).toBe("string");
  });

  it("remove o segredo de qualquer URL de webhook, em texto, objetos e erros", () => {
    expect(redactText(`falhou ${WEBHOOK}tasks.task.add.json`)).toBe("falhou https://empresa.bitrix24.com.br/rest/7/[redacted]/tasks.task.add.json");
    expect(redactText("https://empresa.bitrix24.com.br/rest/7/s3gr3d0x9k2")).not.toContain("s3gr3d0x9k2");

    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    log.error("falha", { error: new Error(`timeout em ${WEBHOOK}`), nested: { list: [WEBHOOK] } });
    const output = String(spy.mock.calls[0]?.[0]);
    expect(output).not.toContain("s3gr3d0x9k2");
    expect(output).toContain("[redacted]");
  });

  it("esconde chaves sensíveis em qualquer nível", () => {
    const safe = redact({
      password: "123",
      newPassword: "abc",
      token: "t",
      tokenHash: "h",
      installToken: "i",
      webhookUrl: WEBHOOK,
      Authorization: "Bearer x",
      deep: { secret: "s", ok: "visível" },
    }) as Record<string, unknown>;
    expect(safe).toEqual({
      password: "[redacted]",
      newPassword: "[redacted]",
      token: "[redacted]",
      tokenHash: "[redacted]",
      installToken: "[redacted]",
      webhookUrl: "[redacted]",
      Authorization: "[redacted]",
      deep: { secret: "[redacted]", ok: "visível" },
    });
  });

  it("não quebra com valores incomuns", () => {
    const circularish = { a: { b: { c: { d: { e: { f: "fundo" } } } } } };
    expect(() => redact({ big: 10n, when: new Date(0), fn: () => 1, circularish })).not.toThrow();
    expect(redact({ big: 10n })).toEqual({ big: "10" });
  });
});
