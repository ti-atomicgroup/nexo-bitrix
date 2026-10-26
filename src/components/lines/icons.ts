import {
  BookOpen,
  Briefcase,
  CalendarClock,
  CircleDot,
  Handshake,
  HeartHandshake,
  KeyRound,
  Laptop,
  ListChecks,
  LogIn,
  LogOut,
  Monitor,
  Package,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ActivityKind, ActivityRole, JourneyKind, LedgerKind } from "@/shared/enums";

/** Pictograma de quem faz cada atividade. */
export const ROLE_ICON: Record<ActivityRole, LucideIcon> = {
  rh: HeartHandshake,
  gestor: Briefcase,
  ti: Monitor,
  colaborador: UserRound,
  buddy: Handshake,
  outro: CircleDot,
};

export const ACTIVITY_KIND_ICON: Record<ActivityKind, LucideIcon> = {
  task: ListChecks,
  meeting: CalendarClock,
  reading: BookOpen,
  delivery: Package,
};

export const LEDGER_ICON: Record<LedgerKind, LucideIcon> = {
  access: KeyRound,
  equipment: Laptop,
};

export const JOURNEY_KIND_ICON: Record<JourneyKind, LucideIcon> = {
  onboarding: LogIn,
  offboarding: LogOut,
};
