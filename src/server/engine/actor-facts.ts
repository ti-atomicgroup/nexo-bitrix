import "server-only";
import { BitrixError } from "../bitrix/errors";
import { getUserById, listGroupMemberIds } from "../bitrix/methods";
import { findPersonByBitrixId } from "../db/repos/people";
import { getProject } from "../db/repos/settings";
import { requireBitrix } from "./runtime";

/**
 * O que o portal diz, agora, sobre a conta de quem pede uma ação: se está ativa e se participa do projeto das tarefas.
 * Poucos minutos de cache para não gastar o limite do Bitrix24 a cada clique. Com o Bitrix24 fora do ar, vale a última
 * resposta conhecida; sem nenhuma, a participação não é presumida (o chamador recusa).
 */
const TTL_MS = 5 * 60_000;
/** A borda corta requisição longa: passou disso, responde com o que tem. A consulta segue em segundo plano e deixa a resposta pronta. */
export const FACTS_BUDGET_MS = 5_000;
const CACHE_KEY = Symbol.for("nexo.bitrix.actor-facts");

interface Entry {
  at: number;
  value: unknown;
}

interface State {
  entries: Map<string, Entry>;
  /** Consulta em andamento: pedidos simultâneos aguardam a mesma. */
  pending: Map<string, Promise<unknown>>;
}

type CacheGlobal = typeof globalThis & { [CACHE_KEY]?: State };
const state = (): State => ((globalThis as CacheGlobal)[CACHE_KEY] ??= { entries: new Map(), pending: new Map() });

function withinBudget<T>(work: Promise<T>, budgetMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BitrixError("TIMEOUT", { retryable: true })), budgetMs);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function remembered<T>(key: string, load: () => Promise<T>, now: number, budgetMs: number): Promise<T> {
  const { entries, pending } = state();
  const entry = entries.get(key);
  if (entry && now - entry.at < TTL_MS) return entry.value as T;
  let work = pending.get(key) as Promise<T> | undefined;
  if (!work) {
    work = load()
      .then((value) => {
        entries.set(key, { at: now, value });
        return value;
      })
      .finally(() => pending.delete(key));
    // Quem desistiu pelo prazo não fica com rejeição solta: o resultado só interessa ao cache.
    work.catch(() => undefined);
    pending.set(key, work);
  }
  try {
    return await withinBudget(work, budgetMs);
  } catch (error) {
    if (entry) return entry.value as T;
    throw error;
  }
}

export async function projectMemberIds(now = Date.now(), budgetMs = FACTS_BUDGET_MS): Promise<string[]> {
  const project = getProject();
  if (!project) return [];
  return remembered(`members:${project.id}`, () => listGroupMemberIds(requireBitrix(), project.id), now, budgetMs);
}

export async function bitrixActorFacts(bitrixUserId: string, options: { membership: boolean }, now = Date.now(), budgetMs = FACTS_BUDGET_MS): Promise<{ active: boolean; member: boolean }> {
  let active: boolean;
  try {
    const account = await remembered(`user:${bitrixUserId}`, () => getUserById(requireBitrix(), bitrixUserId), now, budgetMs);
    active = Boolean(account?.active);
  } catch (error) {
    // O cache de pessoas é atualizado todo dia: melhor que nada para saber se a conta está ativa, nunca para a participação.
    const person = findPersonByBitrixId(bitrixUserId);
    if (!person) throw error;
    active = person.active;
  }
  const member = options.membership ? (await projectMemberIds(now, budgetMs)).includes(bitrixUserId) : true;
  return { active, member };
}

export function resetActorFactsForTests(): void {
  state().entries.clear();
  state().pending.clear();
}
