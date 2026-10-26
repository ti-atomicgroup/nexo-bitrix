import "server-only";
import { getDb } from "..";

/** Garante um único executor (ex.: o ciclo de sincronização) mesmo se dois processos coexistirem durante um deploy. */
export function acquireLease(name: string, holder: string, ttlMs: number, now = Date.now()): boolean {
  const db = getDb();
  return db.tx(() => {
    const current = db.prepare("SELECT holder, expires_at FROM leases WHERE name = ?").get<{ holder: string; expires_at: string }>(name);
    const expiresAt = new Date(now + ttlMs).toISOString();
    if (!current) {
      db.prepare("INSERT INTO leases (name, holder, expires_at) VALUES (?, ?, ?)").run(name, holder, expiresAt);
      return true;
    }
    if (current.holder === holder || Date.parse(current.expires_at) <= now) {
      db.prepare("UPDATE leases SET holder = ?, expires_at = ? WHERE name = ?").run(holder, expiresAt, name);
      return true;
    }
    return false;
  });
}

export function releaseLease(name: string, holder: string): void {
  getDb().prepare("DELETE FROM leases WHERE name = ? AND holder = ?").run(name, holder);
}
