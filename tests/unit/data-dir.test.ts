import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataDir } from "@/server/runtime/data-dir";

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveDataDir", () => {
  it("usa NEXO_DATA_DIR e cria a pasta", () => {
    const base = mkdtempSync(join(tmpdir(), "nexo-dir-"));
    created.push(base);
    const target = join(base, "dados");
    const choice = resolveDataDir({ NEXO_DATA_DIR: target }, ["/nao/existe"]);
    expect(choice).toEqual({ path: resolve(target), source: "NEXO_DATA_DIR" });
    expect(existsSync(target)).toBe(true);
  });

  it("usa o volume da Onnira quando existe e é gravável", () => {
    const volume = mkdtempSync(join(tmpdir(), "nexo-volume-"));
    created.push(volume);
    expect(resolveDataDir({}, [volume])).toEqual({ path: volume, source: "onnira-volume" });
  });

  it("usa a pasta oculta .data do projeto quando /app/.data não existe", () => {
    const project = mkdtempSync(join(tmpdir(), "nexo-projeto-"));
    created.push(project);
    const hidden = join(project, ".data");
    mkdirSync(hidden);
    expect(resolveDataDir({}, [join(project, "nao-existe"), hidden])).toEqual({ path: hidden, source: "onnira-volume" });
  });

  it("cai para ./data quando não há configuração nem volume", () => {
    const choice = resolveDataDir({}, [join(tmpdir(), "nexo-sem-volume-inexistente")]);
    expect(choice).toEqual({ path: resolve("./data"), source: "local" });
  });
});
