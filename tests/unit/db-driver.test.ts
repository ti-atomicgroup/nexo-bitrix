import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeSqliteAvailable, openDb, type Db, type DriverName } from "@/server/db/driver";

const drivers: DriverName[] = [];
if (nodeSqliteAvailable()) drivers.push("node:sqlite");
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("better-sqlite3");
  drivers.push("better-sqlite3");
} catch {
  // driver opcional ausente nesta máquina
}

describe.each(drivers)("driver %s", (driver) => {
  let dir: string;
  let db: Db;

  afterEach(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function open(): Db {
    dir = mkdtempSync(join(tmpdir(), "nexo-db-"));
    db = openDb(join(dir, "test.sqlite"), { driver });
    db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, flag INTEGER)");
    return db;
  }

  it("usa o driver pedido e um modo de diário válido", () => {
    open();
    expect(db.driver).toBe(driver);
    expect(["wal", "delete"]).toContain(db.journalMode);
  });

  it("grava e lê linhas como objetos comuns, convertendo booleanos", () => {
    open();
    db.prepare("INSERT INTO items (name, flag) VALUES (?, ?)").run("Ana", true);
    const row = db.prepare("SELECT name, flag FROM items WHERE name = ?").get<{ name: string; flag: number }>("Ana");
    expect(row).toEqual({ name: "Ana", flag: 1 });
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
  });

  it("aceita parâmetros nomeados", () => {
    open();
    db.prepare("INSERT INTO items (name, flag) VALUES (@name, @flag)").run({ name: "Bruno", flag: false });
    expect(db.prepare("SELECT flag FROM items WHERE name = @name").get({ name: "Bruno" })).toEqual({ flag: 0 });
  });

  it("confirma a transação e desfaz quando a função falha", () => {
    open();
    db.tx(() => db.prepare("INSERT INTO items (name) VALUES (?)").run("ok"));
    expect(() =>
      db.tx(() => {
        db.prepare("INSERT INTO items (name) VALUES (?)").run("desfeito");
        throw new Error("falhou");
      }),
    ).toThrow("falhou");
    expect(db.prepare("SELECT name FROM items ORDER BY id").all()).toEqual([{ name: "ok" }]);
  });

  it("reaproveita a transação externa em chamadas aninhadas", () => {
    open();
    db.tx(() => {
      db.prepare("INSERT INTO items (name) VALUES (?)").run("externa");
      db.tx(() => db.prepare("INSERT INTO items (name) VALUES (?)").run("interna"));
    });
    expect(db.prepare("SELECT COUNT(*) AS total FROM items").get()).toEqual({ total: 2 });
  });

  it("rejeita funções assíncronas sem deixar a transação aberta", () => {
    open();
    expect(() => db.tx(() => Promise.resolve(1))).toThrow("síncronas");
    db.tx(() => db.prepare("INSERT INTO items (name) VALUES (?)").run("depois"));
    expect(db.prepare("SELECT COUNT(*) AS total FROM items").get()).toEqual({ total: 1 });
  });
});

describe("drivers disponíveis", () => {
  it("encontra pelo menos um driver nesta máquina", () => {
    expect(drivers.length).toBeGreaterThan(0);
  });
});
