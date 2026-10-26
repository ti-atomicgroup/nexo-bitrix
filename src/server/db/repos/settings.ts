import "server-only";
import { z } from "zod";
import type { CollaboratorContentDTO, UserRef } from "@/shared/contracts";
import { PARTICIPANT_ROLES, SETUP_STAGES, type ParticipantRole, type SetupStage } from "@/shared/enums";
import { getDb } from "..";
import { nowIso, parseJson } from "./util";

/* Leitura e escrita genéricas (valor JSON validado por esquema; valor inválido volta como null). */

export function getSetting<T>(key: string, schema: z.ZodType<T>): T | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get<{ value: string }>(key);
  if (!row) return null;
  const parsed = schema.safeParse(parseJson<unknown>(row.value, null));
  return parsed.success ? parsed.data : null;
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(key, JSON.stringify(value), nowIso());
}

export function deleteSetting(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/* Esquemas */

const userRefSchema = z.object({ bitrixUserId: z.string(), name: z.string(), position: z.string().nullable() });

export const webhookRecordSchema = z.object({
  /** URL do webhook cifrada (AES-256-GCM). Nunca sai do servidor. */
  encryptedUrl: z.string(),
  portal: z.string(),
  owner: userRefSchema,
  scopes: z.array(z.string()),
  verifiedAt: z.string(),
});
export type WebhookRecord = z.infer<typeof webhookRecordSchema>;

export const installGrantSchema = z.object({
  tokenHash: z.string(),
  expiresAt: z.string(),
  webhook: webhookRecordSchema,
});
export type InstallGrant = z.infer<typeof installGrantSchema>;

const companySchema = z.object({ name: z.string(), timezone: z.string() });
export type CompanySettings = z.infer<typeof companySchema>;

const projectSchema = z.object({ id: z.string(), name: z.string(), url: z.string() });
export type ProjectRecord = z.infer<typeof projectSchema>;

const defaultsSchema = z.object(Object.fromEntries(PARTICIPANT_ROLES.map((role) => [role, userRefSchema.optional()])) as Record<ParticipantRole, z.ZodOptional<typeof userRefSchema>>);

const contentSchema = z.object({
  welcomeMessage: z.string(),
  farewellMessage: z.string(),
  contacts: z.array(z.object({ label: z.string(), value: z.string() })),
  faqOnboarding: z.array(z.object({ question: z.string(), answer: z.string() })),
  faqOffboarding: z.array(z.object({ question: z.string(), answer: z.string() })),
});

const featuresSchema = z.object({ notifications: z.boolean(), calendar: z.boolean(), feed: z.boolean() });
export type FeatureToggles = z.infer<typeof featuresSchema>;

const syncStateSchema = z.object({
  lastCycleAt: z.string().nullable(),
  lastCycleMs: z.number().nullable(),
  lastError: z.string().nullable(),
  nextCycleAt: z.string().nullable(),
  rateLimitedUntil: z.string().nullable(),
  peopleRefreshedAt: z.string().nullable(),
  checklistsPolledAt: z.string().nullable(),
});
export type SyncState = z.infer<typeof syncStateSchema>;

/* Padrões */

export const DEFAULT_COMPANY: CompanySettings = { name: "Minha empresa", timezone: "America/Sao_Paulo" };

export const DEFAULT_CONTENT: CollaboratorContentDTO = {
  welcomeMessage:
    "Que bom ter você com a gente! Aqui está tudo o que vai acontecer até o seu primeiro dia e nas primeiras semanas. Se surgir qualquer dúvida, fale com o RH.",
  farewellMessage:
    "Obrigado por tudo o que você construiu com a gente. Aqui estão os próximos passos para uma saída tranquila. Conte com o RH no que precisar.",
  contacts: [],
  faqOnboarding: [
    { question: "O que levar no primeiro dia?", answer: "Um documento com foto. O restante da documentação é combinado com o RH antes de você começar." },
    { question: "Com quem falo se tiver dúvidas?", answer: "Com o RH ou com o seu buddy, que aparecem nesta página." },
  ],
  faqOffboarding: [
    { question: "Quando recebo o pagamento final?", answer: "O RH informa as datas de pagamento e os documentos durante o seu processo de saída." },
    { question: "Como devolvo os equipamentos?", answer: "A TI combina a devolução com você. Os itens aparecem na sua lista de saída." },
  ],
};

export const DEFAULT_FEATURES: FeatureToggles = { notifications: true, calendar: true, feed: true };

const EMPTY_SYNC: SyncState = {
  lastCycleAt: null,
  lastCycleMs: null,
  lastError: null,
  nextCycleAt: null,
  rateLimitedUntil: null,
  peopleRefreshedAt: null,
  checklistsPolledAt: null,
};

/* Acessores tipados */

export const getSetupStage = (): SetupStage => getSetting("setup.stage", z.enum(SETUP_STAGES)) ?? "connect";
export const setSetupStage = (stage: SetupStage): void => setSetting("setup.stage", stage);

export const getInstallGrant = (): InstallGrant | null => getSetting("setup.grant", installGrantSchema);
export const setInstallGrant = (grant: InstallGrant): void => setSetting("setup.grant", grant);
export const clearInstallGrant = (): void => deleteSetting("setup.grant");

export const getWebhookRecord = (): WebhookRecord | null => getSetting("bitrix.webhook", webhookRecordSchema);
export const setWebhookRecord = (record: WebhookRecord): void => setSetting("bitrix.webhook", record);

export const getCompany = (): CompanySettings => getSetting("company", companySchema) ?? DEFAULT_COMPANY;
export const setCompany = (company: CompanySettings): void => setSetting("company", company);

export const getProject = (): ProjectRecord | null => getSetting("bitrix.project", projectSchema);
export const setProject = (project: ProjectRecord): void => setSetting("bitrix.project", project);

export const getDefaults = (): Partial<Record<ParticipantRole, UserRef>> => getSetting("defaults", defaultsSchema) ?? {};
export const setDefaults = (defaults: Partial<Record<ParticipantRole, UserRef>>): void => setSetting("defaults", defaults);

export const getContent = (): CollaboratorContentDTO => getSetting("content", contentSchema) ?? DEFAULT_CONTENT;
export const setContent = (content: CollaboratorContentDTO): void => setSetting("content", content);

export const getFeatures = (): FeatureToggles => getSetting("features", featuresSchema) ?? DEFAULT_FEATURES;
export const setFeatures = (features: FeatureToggles): void => setSetting("features", features);

export const getSyncState = (): SyncState => ({ ...EMPTY_SYNC, ...(getSetting("sync", syncStateSchema.partial()) ?? {}) });
export function patchSyncState(patch: Partial<SyncState>): SyncState {
  const next = { ...getSyncState(), ...patch };
  setSetting("sync", next);
  return next;
}
