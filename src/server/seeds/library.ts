import "server-only";
import type { LibraryActivityDTO } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";
import { templateActivityInput } from "@/shared/schemas";
import {
  benefitsGuidance,
  buddyIntro,
  confirmHire,
  cultureGuide,
  deliverEquipment,
  exitInterview,
  firstImpressionSurvey,
  formalRecord,
  hrIntegration,
  itHeadsUp,
  knowledgeHandover,
  oneOnOne30,
  planFirstWeek,
  planRevocation,
  prepareAccesses,
  returnEquipment,
  review90,
  revokeAndCollect,
  sendDocuments,
  welcomeAndDocuments,
  welcomeMeeting,
  type ActivityDraft,
} from "./templates";

/** Atividades prontas (só leitura) para inserir nas trilhas, agrupadas como na tela de Trilhas. */
type Group = "Boas-vindas" | "Acessos e TI" | "Gestão" | "Cultura" | "Desligamento";

function entry(id: string, group: Group, journeyKind: JourneyKind | "both", draft: ActivityDraft): LibraryActivityDTO {
  const parsed = templateActivityInput.parse(draft);
  return {
    id: `lib-${id}`,
    journeyKind,
    group,
    activity: {
      title: parsed.title,
      instructions: parsed.instructions,
      kind: parsed.kind,
      role: parsed.role,
      dueOffsetDays: parsed.dueOffsetDays,
      dueOffsetUnit: parsed.dueOffsetUnit,
      dueTime: parsed.dueTime,
      required: parsed.required,
      visibility: parsed.visibility,
      requiresApproval: parsed.requiresApproval,
      ledgerRole: parsed.ledgerRole,
      checklist: parsed.checklist,
      links: parsed.links,
    },
  };
}

export function activityLibrary(): LibraryActivityDTO[] {
  return [
    entry("boas-vindas-rh", "Boas-vindas", "onboarding", welcomeAndDocuments()),
    entry("envie-documentos", "Boas-vindas", "onboarding", sendDocuments()),
    entry("buddy-apresentacao", "Boas-vindas", "onboarding", buddyIntro()),
    entry("receber-pessoa", "Boas-vindas", "onboarding", welcomeMeeting()),
    entry("integracao-rh", "Boas-vindas", "onboarding", hrIntegration()),
    entry("ti-aviso", "Acessos e TI", "onboarding", itHeadsUp()),
    entry("preparar-acessos", "Acessos e TI", "onboarding", prepareAccesses()),
    entry("entregar-equipamentos", "Acessos e TI", "onboarding", deliverEquipment()),
    entry(
      "acesso-crm",
      "Acessos e TI",
      "onboarding",
      {
        title: "Liberar acesso ao CRM",
        role: "ti",
        dueOffsetDays: -1,
        dueOffsetUnit: "business",
        instructions: "Crie o acesso ao CRM com o perfil combinado com o gestor.",
        checklist: [{ key: "crm", text: "Liberar acesso ao CRM", ledger: { kind: "access", name: "CRM" } }],
      },
    ),
    entry(
      "acesso-github",
      "Acessos e TI",
      "onboarding",
      {
        title: "Liberar acesso ao GitHub",
        role: "ti",
        dueOffsetDays: -1,
        dueOffsetUnit: "business",
        instructions: "Adicione a pessoa à organização e aos repositórios do time, com verificação em duas etapas obrigatória.",
        checklist: [{ key: "github", text: "Liberar acesso ao GitHub", ledger: { kind: "access", name: "GitHub" } }],
      },
    ),
    entry("planejar-semana", "Gestão", "onboarding", planFirstWeek()),
    entry("1-1-30-dias", "Gestão", "onboarding", oneOnOne30()),
    entry("avaliacao-experiencia", "Gestão", "onboarding", review90()),
    entry("efetivacao", "Gestão", "onboarding", confirmHire()),
    entry("guia-cultura", "Cultura", "onboarding", cultureGuide()),
    entry("pesquisa-impressoes", "Cultura", "onboarding", firstImpressionSurvey()),
    entry(
      "almoco-time",
      "Cultura",
      "onboarding",
      {
        title: "Almoço de boas-vindas com o time",
        role: "buddy",
        kind: "meeting",
        dueOffsetDays: 3,
        dueOffsetUnit: "business",
        dueTime: "12:00",
        visibility: "employee",
        required: false,
        instructions: "Organize um almoço ou café com o time para a pessoa conhecer todo mundo num clima leve.",
      },
    ),
    entry(
      "feedback-1-1",
      "Gestão",
      "both",
      {
        title: "Conversa de feedback",
        role: "gestor",
        kind: "meeting",
        dueOffsetDays: 14,
        dueTime: "15:00",
        visibility: "employee",
        required: false,
        instructions: "Combine expectativas, dê e peça feedback e registre os próximos passos.",
      },
    ),
    entry("entrevista-saida", "Desligamento", "offboarding", exitInterview()),
    entry("passagem-conhecimento", "Desligamento", "offboarding", knowledgeHandover()),
    entry("planejar-revogacao", "Desligamento", "offboarding", planRevocation()),
    entry("revogar-recolher", "Desligamento", "offboarding", revokeAndCollect()),
    entry("devolva-equipamentos", "Desligamento", "offboarding", returnEquipment()),
    entry("orientar-beneficios", "Desligamento", "offboarding", benefitsGuidance()),
    entry("registrar-desligamento", "Desligamento", "offboarding", formalRecord()),
  ];
}
