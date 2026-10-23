import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DiscoveryOption, ProcessMapping, SessionInfo, Settings } from "../shared/contracts";
import { templateSchema as savedTemplateSchema } from "../shared/validation";
import { Auth } from "./auth";
import { BitrixClient } from "./bitrix";
import { AppError } from "./errors";
import { integer, record, text } from "./models";
import { Store } from "./store";
import { Journeys } from "./journeys";
import { rulesSchema, settingsSchema, userId } from "./validation";
import { outgoingWebhookSchema, webhookConfigurationSchema } from "./models";
export class Setup {
  constructor(readonly store: Store, readonly auth: Auth, readonly bitrix: BitrixClient, readonly journeys: Journeys) {}
  async triggerSources(session: SessionInfo) {
    this.auth.requireManage(session);
    return this.bitrix.discoverTriggerSources(session.user.id);
  }
  async discover(session: SessionInfo) {
    this.auth.requireManage(session);
    const scopes = z.array(z.string()).parse(await this.bitrix.call(session.user.id, "scope", {}));
    const methods = z.array(z.string()).parse(await this.bitrix.call(session.user.id, "methods", {}));
    const requiredScopes = ["task", "user_brief", "crm", "sonet"];
    const missingScopes = requiredScopes.filter(scope => !scopes.includes(scope) && !(scope === "user_brief" && scopes.includes("user")));
    const webhook = this.store.get("webhook", "incoming", webhookConfigurationSchema);
    return { scopes, missingScopes, canProvision: Boolean(webhook) && scopes.includes("userfieldconfig") && scopes.includes("crm") && scopes.includes("sonet") && session.canConfigure, methods: methods.filter(method => ["crm.type.add", "crm.item.add", "tasks.task.add", "task.checklistitem.add", "userfieldconfig.add", "sonet_group.create", "sonet_group.get"].includes(method)) };
  }
  async discovery(session: SessionInfo, kind: string, entityTypeId?: number, categoryId?: number): Promise<DiscoveryOption[]> {
    this.auth.requireManage(session);
    if (kind === "processes") {
      const types = await this.bitrix.list(session.user.id, "crm.type.list", {}, "types");
      return types.map(record).map(type => ({ id: text(type.entityTypeId), name: text(type.title), type: "process" }));
    }
    if (!entityTypeId || !Number.isSafeInteger(entityTypeId)) throw new AppError("ENTITY_REQUIRED", "Informe o tipo do processo.");
    if (kind === "categories") {
      const categories = await this.bitrix.list(session.user.id, "crm.category.list", { entityTypeId }, "categories");
      return categories.map(record).map(category => ({ id: text(category.id), name: text(category.name), type: "category" }));
    }
    if (kind === "fields") {
      const result = record(await this.bitrix.call(session.user.id, "crm.item.fields", { entityTypeId, useOriginalUfNames: "N" }));
      return Object.entries(record(result.fields)).map(([id, value]) => { const field = record(value); return { id, name: typeof field.title === "string" ? field.title : id, type: typeof field.type === "string" ? field.type : "unknown" }; });
    }
    if (kind === "stages") {
      if (categoryId === undefined || !Number.isSafeInteger(categoryId) || categoryId < 0) throw new AppError("CATEGORY_REQUIRED", "Informe a categoria do processo (zero é válido).");
      const stages = await this.bitrix.list(session.user.id, "crm.status.list", { filter: { ENTITY_ID: `DYNAMIC_${entityTypeId}_STAGE_${categoryId}` } });
      return stages.map(record).map(stage => ({ id: text(stage.STATUS_ID), name: text(stage.NAME), type: "stage" }));
    }
    throw new AppError("DISCOVERY_KIND", "Escolha processes, categories, fields ou stages.");
  }
  async configure(session: SessionInfo, input: unknown, inputRules: unknown): Promise<Settings> {
    await this.auth.requireAdmin(session);
    const next = settingsSchema.parse(input), rules = rulesSchema.parse(inputRules), current = this.auth.settings();
    if (JSON.stringify(next.rhProject) !== JSON.stringify(current.rhProject)) throw new AppError("RH_PROJECT_MANAGED", "O vínculo do projeto RH é gerenciado pelo assistente de instalação.", 403);
    const serviceUserId = this.store.get("webhook", "incoming", webhookConfigurationSchema)?.serviceUserId;
    if (next.automationUserId !== serviceUserId) throw new AppError("AUTOMATION_IDENTITY", "A automação executa sempre como a conta que criou o webhook de entrada.", 403);
    if (!next.roleAssignments.admin.includes(session.user.id)) throw new AppError("ADMIN_RETENTION", "Mantenha o administrador atual na configuração.", 409);
    const references = new Set([...Object.values(next.defaultAssignees), ...Object.values(next.roleAssignments).flat()]);
    for (const target of references) { if (target) { const user = await this.bitrix.user(session.user.id, userId.parse(target)); if (!user.active) throw new AppError("USER_INACTIVE", "A configuração contém usuário inativo."); } }
    const templates = this.store.list("template", savedTemplateSchema);
    for (const rule of rules) {
      if (!templates.some(template => template.id === rule.templateId && template.type === rule.type)) throw new AppError("RULE_TEMPLATE", `Selecione um modelo válido para a regra ${rule.name}.`);
    }
    if (next.process) {
      const fields = await this.discovery(session, "fields", next.process.entityTypeId);
      const stages = await this.discovery(session, "stages", next.process.entityTypeId, next.process.categoryId);
      if (!fields.some(field => field.id === next.process?.employeeField && ["employee", "user"].includes(field.type ?? "")) || !fields.some(field => field.id === next.process?.dateField && ["date", "datetime"].includes(field.type ?? ""))) throw new AppError("FIELD_MAPPING", "Selecione um campo de usuário e um campo de data existentes no processo.");
      for (const id of [next.process.onboardingStageId, next.process.offboardingStageId, next.process.inProgressStageId, next.process.completedStageId, next.process.cancelledStageId]) if (!stages.some(stage => stage.id === id)) throw new AppError("STAGE_MAPPING", "Há etapas não encontradas na categoria selecionada.");
      for (const rule of rules.filter(rule => rule.enabled && !rule.source)) if (!stages.some(stage => stage.id === rule.stageId)) throw new AppError("RULE_STAGE", `A etapa da regra ${rule.name} não está na categoria selecionada.`);
    }
    const triggeredRules = rules.filter(rule => rule.enabled && rule.source);
    if (triggeredRules.length) {
      const triggerKeys = triggeredRules.map(rule => `${rule.source!.kind}:${rule.source!.entityTypeId}:${rule.source!.categoryId ?? "default"}:${rule.source!.stageId}`);
      if (new Set(triggerKeys).size !== triggerKeys.length) throw new AppError("RULE_DUPLICATE", "Há mais de um gatilho para a mesma etapa de origem.", 409);
      const sources = await this.bitrix.discoverTriggerSources(session.user.id);
      for (const rule of triggeredRules) {
        const source = rule.source!, definition = sources.find(item => item.kind === source.kind && item.entityTypeId === source.entityTypeId);
        const category = definition?.categories.find(item => item.id === (source.categoryId === null ? null : String(source.categoryId)));
        if (!definition || !category || !category.stages.some(stage => stage.id === source.stageId) || rule.stageId !== source.stageId) throw new AppError("RULE_SOURCE", `Revise o quadro, o funil e a etapa do gatilho ${rule.name}.`);
        const mapping = rule.fieldMapping, nameField = definition.fields.find(field => field.id === mapping?.nameField), dateField = definition.fields.find(field => field.id === mapping?.dateField);
        if (!mapping || !nameField || !dateField || !["date", "datetime"].includes(dateField.type ?? "")) throw new AppError("RULE_FIELDS", `Mapeie o nome e a data principal do gatilho ${rule.name}.`);
        if (mapping.bitrixUserField && !definition.fields.some(field => field.id === mapping.bitrixUserField && ["employee", "user"].includes(field.type ?? ""))) throw new AppError("RULE_USER_FIELD", `O campo de usuário Bitrix do gatilho ${rule.name} não é válido.`);
      }
    }
    const hasAssignees = templates.every(template => template.stages.every(stage => stage.activities.every(activity => activity.assigneeRole === "colaborador" || Boolean(next.defaultAssignees[activity.assigneeRole]))));
    const sameProcess = JSON.stringify(current.process) === JSON.stringify(next.process);
    const operational = Boolean(next.process && next.automationUserId && templates.length && hasAssignees && sameProcess && next.automationUserId === current.automationUserId);
    const settings: Settings = { ...next, portalDomain: current.portalDomain, applicationClientId: "webhook-only", setupComplete: current.setupComplete && operational };
    this.store.transaction(() => {
      this.store.put("settings", "current", settings); this.store.put("rules", "current", rules);
    });
    this.journeys.audit("settings.saved", "Configuração atualizada por administrador autorizado.", session.user.name);
    return settings;
  }
  async provision(session: SessionInfo): Promise<ProcessMapping> {
    await this.auth.requireAdmin(session);
    const owner = randomUUID();
    if (!this.store.lease("provision", owner, 300000)) throw new AppError("PROVISION_BUSY", "Já há uma preparação de processo em andamento.", 409);
    const user = session.user.id;
    try {
      const capabilities = await this.discover(session);
      if (!capabilities.canProvision || capabilities.missingScopes.length) throw new AppError("SCOPES_MISSING", "Habilite task, user_brief, crm, sonet e userfieldconfig no aplicativo Bitrix24.", 422);
      const settingsBeforeProvision = this.auth.settings();
      if (!settingsBeforeProvision.rhProject) {
        const projectName = "Nexo · RH";
        try {
          const project = await this.journeys.creation("provision:rh-project", async () => {
            const matches = (await this.bitrix.list(user, "sonet_group.get", { FILTER: { NAME: projectName } })).map(record).filter(group => group.NAME === projectName && group.PROJECT === "Y" && group.CLOSED !== "Y");
            if (matches.length > 1) throw new AppError("PROJECT_DUPLICATE", "Há mais de um projeto Nexo · RH. Selecione o correto manualmente.", 409);
            return matches[0] ? text(matches[0].ID) : null;
          }, async () => (await this.bitrix.createRhProject(projectName, user)).id);
          const rhProject = { id: project, name: projectName, url: `${this.auth.env.portalUrl}/workgroups/group/${project}/` };
          this.store.put("settings", "current", { ...this.auth.settings(), rhProject });
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError("RH_PROJECT_CREATE", "Não foi possível criar o projeto privado Nexo · RH. Confirme o escopo sonet e a permissão da conta do webhook para criar projetos.", 422);
        }
      }
      const title = "Nexo · Movimentações de Pessoas";
      const types = (await this.bitrix.list(user, "crm.type.list", {}, "types")).map(record);
      const existing = types.filter(type => type.title === title);
      if (existing.length > 1) throw new AppError("PROCESS_DUPLICATE", "Há mais de um processo Nexo. Selecione o correto manualmente.", 409);
      const typeId = existing[0] ? text(existing[0].id) : await this.journeys.creation("provision:type", async () => {
        const found = (await this.bitrix.list(user, "crm.type.list", {}, "types")).map(record).find(type => type.title === title); return found ? text(found.id) : null;
      }, async () => text(record(record(await this.bitrix.call(user, "crm.type.add", { fields: { title, isCategoriesEnabled: "Y", isStagesEnabled: "Y", isAutomationEnabled: "Y", isBizProcEnabled: "Y", isObserversEnabled: "Y", isSetOpenPermissions: "N", isUseInUserfieldEnabled: "Y", linkedUserFields: { "TASKS_TASK|UF_CRM_TASK": "true" } } })).type).id));
      const type = record(record(await this.bitrix.call(user, "crm.type.get", { id: Number(typeId) })).type), entityTypeId = integer(type.entityTypeId);
      const categories = (await this.bitrix.list(user, "crm.category.list", { entityTypeId }, "categories")).map(record);
      const category = categories.find(item => item.isDefault === "Y" || item.isDefault === true) ?? categories[0];
      if (!category) throw new AppError("CATEGORY_MISSING", "O Bitrix24 não retornou uma categoria para o processo criado.", 422);
      const categoryId = integer(category.id), entityId = `CRM_${typeId}`;
      const fieldNames = { employee: `UF_CRM_${typeId}_NEXO_EMPLOYEE`, date: `UF_CRM_${typeId}_NEXO_DATE` };
      const existingFields = (await this.bitrix.list(user, "userfieldconfig.list", { moduleId: "crm", filter: { entityId } }, "fields")).map(record);
      for (const definition of [{ fieldName: fieldNames.employee, userTypeId: "employee", title: "Colaborador" }, { fieldName: fieldNames.date, userTypeId: "date", title: "Data de referência" }]) {
        if (existingFields.some(field => field.fieldName === definition.fieldName)) continue;
        await this.journeys.creation(`provision:field:${definition.fieldName}`, async () => {
          const fields = (await this.bitrix.list(user, "userfieldconfig.list", { moduleId: "crm", filter: { entityId } }, "fields")).map(record); const found = fields.find(field => field.fieldName === definition.fieldName); return found ? text(found.id) : null;
        }, async () => text(record(record(await this.bitrix.call(user, "userfieldconfig.add", { moduleId: "crm", field: { entityId, fieldName: definition.fieldName, userTypeId: definition.userTypeId, mandatory: definition.userTypeId === "date" ? "Y" : "N", multiple: "N", editFormLabel: { br: definition.title, en: definition.title } } })).field).id));
      }
      const fields = record(record(await this.bitrix.call(user, "crm.item.fields", { entityTypeId, useOriginalUfNames: "N" })).fields);
      const employeeField = Object.keys(fields).find(key => record(fields[key]).upperName === fieldNames.employee);
      const dateField = Object.keys(fields).find(key => record(fields[key]).upperName === fieldNames.date);
      if (!employeeField || !dateField) throw new AppError("FIELDS_NOT_DISCOVERED", "O Bitrix24 não retornou os campos criados em crm.item.fields. Atualize a descoberta.", 422);
      const stageEntity = `DYNAMIC_${entityTypeId}_STAGE_${categoryId}`, prefix = `DT${entityTypeId}_${categoryId}:`;
      const stageDefinitions = [{ key: "NEXO_ONBOARD", name: "Onboarding aprovado", color: "#10b981" }, { key: "NEXO_OFFBOARD", name: "Offboarding aprovado", color: "#f59e0b" }, { key: "NEXO_PROGRESS", name: "Em andamento", color: "#3b82f6" }, { key: "NEXO_DONE", name: "Concluído", color: "#059669" }, { key: "NEXO_CANCEL", name: "Cancelado", color: "#64748b" }];
      const stages = (await this.bitrix.list(user, "crm.status.list", { filter: { ENTITY_ID: stageEntity } })).map(record);
      for (let index = 0; index < stageDefinitions.length; index++) {
        const definition = stageDefinitions[index]; if (!definition) continue;
        const statusId = `${prefix}${definition.key}`;
        if (stages.some(stage => stage.STATUS_ID === statusId)) continue;
        await this.journeys.creation(`provision:stage:${statusId}`, async () => { const found = (await this.bitrix.list(user, "crm.status.list", { filter: { ENTITY_ID: stageEntity } })).map(record).find(stage => stage.STATUS_ID === statusId); return found ? text(found.ID) : null; }, async () => text(await this.bitrix.call(user, "crm.status.add", { fields: { ENTITY_ID: stageEntity, STATUS_ID: statusId, NAME: definition.name, SORT: (index + 1) * 10, COLOR: definition.color } })));
      }
      const mapping: ProcessMapping = { entityTypeId, categoryId, employeeField, dateField, onboardingStageId: `${prefix}NEXO_ONBOARD`, offboardingStageId: `${prefix}NEXO_OFFBOARD`, inProgressStageId: `${prefix}NEXO_PROGRESS`, completedStageId: `${prefix}NEXO_DONE`, cancelledStageId: `${prefix}NEXO_CANCEL` };
      this.store.put("settings", "current", { ...this.auth.settings(), process: mapping, setupComplete: false });
      this.journeys.audit("setup.provisioned", "Processo, campos e etapas Nexo preparados no Bitrix24.", session.user.name);
      return mapping;
    } finally { this.store.release("provision", owner); }
  }
  async finish(session: SessionInfo): Promise<Settings> {
    await this.auth.requireAdmin(session);
    const settings = this.auth.settings(), capabilities = await this.discover(session);
    if (capabilities.missingScopes.length) throw new AppError("SCOPES_MISSING", `Habilite os escopos: ${capabilities.missingScopes.join(", ")}.`, 422);
    if (!settings.rhProject) throw new AppError("RH_PROJECT_REQUIRED", "Crie ou conecte o projeto privado Nexo · RH antes de concluir a instalação.", 409);
    if (!settings.process || !settings.automationUserId) throw new AppError("SETUP_INCOMPLETE", "Configure o processo e autorize uma conta de automação.", 409);
    const templates = this.store.list("template", savedTemplateSchema);
    if (!templates.length) throw new AppError("TEMPLATE_REQUIRED", "Crie pelo menos um modelo de jornada.", 409);
    for (const activity of templates.flatMap(template => template.stages.flatMap(stage => stage.activities))) if (activity.assigneeRole !== "colaborador" && !settings.defaultAssignees[activity.assigneeRole]) throw new AppError("ASSIGNEE_REQUIRED", `Defina o responsável padrão de ${activity.assigneeRole}.`, 409);
    const automation = await this.bitrix.user(settings.automationUserId, settings.automationUserId);
    if (!automation.active) throw new AppError("AUTOMATION_INACTIVE", "A conta de automação está inativa.", 409);
    const rules = this.store.get("rules", "current", rulesSchema) ?? [];
    await this.configure(session, settings, rules);
    if (!this.store.get("webhook", "outgoing", outgoingWebhookSchema)) throw new AppError("OUTGOING_WEBHOOK_REQUIRED", "Configure o webhook de saída no Bitrix24 e valide o token no Nexo.", 409);
    const done = { ...this.auth.settings(), setupComplete: true }; this.store.put("settings", "current", done);
    this.journeys.audit("setup.finished", "Instalação validada e eventos registrados.", session.user.name);
    return done;
  }
}
