import { describe, expect, it } from "vitest";
import { explainCookieTrace } from "@/features/diagnostics/cookie-trace";

const seen = { cookieHeader: false, cookieCount: 0, probeReturned: false, clientHeader: true, fetchSite: "same-origin" };

describe("onde o cookie protegido se perde", () => {
  it("cookie de ida e volta: funciona", () => {
    expect(explainCookieTrace({ cookie: true, hintVisible: true, pageWriteWorks: true, seen: { ...seen, probeReturned: true } }).where).toBe("funciona");
  });

  it("a página grava cookie, mas o do servidor não aparece: a borda mexe no Set-Cookie", () => {
    expect(explainCookieTrace({ cookie: false, hintVisible: false, pageWriteWorks: true, seen }).where).toBe("set-cookie");
  });

  it("nem a página consegue gravar: é o navegador", () => {
    expect(explainCookieTrace({ cookie: false, hintVisible: false, pageWriteWorks: false, seen }).where).toBe("navegador");
  });

  it("o navegador guardou, mas não chega ao servidor: a borda mexe no Cookie", () => {
    expect(explainCookieTrace({ cookie: false, hintVisible: true, pageWriteWorks: true, seen }).where).toBe("cookie");
  });

  it("o cookie chega, mas falta o cabeçalho da interface", () => {
    expect(explainCookieTrace({ cookie: false, hintVisible: true, pageWriteWorks: true, seen: { ...seen, probeReturned: true, clientHeader: false } }).where).toBe("cabecalho");
  });

  it("o cookie chega com o cabeçalho, mas a origem não é a própria página: a regra do Nexo recusa", () => {
    expect(explainCookieTrace({ cookie: false, hintVisible: true, pageWriteWorks: true, seen: { ...seen, probeReturned: true, fetchSite: "cross-site" } }).where).toBe("origem");
  });
});
