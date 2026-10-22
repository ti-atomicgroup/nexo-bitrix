import type {
  AppRole,
  AssigneeRole,
  JourneyType,
  TaskStatus,
} from "@/shared/contracts";

export const typeLabels: Record<JourneyType, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
};
export const roleLabels: Record<AssigneeRole, string> = {
  rh: "Recursos humanos",
  gestor: "Gestor",
  ti: "Tecnologia",
  colaborador: "Colaborador",
  outros: "Outros responsáveis",
};
export const appRoleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  rh: "Recursos humanos",
  gestor: "Gestor",
  executor: "Responsável",
  colaborador: "Colaborador",
};
export const statusLabels: Record<TaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  awaiting_review: "Em aprovação",
  completed: "Concluída",
  deferred: "Adiada",
};
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
export function shortDate(
  value: string,
  timezone = "America/Sao_Paulo",
): string {
  const date = new Date(
    value.length === 10 ? value + "T12:00:00-03:00" : value,
  );
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: timezone,
      })
        .format(date)
        .replace(" de ", " ");
}
export function fullDate(
  value: string,
  timezone = "America/Sao_Paulo",
): string {
  const date = new Date(
    value.length === 10 ? value + "T12:00:00-03:00" : value,
  );
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeZone: timezone,
      }).format(date);
}
export function timeAgo(value: string | null): string {
  if (!value) return "Ainda não sincronizado";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) return "Atualizado agora";
  return minutes < 60
    ? `Há ${minutes} min`
    : `Há ${Math.floor(minutes / 60)} h`;
}
