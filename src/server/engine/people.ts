import "server-only";
import { listActiveUsers } from "../bitrix/methods";
import { upsertBitrixPeople } from "../db/repos/people";
import { getSyncState, patchSyncState } from "../db/repos/settings";
import { requireBitrix } from "./runtime";

/** O cache de pessoas é atualizado sob demanda e, no ciclo, uma vez por dia. */
export const PEOPLE_REFRESH_MS = 24 * 3_600_000;

/**
 * Atualiza o cache local com os colaboradores do portal. Traz também os desligados, para que saiam das listas de escolha
 * (o cache nunca apaga ninguém: jornadas antigas continuam apontando para a pessoa).
 */
export async function refreshPeople(): Promise<number> {
  const users = await listActiveUsers(requireBitrix(), { includeInactive: true });
  const count = upsertBitrixPeople(
    users.map((user) => ({
      bitrixUserId: user.bitrixUserId,
      name: user.name,
      email: user.email,
      position: user.position,
      department: user.department,
      active: user.active,
    })),
  );
  patchSyncState({ peopleRefreshedAt: new Date().toISOString() });
  return count;
}

export async function refreshPeopleIfStale(now: number = Date.now()): Promise<boolean> {
  const last = getSyncState().peopleRefreshedAt;
  if (last && now - Date.parse(last) < PEOPLE_REFRESH_MS) return false;
  await refreshPeople();
  return true;
}
