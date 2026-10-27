import { issueSession } from "@/server/auth/sessions";
import { insertActivities, type ActivityRow } from "@/server/db/repos/activities";
import { insertJourney, type JourneyRow, type NewJourney } from "@/server/db/repos/journeys";
import { createPerson, findPersonByBitrixId, upsertBitrixPeople, type PersonRow } from "@/server/db/repos/people";
import { createTemplate } from "@/server/db/repos/templates";
import { createUser, updateUser, type AppUserRow } from "@/server/db/repos/users";
import type { RouteHandler } from "@/server/http/handler";
import { hashPassword } from "@/server/security/passwords";
import type { TemplateDTO } from "@/shared/contracts";
import type { AppRole, JourneyKind } from "@/shared/enums";
import { templateInput } from "@/shared/schemas";

/** Dados e chamadas de apoio para os testes da plataforma (sempre sobre `useTestDb()`). */

export const PASSWORD = "senha-forte-123";
let cachedHash: Promise<string> | null = null;

/** O scrypt custa ~16 MB e dezenas de ms: um hash só para todos os usuários de teste. */
export function passwordHash(): Promise<string> {
  cachedHash ??= hashPassword(PASSWORD);
  return cachedHash;
}

let sequence = 0;

export async function seedUser(options: { role?: AppRole; email?: string; name?: string; active?: boolean } = {}): Promise<{ user: AppUserRow; token: string }> {
  sequence += 1;
  let user = createUser({
    name: options.name ?? `Pessoa ${sequence}`,
    email: options.email ?? `pessoa${sequence}@empresa.com.br`,
    passwordHash: await passwordHash(),
    role: options.role ?? "rh",
  });
  if (options.active === false) user = updateUser(user.id, { active: false }) ?? user;
  return { user, token: issueSession(user).token };
}

export function seedBitrixPerson(bitrixUserId: string, name: string, position: string | null = null): PersonRow {
  upsertBitrixPeople([{ bitrixUserId, name, position, active: true }]);
  return findPersonByBitrixId(bitrixUserId)!;
}

export function seedManualPerson(name: string): PersonRow {
  return createPerson({ name, source: "manual" });
}

export function seedTemplate(kind: JourneyKind = "onboarding"): TemplateDTO {
  return createTemplate(
    templateInput.parse({
      kind,
      name: kind === "onboarding" ? "Onboarding Geral" : "Desligamento",
      profile: "Geral",
      stages: [
        { name: "Antes do 1º dia", releaseMode: "start", activities: [{ title: "Criar acessos", role: "ti", dueOffsetDays: -2 }] },
        { name: "Primeira semana", releaseMode: "offset", activities: [{ title: "Conhecer o time", role: "colaborador", dueOffsetDays: 2, visibility: "employee" }] },
        { name: "Primeiro mês", releaseMode: "after_previous", activities: [{ title: "Conversa de 30 dias", role: "gestor", dueOffsetDays: 30 }] },
      ],
    }),
  );
}

let journeySequence = 0;

export function seedJourney(input: { person: PersonRow; template: TemplateDTO } & Partial<NewJourney>): JourneyRow {
  journeySequence += 1;
  const { person, template, ...overrides } = input;
  return insertJourney({
    id: `j${journeySequence}`,
    kind: template.kind,
    personId: person.id,
    templateId: template.id,
    templateVersion: template.version,
    snapshot: template,
    anchorDate: "2026-11-03",
    status: "active",
    offboardingReason: null,
    participants: {},
    sourceType: "manual",
    sourceKey: null,
    sourceLabel: null,
    crmBinding: null,
    crmUrl: null,
    createdBy: null,
    ...overrides,
  });
}

let activitySequence = 0;

export function activityRow(overrides: Partial<ActivityRow> & { journeyId: string }): ActivityRow {
  activitySequence += 1;
  return {
    id: `a${activitySequence}`,
    stagePosition: 0,
    position: activitySequence,
    templateActivityId: null,
    title: `Atividade ${activitySequence}`,
    instructions: "",
    kind: "task",
    role: "ti",
    assigneeBitrixId: null,
    assigneeName: null,
    dueAt: "2026-11-01T18:00:00-03:00",
    required: true,
    visibility: "team",
    requiresApproval: false,
    ledgerRole: null,
    status: "open",
    checklist: [],
    links: [],
    documents: [],
    bitrixTaskId: null,
    bitrixStatus: null,
    bitrixMissing: false,
    checklistSyncedAt: null,
    syncState: "local",
    syncError: null,
    releasedAt: "2026-10-20T12:00:00.000Z",
    doneAt: null,
    doneSource: null,
    calendarEventId: null,
    lastNudgedAt: null,
    ...overrides,
  };
}

export function seedActivities(rows: ActivityRow[]): ActivityRow[] {
  insertActivities(rows);
  return rows;
}

/* Chamadas às rotas */

export interface CallOptions<K extends string> {
  method?: string;
  path?: string;
  token?: string;
  body?: unknown;
  rawBody?: string;
  params?: Record<K, string>;
  headers?: Record<string, string>;
}

export interface CallResult<T> {
  status: number;
  headers: Headers;
  text: string;
  body: T;
}

export async function call<T = unknown, K extends string = never>(handler: RouteHandler<K>, options: CallOptions<K> = {}): Promise<CallResult<T>> {
  const method = options.method ?? (options.body === undefined && options.rawBody === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const payload = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  if (payload !== undefined) headers["content-type"] ??= "application/json";
  const request = new Request(`http://localhost${options.path ?? "/api/teste"}`, { method, headers, body: payload });
  const response = await handler(request, { params: Promise.resolve((options.params ?? {}) as Record<K, string>) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, headers: response.headers, text, body: body as T };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown>; requestId?: string };
}
