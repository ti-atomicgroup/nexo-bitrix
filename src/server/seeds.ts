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
  profile: "Geral",
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
          id: "onboarding-ti-aviso",
          title: "TI · antecipar preparação da chegada",
          description:
            "Tarefa nativa para avisar TI com 3 dias úteis de antecedência. Confirme com o gestor os acessos específicos da área e planeje contas e equipamentos. Se a jornada começar após este prazo, priorize a preparação imediatamente.",
          assigneeRole: "ti",
          offsetDays: -3,
          offsetUnit: "business_days",
          required: true,
          critical: true,
          visibility: "team",
          checklist: [
            { id: "onboarding-ti-aviso-check", title: "TI avisado e necessidades da área confirmadas com o gestor", required: true },
          ],
          documents: [],
        },
        {
          id: "onboarding-ti",
          title: "TI · liberar acessos até o primeiro dia",
          description:
            "Execute e confirme o checklist de TI até o primeiro dia de trabalho. Crie ou convide o usuário Bitrix24 pelo fluxo nativo e defina o perfil autorizado. Configure o 2FA junto com a pessoa. Registre exceções com o gestor; não inclua credenciais na tarefa.",
          assigneeRole: "ti",
          offsetDays: 0,
          required: true,
          critical: true,
          visibility: "team",
          checklist: [
            { id: "onboarding-google", title: "Conta Google Workspace criada", required: true },
            { id: "onboarding-google-group", title: "Grupo ou unidade organizacional do Google Workspace configurado", required: true },
            { id: "onboarding-notion", title: "Acesso ao Notion concedido", required: true },
            { id: "onboarding-bitrix", title: "Usuário Bitrix24 criado ou convidado e perfil definido", required: true },
            { id: "onboarding-2fa", title: "2FA configurado nos sistemas críticos com o colaborador", required: true },
            { id: "onboarding-guide", title: "Guia de boas-vindas de TI enviado", required: true },
            { id: "onboarding-security", title: "Políticas de segurança apresentadas", required: true },
            { id: "onboarding-area", title: "Acessos específicos da área conferidos com o gestor", required: true },
            { id: "onboarding-equipment", title: "Equipamentos preparados, quando aplicável", required: true },
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
          offsetDays: 0,
          required: true,
          critical: false,
          visibility: "employee",
          checklist: [
            {
              id: "onboarding-read",
              title: "Orientações recebidas e conferidas",
              required: true,
            },
            { id: "onboarding-employee-2fa", title: "2FA configurado com apoio de TI", required: true },
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
