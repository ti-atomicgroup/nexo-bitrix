import "server-only";
import type { PersonDTO } from "@/shared/contracts";
import { getDb } from "..";
import { newId, normalizeSearch, nowIso, toBool, toStringOrNull } from "./util";

export interface PersonRow {
  id: string;
  bitrixUserId: string | null;
  name: string;
  email: string | null;
  position: string | null;
  department: string | null;
  active: boolean;
  source: "bitrix" | "manual" | "crm";
  updatedAt: string;
}

export interface BitrixPersonInput {
  bitrixUserId: string;
  name: string;
  email?: string | null;
  position?: string | null;
  department?: string | null;
  active: boolean;
}

function map(row: Record<string, unknown>): PersonRow {
  return {
    id: String(row.id),
    bitrixUserId: toStringOrNull(row.bitrix_user_id),
    name: String(row.name),
    email: toStringOrNull(row.email),
    position: toStringOrNull(row.position),
    department: toStringOrNull(row.department),
    active: toBool(row.active),
    source: row.source as PersonRow["source"],
    updatedAt: String(row.updated_at),
  };
}

/** Atualiza o cache local de usuários do Bitrix (cria ou atualiza pelo ID do Bitrix). Devolve quantos foram gravados. */
export function upsertBitrixPeople(people: BitrixPersonInput[]): number {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO people (id, bitrix_user_id, name, email, position, department, active, source, updated_at)
    VALUES (@id, @bitrixUserId, @name, @email, @position, @department, @active, 'bitrix', @updatedAt)
    ON CONFLICT(bitrix_user_id) DO UPDATE SET
      name = excluded.name, email = excluded.email, position = excluded.position,
      department = excluded.department, active = excluded.active, source = 'bitrix', updated_at = excluded.updated_at`);
  const updatedAt = nowIso();
  db.tx(() => {
    for (const person of people) {
      statement.run({
        id: newId(),
        bitrixUserId: person.bitrixUserId,
        name: person.name,
        email: person.email ?? null,
        position: person.position ?? null,
        department: person.department ?? null,
        active: person.active,
        updatedAt,
      });
    }
  });
  return people.length;
}

export function createPerson(input: { name: string; email?: string | null; source: "manual" | "crm"; bitrixUserId?: string | null }): PersonRow {
  const id = newId();
  getDb()
    .prepare("INSERT INTO people (id, bitrix_user_id, name, email, active, source, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
    .run(id, input.bitrixUserId ?? null, input.name.trim(), input.email?.trim() || null, input.source, nowIso());
  return findPerson(id)!;
}

export function findPerson(id: string): PersonRow | null {
  const row = getDb().prepare("SELECT * FROM people WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function findPersonByBitrixId(bitrixUserId: string): PersonRow | null {
  const row = getDb().prepare("SELECT * FROM people WHERE bitrix_user_id = ?").get(bitrixUserId);
  return row ? map(row) : null;
}

/** Busca por nome ou e-mail, sem acento e sem caixa. Pessoas ativas do Bitrix primeiro. */
export function searchPeople(query: string, limit = 20, options: { onlyBitrix?: boolean } = {}): PersonRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM people ${options.onlyBitrix ? "WHERE bitrix_user_id IS NOT NULL" : ""} ORDER BY active DESC, name COLLATE NOCASE`)
    .all()
    .map(map);
  const needle = normalizeSearch(query);
  const matched = needle ? rows.filter((person) => normalizeSearch(`${person.name} ${person.email ?? ""} ${person.position ?? ""}`).includes(needle)) : rows;
  return matched.filter((person) => person.active).slice(0, limit);
}

export function countPeople(): number {
  return Number(getDb().prepare("SELECT COUNT(*) AS total FROM people WHERE bitrix_user_id IS NOT NULL").get<{ total: number }>()?.total ?? 0);
}

/**
 * Liga uma pessoa sem conta (ex.: candidato) ao usuário do Bitrix criado depois.
 * Se o usuário já estiver no cache como outra pessoa, as jornadas e o inventário passam para ela.
 */
export function linkPersonToBitrix(personId: string, bitrixUserId: string): PersonRow {
  const db = getDb();
  return db.tx(() => {
    const existing = findPersonByBitrixId(bitrixUserId);
    if (existing && existing.id !== personId) {
      db.prepare("UPDATE journeys SET person_id = ? WHERE person_id = ?").run(existing.id, personId);
      db.prepare("UPDATE ledger_items SET person_id = ? WHERE person_id = ?").run(existing.id, personId);
      db.prepare("DELETE FROM people WHERE id = ? AND bitrix_user_id IS NULL").run(personId);
      return existing;
    }
    db.prepare("UPDATE people SET bitrix_user_id = ?, updated_at = ? WHERE id = ?").run(bitrixUserId, nowIso(), personId);
    return findPerson(personId)!;
  });
}

export function toPersonDTO(row: PersonRow): PersonDTO {
  return {
    id: row.id,
    bitrixUserId: row.bitrixUserId,
    name: row.name,
    email: row.email,
    position: row.position,
    department: row.department,
    active: row.active,
    source: row.source,
  };
}
