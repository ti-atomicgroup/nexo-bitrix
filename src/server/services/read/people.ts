import "server-only";
import type { PersonDTO } from "@/shared/contracts";
import { refreshPeople } from "@/server/engine";
import { searchPeople, toPersonDTO } from "../../db/repos/people";

/** Busca no cache local de usuários do Bitrix24 (a tela nunca chama o Bitrix). */
export function searchPeopleDTO(query: string, limit: number): PersonDTO[] {
  return searchPeople(query, limit, { onlyBitrix: true }).map(toPersonDTO);
}

/** Atualiza o cache a pedido do RH (ex.: pessoa recém-criada no Bitrix24). */
export async function refreshPeopleCache(): Promise<{ count: number }> {
  return { count: await refreshPeople() };
}
