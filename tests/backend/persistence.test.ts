import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Store } from "../../src/server/store";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function path() { const dir = mkdtempSync(join(tmpdir(), "nexo-test-")); dirs.push(dir); return join(dir, "nexo.db"); }
describe("persistência transacional", () => {
  it("reserva a mesma origem uma vez entre conexões e reinícios", () => {
    const dbPath = path(), a = new Store(dbPath), b = new Store(dbPath);
    expect(a.reserve("manual:request1", "fingerprint", "journey1")).toEqual({ id: "journey1", fresh: true });
    expect(b.reserve("manual:request1", "fingerprint", "journey2")).toEqual({ id: "journey1", fresh: false });
    expect(() => b.reserve("manual:request1", "different", "journey3")).toThrow();
    a.close(); b.close();
    const reopened = new Store(dbPath);
    expect(reopened.reserve("manual:request1", "fingerprint", "journey4").id).toBe("journey1");
    reopened.close();
  });
  it("um lease impede dois workers e expira sem perder a fila", () => {
    const dbPath = path(), a = new Store(dbPath), b = new Store(dbPath);
    a.enqueue("event1", "sync", { itemId: 5 }, 1000);
    a.enqueue("event1", "sync", { itemId: 5 }, 1000);
    expect(a.lease("worker", "a", 1000, 100)).toBe(true);
    expect(b.lease("worker", "b", 1000, 100)).toBe(false);
    expect(b.lease("worker", "b", 1000, 1101)).toBe(true);
    a.close(); b.close();
    const reopened = new Store(dbPath);
    expect(reopened.nextJobs(2000)).toHaveLength(1);
    reopened.close();
  });
  it("valida o documento ao ler e conserva snapshots independentes", () => {
    const db = new Store(path());
    const schema = z.object({ name: z.string(), version: z.number() });
    db.put("template", "m1", { name: "Antes", version: 1 });
    db.put("snapshot", "j1", db.get("template", "m1", schema));
    db.put("template", "m1", { name: "Depois", version: 2 });
    expect(db.get("snapshot", "j1", schema)).toEqual({ name: "Antes", version: 1 });
    expect(() => db.get("template", "m1", z.object({ wrong: z.number() }))).toThrow();
    db.close();
  });
});
