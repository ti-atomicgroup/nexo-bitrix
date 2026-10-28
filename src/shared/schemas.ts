/**
 * Esquemas zod das entradas da API. A rota valida com estes esquemas; a interface pode reutilizá-los nos formulários.
 * Mensagens em pt-BR, prontas para exibir ao lado do campo.
 */
import { z } from "zod";
import {
  ACTIVITY_KINDS,
  ACTIVITY_ROLES,
  APP_ROLES,
  JOURNEY_KINDS,
  LEDGER_KINDS,
  OFFBOARDING_REASONS,
  OFFSET_UNITS,
  RELEASE_MODES,
  VISIBILITIES,
} from "./enums";

const text = (max: number) => z.string().trim().min(1, "Preencha este campo.").max(max, `Use no máximo ${max} caracteres.`);
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use um horário no formato HH:MM.");
export const bitrixUserIdSchema = z.string().regex(/^\d{1,12}$/, "Escolha um usuário do Bitrix24.");
const emailSchema = z.email("Informe um e-mail válido.").max(200);
const passwordSchema = z.string().min(10, "Use pelo menos 10 caracteres.").max(200);

/* Instalação e sessão */

export const connectWebhookInput = z.object({
  webhookUrl: z.string().trim().min(1, "Cole o endereço do webhook.").max(500),
});

export const createAccountInput = z.object({
  installToken: z.string().min(20).max(200),
  name: text(120),
  email: emailSchema,
  password: passwordSchema,
});

export const prepareInput = z.object({
  companyName: text(80).default("Minha empresa"),
  timezone: z.string().min(3).max(60).default("America/Sao_Paulo"),
  projectName: text(80).default("Nexo · Jornadas"),
  defaults: z
    .object({ rh: bitrixUserIdSchema, ti: bitrixUserIdSchema, gestor: bitrixUserIdSchema, buddy: bitrixUserIdSchema })
    .partial()
    .default({}),
});

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(200),
});

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/* Trilhas */

export const ledgerTagSchema = z.object({ kind: z.enum(LEDGER_KINDS), name: text(80) });

export const checklistItemSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/, "Chave inválida."),
  text: text(200),
  ledger: ledgerTagSchema.nullable().default(null),
});

export const linkSchema = z.object({
  label: text(80),
  url: z.url("Informe um endereço válido.").refine((value) => value.startsWith("https://"), "Use um link https://."),
});

export const documentRequestSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/, "Chave inválida."),
  name: text(80),
  hint: z.string().trim().max(200).default(""),
  required: z.boolean().default(true),
});

export const templateActivityInput = z.object({
  id: z.string().max(64).optional(),
  title: text(120),
  instructions: z.string().max(4000).default(""),
  kind: z.enum(ACTIVITY_KINDS).default("task"),
  role: z.enum(ACTIVITY_ROLES),
  dueOffsetDays: z.number().int().min(-365).max(365),
  dueOffsetUnit: z.enum(OFFSET_UNITS).default("calendar"),
  dueTime: timeSchema.default("18:00"),
  required: z.boolean().default(true),
  visibility: z.enum(VISIBILITIES).default("team"),
  requiresApproval: z.boolean().default(false),
  ledgerRole: z.enum(["revoke_and_collect"]).nullable().default(null),
  checklist: z.array(checklistItemSchema).max(40).default([]),
  links: z.array(linkSchema).max(20).default([]),
  documents: z
    .array(documentRequestSchema)
    .max(15)
    .default([])
    .refine((list) => new Set(list.map((item) => item.key)).size === list.length, "Há documentos repetidos nesta atividade."),
}).refine((activity) => !activity.documents.length || (activity.role === "colaborador" && activity.visibility === "employee"), {
  message: "Só atividades do colaborador, visíveis no link pessoal, podem pedir documentos.",
  path: ["documents"],
});

export const templateStageInput = z.object({
  id: z.string().max(64).optional(),
  name: text(80),
  description: z.string().max(500).default(""),
  releaseMode: z.enum(RELEASE_MODES),
  releaseOffsetDays: z.number().int().min(-365).max(365).default(0),
  releaseOffsetUnit: z.enum(OFFSET_UNITS).default("calendar"),
  /** Data-limite de "quando a etapa anterior terminar" (dias a partir da data-âncora); nulo = sem limite. */
  releaseLatestOffsetDays: z.number().int().min(-365).max(365).nullable().default(null),
  activities: z.array(templateActivityInput).min(1, "Cada etapa precisa de pelo menos uma atividade.").max(40),
});

export const templateInput = z
  .object({
    kind: z.enum(JOURNEY_KINDS),
    name: text(80),
    profile: z.string().trim().max(60).default(""),
    description: z.string().max(500).default(""),
    stages: z.array(templateStageInput).min(1, "A trilha precisa de pelo menos uma etapa.").max(12),
  })
  .superRefine((template, ctx) => {
    if (template.stages[0]?.releaseMode === "after_previous") {
      ctx.addIssue({ code: "custom", path: ["stages", 0, "releaseMode"], message: "A primeira etapa não tem etapa anterior." });
    }
    template.stages.forEach((stage, stageIndex) =>
      stage.activities.forEach((activity, activityIndex) => {
        const keys = activity.checklist.map((item) => item.key);
        if (new Set(keys).size !== keys.length) {
          ctx.addIssue({ code: "custom", path: ["stages", stageIndex, "activities", activityIndex, "checklist"], message: "Itens do checklist repetidos." });
        }
      }),
    );
  });

/* Jornadas */

export const journeyPersonInput = z.union([
  z.object({ bitrixUserId: bitrixUserIdSchema }),
  /** `invite`: o Bitrix24 convida a pessoa pelo e-mail e a conta nova recebe as tarefas dela. */
  z.object({ name: text(120), email: emailSchema.optional(), invite: z.boolean().optional() }),
]);

export const createJourneyInput = z
  .object({
    /** Gerado pela interface; um duplo clique não cria duas jornadas. */
    requestId: z.uuid(),
    kind: z.enum(JOURNEY_KINDS),
    person: journeyPersonInput,
    templateId: z.string().min(1).max(64),
    anchorDate: dateOnlySchema,
    participants: z
      .object({ rh: bitrixUserIdSchema, gestor: bitrixUserIdSchema, ti: bitrixUserIdSchema, buddy: bitrixUserIdSchema })
      .partial()
      .default({}),
    offboardingReason: z.enum(OFFBOARDING_REASONS).optional(),
    detectionId: z.string().max(64).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "offboarding" && !("bitrixUserId" in input.person)) {
      ctx.addIssue({ code: "custom", path: ["person"], message: "No desligamento, escolha a pessoa no Bitrix24." });
    }
    if ("name" in input.person && input.person.invite && !input.person.email) {
      ctx.addIssue({ code: "custom", path: ["person", "email"], message: "Informe o e-mail para enviar o convite do Bitrix24." });
    }
  });

export const journeyPreviewInput = createJourneyInput;

export const journeyActionInput = z.object({
  action: z.enum(["pause", "resume", "cancel", "complete"]),
  reason: z.string().trim().max(500).optional(),
});

/** Vincula uma conta que já existe ou convida a pessoa para o Bitrix24 pelo e-mail. */
export const linkPersonInput = z.union([z.object({ bitrixUserId: bitrixUserIdSchema }), z.object({ inviteEmail: emailSchema })]);

export const collaboratorLinkInput = z.object({ action: z.enum(["create", "revoke"]) });

export const activityActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("nudge"), message: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("toggle_item"), itemKey: z.string().min(1).max(40), done: z.boolean() }),
  z.object({ action: z.literal("resend_documents") }),
  z.object({
    action: z.literal("reject_document"),
    documentId: z.string().min(1).max(64),
    reason: z.string().trim().min(3, "Diga ao colaborador o que corrigir.").max(300),
  }),
  documentRequestSchema.omit({ key: true }).extend({ action: z.literal("request_document") }),
]);

/* Inventário */

export const ledgerItemInput = z.object({
  kind: z.enum(LEDGER_KINDS),
  name: text(80),
  detail: z.string().trim().max(200).default(""),
});

export const ledgerWaiveInput = z.object({
  status: z.literal("waived"),
  reason: text(300),
});

/* Automação */

export const triggerInput = z.object({
  name: text(80),
  journeyKind: z.enum(JOURNEY_KINDS),
  entityTypeId: z.number().int().positive(),
  categoryId: z.number().int().min(0).nullable(),
  stageId: text(80),
  templateId: z.string().min(1).max(64),
  fieldMap: z
    .object({ date: z.string().max(80), name: z.string().max(80), email: z.string().max(80), bitrixUser: z.string().max(80) })
    .partial()
    .default({}),
  enabled: z.boolean().default(true),
});

/* Ajustes */

export const collaboratorContentInput = z.object({
  welcomeMessage: z.string().max(2000),
  farewellMessage: z.string().max(2000),
  contacts: z.array(z.object({ label: text(60), value: text(120) })).max(10),
  faqOnboarding: z.array(z.object({ question: text(200), answer: text(2000) })).max(20),
  faqOffboarding: z.array(z.object({ question: text(200), answer: text(2000) })).max(20),
});

export const settingsInput = z
  .object({
    company: z.object({ name: text(80), timezone: z.string().min(3).max(60) }),
    defaults: z
      .object({ rh: bitrixUserIdSchema.nullable(), ti: bitrixUserIdSchema.nullable(), gestor: bitrixUserIdSchema.nullable(), buddy: bitrixUserIdSchema.nullable() })
      .partial(),
    content: collaboratorContentInput,
    features: z.object({ notifications: z.boolean(), calendar: z.boolean(), feed: z.boolean() }).partial(),
  })
  .partial();

export const replaceWebhookInput = connectWebhookInput;

export const createUserInput = z.object({
  name: text(120),
  email: emailSchema,
  role: z.enum(APP_ROLES),
  temporaryPassword: passwordSchema,
});

export const updateUserInput = z.object({
  active: z.boolean().optional(),
  role: z.enum(APP_ROLES).optional(),
  resetPassword: passwordSchema.optional(),
});

export const peopleQueryInput = z.object({
  query: z.string().trim().max(80).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Formulário da página do colaborador (POST sem JavaScript). */
export const collaboratorDoneInput = z.object({ activityId: z.string().min(1).max(64) });
export const collaboratorDocumentInput = z.object({ activityId: z.string().min(1).max(64), key: z.string().regex(/^[a-z0-9-]{1,40}$/) });

export type ConnectWebhookInput = z.infer<typeof connectWebhookInput>;
export type CreateAccountInput = z.infer<typeof createAccountInput>;
export type PrepareInput = z.infer<typeof prepareInput>;
export type LoginInput = z.infer<typeof loginInput>;
export type TemplateInput = z.infer<typeof templateInput>;
export type TemplateActivityInput = z.infer<typeof templateActivityInput>;
export type CreateJourneyInput = z.infer<typeof createJourneyInput>;
export type JourneyActionInput = z.infer<typeof journeyActionInput>;
export type LinkPersonInput = z.infer<typeof linkPersonInput>;
export type ActivityActionInput = z.infer<typeof activityActionInput>;
export type LedgerItemInput = z.infer<typeof ledgerItemInput>;
export type TriggerInput = z.infer<typeof triggerInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type CreateUserInput = z.infer<typeof createUserInput>;
export type UpdateUserInput = z.infer<typeof updateUserInput>;
