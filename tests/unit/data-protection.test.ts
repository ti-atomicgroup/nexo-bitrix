import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hardenDataDir, inspectDataProtection } from "@/server/runtime/data-protection";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nexo-protecao-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const posix = process.platform !== "win32";

describe("permissões da pasta de dados", () => {
  it("apaga os bancos de teste que a sonda antiga deixava, e só eles", () => {
    for (const name of ["probe-node-sqlite.sqlite", "probe-node-sqlite.sqlite-wal", "nexo.sqlite", "boots.json"]) writeFileSync(join(dir, name), "x");
    hardenDataDir(dir);
    expect(readdirSync(dir).sort()).toEqual(["boots.json", "nexo.sqlite"]);
  });

  it("diz se a chave está no ambiente, separada do volume", () => {
    expect(inspectDataProtection(dir, {}).keyFromEnv).toBe(false);
    expect(inspectDataProtection(dir, { NEXO_ENCRYPTION_KEY: "a".repeat(64) }).keyFromEnv).toBe(true);
  });

  it.runIf(!posix)("no Windows, informa que as permissões POSIX não se aplicam", () => {
    expect(inspectDataProtection(dir, {})).toMatchObject({ applies: false, ok: true, exposed: [] });
  });

  it.runIf(posix)("fecha pasta e arquivos só para o usuário do processo, inclusive documentos e backups", () => {
    mkdirSync(join(dir, "documents"));
    mkdirSync(join(dir, "backups"));
    for (const name of ["nexo.sqlite", "nexo.sqlite-wal", ".nexo-key", "documents/a.bin", "backups/b.enc"]) {
      writeFileSync(join(dir, name), "x");
      chmodSync(join(dir, name), 0o644);
    }
    chmodSync(dir, 0o755);
    const before = inspectDataProtection(dir, {});
    expect(before.ok).toBe(false);
    expect(before.exposed).toEqual(expect.arrayContaining([".", "nexo.sqlite", ".nexo-key", "documents/a.bin", "backups/b.enc"]));
    hardenDataDir(dir);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    for (const name of ["nexo.sqlite", "nexo.sqlite-wal", ".nexo-key", "documents/a.bin", "backups/b.enc"]) expect(statSync(join(dir, name)).mode & 0o777).toBe(0o600);
    expect(inspectDataProtection(dir, {})).toMatchObject({ applies: true, ok: true, exposed: [] });
  });
});
