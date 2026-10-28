import type { CreateJourneyBody } from "@/lib/api-client";
import type { DetectionDTO, SettingsDTO, UserRef } from "@/shared/contracts";
import type { JourneyKind, OffboardingReason, ParticipantRole } from "@/shared/enums";
import { dateOnlySchema, journeyPersonInput } from "@/shared/schemas";

export interface WizardState {
  kind: JourneyKind | null;
  personMode: "bitrix" | "manual";
  bitrixPerson: UserRef | null;
  manualName: string;
  manualEmail: string;
  /** Convidar a pessoa para o Bitrix24 pelo e-mail (pessoa sem conta). */
  invite: boolean;
  /** Cargo nesta jornada: vem do Bitrix24 ao escolher a pessoa e o RH pode mudar. */
  position: string;
  templateId: string | null;
  anchorDate: string;
  reason: OffboardingReason | null;
  participants: Partial<Record<ParticipantRole, UserRef | null>>;
  detectionId: string | null;
}

export type WizardErrors = Partial<Record<"kind" | "person" | "manualName" | "manualEmail" | "templateId" | "anchorDate" | "reason" | "form", string>>;

export function initialState(settings: SettingsDTO | null, detection: DetectionDTO | null): WizardState {
  const participants: WizardState["participants"] = { ...(settings?.defaults ?? {}) };
  const state: WizardState = {
    kind: null,
    personMode: "bitrix",
    bitrixPerson: null,
    manualName: "",
    manualEmail: "",
    invite: false,
    position: "",
    templateId: null,
    anchorDate: "",
    reason: null,
    participants,
    detectionId: null,
  };
  if (!detection) return state;
  const name = detection.personName ?? detection.title;
  return {
    ...state,
    kind: detection.journeyKind,
    personMode: detection.bitrixUserId || detection.journeyKind === "offboarding" ? "bitrix" : "manual",
    bitrixPerson: detection.bitrixUserId ? { bitrixUserId: detection.bitrixUserId, name, position: null } : null,
    manualName: detection.bitrixUserId ? "" : name,
    manualEmail: detection.personEmail ?? "",
    templateId: detection.templateId || null,
    anchorDate: detection.suggestedDate ?? "",
    detectionId: detection.id,
  };
}

/** Nome de quem percorre a jornada, para o resumo e a prévia. */
export function personName(state: WizardState): string | null {
  if (state.personMode === "bitrix") return state.bitrixPerson?.name ?? null;
  return state.manualName.trim() || null;
}

export function validateStep(step: number, state: WizardState): WizardErrors {
  const errors: WizardErrors = {};
  if (step === 0) {
    if (!state.kind) errors.kind = "Escolha se é uma entrada ou uma saída.";
    if (state.personMode === "bitrix" || state.kind === "offboarding") {
      if (!state.bitrixPerson) errors.person = state.kind === "offboarding" ? "No desligamento, escolha a pessoa no Bitrix24." : "Escolha a pessoa no Bitrix24.";
    } else {
      const parsed = journeyPersonInput.safeParse({ name: state.manualName, ...(state.manualEmail.trim() ? { email: state.manualEmail.trim() } : {}) });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = issue.path[0] === "email" ? "manualEmail" : "manualName";
          errors[field] ??= issue.message;
        }
      }
      if (state.invite && !state.manualEmail.trim()) errors.manualEmail ??= "Informe o e-mail para enviar o convite do Bitrix24.";
    }
  }
  if (step === 1) {
    if (!state.templateId) errors.templateId = "Escolha uma trilha.";
    if (!state.anchorDate) errors.anchorDate = state.kind === "offboarding" ? "Informe o último dia." : "Informe o primeiro dia.";
    else if (!dateOnlySchema.safeParse(state.anchorDate).success) errors.anchorDate = "Use uma data válida.";
    if (state.kind === "offboarding" && !state.reason) errors.reason = "Escolha o motivo da saída.";
  }
  return errors;
}

export function buildInput(state: WizardState, requestId: string): CreateJourneyBody | null {
  if (!state.kind || !state.templateId) return null;
  const manual = state.personMode === "manual" && state.kind === "onboarding";
  if (!manual && !state.bitrixPerson) return null;
  const participants: Partial<Record<ParticipantRole, string>> = {};
  for (const [role, ref] of Object.entries(state.participants) as Array<[ParticipantRole, UserRef | null | undefined]>) {
    if (!ref) continue;
    if (role === "buddy" && state.kind === "offboarding") continue;
    participants[role] = ref.bitrixUserId;
  }
  return {
    requestId,
    kind: state.kind,
    person: manual
      ? { name: state.manualName.trim(), ...(state.manualEmail.trim() ? { email: state.manualEmail.trim() } : {}), ...(state.invite ? { invite: true } : {}) }
      : { bitrixUserId: state.bitrixPerson?.bitrixUserId ?? "" },
    ...(state.position.trim() ? { position: state.position.trim() } : {}),
    templateId: state.templateId,
    anchorDate: state.anchorDate,
    participants,
    ...(state.kind === "offboarding" && state.reason ? { offboardingReason: state.reason } : {}),
    ...(state.detectionId ? { detectionId: state.detectionId } : {}),
  };
}
