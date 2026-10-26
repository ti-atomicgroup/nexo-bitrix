import { daysBetween, firstName } from "@/lib/format";
import type { CollaboratorActivityDTO, CollaboratorViewDTO, JourneyDTO, SettingsDTO } from "@/shared/contracts";
import type { ActivityRole } from "@/shared/enums";

/** Como o papel aparece para o colaborador ("TI está cuidando disso"). Nunca o nome de quem executa. */
const OWNER_LABEL: Record<ActivityRole, string> = {
  rh: "RH",
  gestor: "Sua liderança",
  ti: "TI",
  colaborador: "Você",
  buddy: "Seu buddy",
  outro: "A equipe",
};

/**
 * Prévia da página do colaborador montada no console a partir da jornada e dos ajustes. É uma aproximação
 * do que o servidor monta em `/j/<token>`: só atividades visíveis ao colaborador, sem o motivo da saída.
 */
export function toCollaboratorPreview(journey: JourneyDTO, settings: SettingsDTO | null, today: string): CollaboratorViewDTO {
  const { summary } = journey;
  const kind = summary.kind;
  const stages = journey.stages
    .map((stage) => ({
      position: stage.position,
      name: stage.name,
      state: stage.state,
      activities: stage.activities
        .filter((activity) => activity.visibility === "employee" && activity.status !== "cancelled")
        .map(
          (activity): CollaboratorActivityDTO => ({
            id: activity.id,
            title: activity.title,
            instructions: activity.instructions,
            kind: activity.kind,
            dueAt: activity.dueAt,
            status: activity.status === "done" ? "done" : activity.status === "locked" ? "waiting" : "todo",
            mine: activity.role === "colaborador",
            ownerLabel: OWNER_LABEL[activity.role],
            links: activity.links,
          }),
        ),
    }))
    .filter((stage) => stage.activities.length > 0);
  const all = stages.flatMap((stage) => stage.activities);
  const done = all.filter((activity) => activity.status === "done").length;
  const roles = kind === "onboarding" ? (["gestor", "buddy", "rh"] as const) : (["gestor", "rh"] as const);
  const people = roles.flatMap((role) => {
    const ref = journey.participants[role];
    return ref ? [{ role, name: ref.name, position: ref.position }] : [];
  });
  const content = settings?.content;
  return {
    kind,
    company: settings?.company.name || "Sua empresa",
    person: { firstName: firstName(summary.person.name), name: summary.person.name },
    anchorDate: summary.anchorDate,
    daysUntilAnchor: daysBetween(today, summary.anchorDate),
    message: (kind === "onboarding" ? content?.welcomeMessage : content?.farewellMessage) ?? "",
    progress: { done, total: all.length, percent: all.length ? Math.round((done / all.length) * 100) : 0 },
    stages,
    people,
    contacts: content?.contacts ?? [],
    faq: (kind === "onboarding" ? content?.faqOnboarding : content?.faqOffboarding) ?? [],
    completed: summary.status === "completed",
  };
}
