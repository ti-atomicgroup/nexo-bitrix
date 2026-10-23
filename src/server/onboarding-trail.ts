import { z } from "zod";
import type { SessionInfo, TrailSuggestion } from "../shared/contracts";
import { templateSchema, trailSuggestionSchema } from "../shared/validation";
import { AppError } from "./errors";
import type { Store } from "./store";
import type { AiProvider } from "./ai-provider";
import type { Auth } from "./auth";

const inputSchema = z
  .object({
    templateId: z.string().min(1).max(120),
    description: z.string().trim().min(30).max(12000),
  })
  .strict();
export class OnboardingTrail {
  constructor(
    private readonly store: Store,
    private readonly auth: Auth,
    private readonly provider: AiProvider,
  ) {}
  async suggest(session: SessionInfo, raw: unknown): Promise<TrailSuggestion> {
    this.auth.requireManage(session);
    const input = inputSchema.parse(raw),
      template = this.store.get("template", input.templateId, templateSchema);
    if (!template || template.type !== "onboarding")
      throw new AppError(
        "TEMPLATE_INVALID",
        "Selecione um modelo de onboarding válido.",
      );
    const activities = template.stages.flatMap((stage) =>
      stage.activities.map((activity) => ({
        id: activity.id,
        stageId: stage.id,
        title: activity.title,
        description: activity.description,
        competencies: activity.competencies ?? [],
        documents: activity.documents.map((document) => document.title),
      })),
    );
    const rawSuggestion = await this.provider.suggestTrail({
      description: input.description,
      catalog: {
        templateId: template.id,
        templateVersion: template.version,
        profile: template.profile,
        stages: template.stages.map(({ id, title }) => ({ id, title })),
        activities,
      },
    });
    const parsed = trailSuggestionSchema.parse({
      ...(rawSuggestion as object),
      templateId: template.id,
      templateVersion: template.version,
      profile: template.profile,
    });
    const activityMap = new Map(
      activities.map((activity) => [activity.id, activity]),
    );
    const stageIds = new Set(template.stages.map((stage) => stage.id));
    const seen = new Set<string>();
    for (const activity of parsed.activities) {
      const source = activityMap.get(activity.activityId);
      if (
        !source ||
        !stageIds.has(activity.stageId) ||
        source.stageId !== activity.stageId ||
        seen.has(activity.activityId)
      )
        throw new AppError(
          "AI_RESPONSE_INVALID",
          "A sugestão trouxe uma atividade fora do modelo escolhido. Tente novamente.",
          502,
        );
      seen.add(activity.activityId);
      const definition = template.stages
        .flatMap((stage) => stage.activities)
        .find((item) => item.id === activity.activityId)!;
      if (activity.assigneeRole !== definition.assigneeRole)
        throw new AppError(
          "AI_RESPONSE_INVALID",
          "A sugestão alterou o responsável definido no modelo. Tente novamente.",
          502,
        );
    }
    if (
      template.stages
        .flatMap((stage) => stage.activities)
        .some((activity) => activity.required && !seen.has(activity.id))
    )
      throw new AppError(
        "AI_RESPONSE_INVALID",
        "A sugestão não incluiu todas as atividades obrigatórias do modelo. Tente novamente.",
        502,
      );
    for (const competency of parsed.competencies)
      if (competency.activityIds.some((id) => !seen.has(id)))
        throw new AppError(
          "AI_RESPONSE_INVALID",
          "Uma competência foi relacionada a atividade não recomendada.",
          502,
        );
    return {
      ...parsed,
      activities: parsed.activities.map((item) => ({
        ...item,
        offsetUnit:
          item.offsetUnit ??
          template.stages
            .flatMap((stage) => stage.activities)
            .find((activity) => activity.id === item.activityId)?.offsetUnit ??
          "calendar_days",
      })),
    };
  }
}
