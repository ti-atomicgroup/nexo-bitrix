import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { and, eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { AppError } from "./errors";

const documents = sqliteTable("documents", { kind: text("kind").notNull(), id: text("id").notNull(), body: text("body").notNull() });
const reservation = z.object({ id: z.string(), fingerprint: z.string() });
const jobSchema = z.object({ id: z.string(), kind: z.string(), body: z.string(), attempts: z.number(), available_at: z.number() });
export type Job = z.infer<typeof jobSchema>;
export class Store {
  readonly sqlite: Database.Database;
  private readonly db;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.sqlite = new Database(path);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("busy_timeout = 5000");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS reservations (source TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)), attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', error TEXT);
      CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state,available_at);
      CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,datetime('now'));`);
    this.db = drizzle(this.sqlite);
  }
  close() { this.sqlite.close(); }
  transaction<T>(action: () => T): T { return this.sqlite.transaction(action).immediate(); }
  put(kind: string, id: string, body: unknown): void {
    const json = JSON.stringify(body);
    if (json === undefined) throw new AppError("STORAGE", "Documento vazio não pode ser salvo.", 500);
    this.db.insert(documents).values({ kind, id, body: json }).onConflictDoUpdate({ target: [documents.kind, documents.id], set: { body: json } }).run();
  }
  get<T>(kind: string, id: string, schema: z.ZodType<T>): T | null {
    const row = this.db.select().from(documents).where(and(eq(documents.kind, kind), eq(documents.id, id))).get();
    return row ? schema.parse(JSON.parse(row.body)) : null;
  }
  list<T>(kind: string, schema: z.ZodType<T>): T[] { return this.db.select().from(documents).where(eq(documents.kind, kind)).all().map(row => schema.parse(JSON.parse(row.body))); }
  remove(kind: string, id: string): void { this.db.delete(documents).where(and(eq(documents.kind, kind), eq(documents.id, id))).run(); }
  reservationId(source: string): string | null {
    const row = this.sqlite.prepare("SELECT id,fingerprint FROM reservations WHERE source=?").get(source);
    return row === undefined ? null : reservation.parse(row).id;
  }
  reserve(source: string, fingerprint: string, id: string): { id: string; fresh: boolean } {
    return this.transaction(() => {
      const inserted = this.sqlite.prepare("INSERT OR IGNORE INTO reservations(source,fingerprint,id) VALUES(?,?,?)").run(source, fingerprint, id);
      const row = reservation.parse(this.sqlite.prepare("SELECT id,fingerprint FROM reservations WHERE source=?").get(source));
      if (row.fingerprint !== fingerprint) throw new AppError("IDEMPOTENCY_CONFLICT", "Este identificador já foi usado com outros dados.", 409);
      return { id: row.id, fresh: inserted.changes === 1 };
    });
  }
  enqueue(id: string, kind: string, body: unknown, availableAt = Date.now()): void {
    this.sqlite.prepare("INSERT OR IGNORE INTO jobs(id,kind,body,available_at) VALUES(?,?,?,?)").run(id, kind, JSON.stringify(body), availableAt);
  }
  nextJobs(now = Date.now()): Job[] { return z.array(jobSchema).parse(this.sqlite.prepare("SELECT id,kind,body,attempts,available_at FROM jobs WHERE state='pending' AND available_at<=? ORDER BY available_at LIMIT 20").all(now)); }
  finishJob(id: string): void { this.sqlite.prepare("UPDATE jobs SET state='done',error=NULL WHERE id=?").run(id); }
  failJob(job: Job, code: string, retryable: boolean): void {
    this.sqlite.prepare("UPDATE jobs SET attempts=attempts+1,state=?,error=?,available_at=? WHERE id=?").run(retryable && job.attempts < 8 ? "pending" : "failed", code, Date.now() + Math.min(3600000, 10000 * 2 ** job.attempts), job.id);
  }
  lease(name: string, owner: string, duration: number, now = Date.now()): boolean {
    return this.transaction(() => {
      const result = this.sqlite.prepare("INSERT INTO leases(name,owner,expires_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<=? OR leases.owner=?").run(name, owner, now + duration, now, owner);
      return result.changes === 1;
    });
  }
  release(name: string, owner: string): void { this.sqlite.prepare("DELETE FROM leases WHERE name=? AND owner=?").run(name, owner); }
}
