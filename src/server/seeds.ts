import type { JourneyTemplate, SessionInfo } from "../shared/contracts";
import { templateSchema } from "../shared/validation";
import type { Journeys } from "./journeys";
import { offboardingTemplates } from "./offboarding-templates";

type StarterTemplate = Omit<JourneyTemplate, "version" | "updatedAt">;

const onboardingTemplate: StarterTemplate = {
  id: "nexo-onboarding",
  name: "Integração de pessoas",
  description:
    "Modelo inicial editável. Ajuste responsáveis, prazos e checklists às políticas da sua empresa.",
  type: "onboarding",
  stages: [
    {
      id: "onboarding-preparar",
      title: "Preparar a chegada",
      activities: [
        {
          id: "onboarding-rh",
          title: "Preparar documentação de admissão",
          description:
            "Confirme os documentos necessários segundo a política interna. Armazene dados pessoais apenas em locais autorizados.",
          assigneeRole: "rh",
          offsetDays: -2,
          required: true,
          critical: false,
          visibility: "hr",
          checklist: [
            {
              id: "onboarding-rh-check",
              title: "Documentação conferida pelo RH",
              required: true,
            },
          ],
          documents: [],
        },
        {
          id: "onboarding-ti",
          title: "Preparar equipamentos e acessos",
          description:
            "Confira as autorizações e prepare os recursos para o primeiro dia.",
          assigneeRole: "ti",
          offsetDays: 0,
          required: true,
          critical: true,
          visibility: "team",
          checklist: [
            {
              id: "onboarding-access",
              title: "Acessos autorizados preparados",
              required: true,
            },
            {
              id: "onboarding-equipment",
              title: "Equipamentos preparados",
              required: true,
            },
          ],
          documents: [],
        },
      ],
    },
    {
      id: "onboarding-pessoa",
      title: "Acolher e acompanhar",
      activities: [
        {
          id: "onboarding-employee",
          title: "Conhecer as orientações da empresa",
          description:
            "Leia as orientações fornecidas pelo RH e registre dúvidas na tarefa do Bitrix24.",
          assigneeRole: "colaborador",
          offsetDays: 1,
          required: true,
          critical: false,
          visibility: "employee",
          checklist: [
            {
              id: "onboarding-read",
              title: "Orientações recebidas e conferidas",
              required: true,
            },
          ],
          documents: [],
        },
      ],
    },
  ],
};

export const starterTemplates = [
  onboardingTemplate,
  ...offboardingTemplates,
];

export function seedTemplates(journeys: Journeys, session: SessionInfo) {
  for (const template of starterTemplates) {
    if (journeys.store.get("template", template.id, templateSchema)) continue;
    journeys.saveTemplate(session, template);
  }
}
