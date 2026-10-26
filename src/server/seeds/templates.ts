import "server-only";
import type { z } from "zod";
import { templateInput, type TemplateInput, type templateActivityInput } from "@/shared/schemas";

/**
 * Trilhas iniciais (carregadas em "Preparar o Nexo" quando ainda não há trilhas). Baseadas no SOP de TI e no
 * processo de saída do Nexo antigo, generalizadas: sem nomes, telefones ou sistemas exclusivos de uma empresa.
 * Prazos em dias relativos ao 1º dia (entrada) ou ao último dia (saída); negativo = antes.
 */

export type ActivityDraft = z.input<typeof templateActivityInput>;

const access = (key: string, text: string, name: string) => ({ key, text, ledger: { kind: "access" as const, name } });
const equipment = (key: string, text: string, name: string) => ({ key, text, ledger: { kind: "equipment" as const, name } });
const item = (key: string, text: string) => ({ key, text, ledger: null });

/* ───────────── blocos de entrada ───────────── */

export const welcomeAndDocuments = (): ActivityDraft => ({
  title: "Enviar boas-vindas e lista de documentos",
  role: "rh",
  dueOffsetDays: -5,
  dueOffsetUnit: "business",
  visibility: "team",
  instructions:
    "Envie a mensagem de boas-vindas com o link pessoal do Nexo, a lista de documentos de admissão e o que esperar do primeiro dia. Guarde documentos pessoais só nos sistemas autorizados.",
  checklist: [item("boas-vindas", "Mensagem de boas-vindas enviada"), item("documentos", "Lista de documentos enviada"), item("link", "Link pessoal do Nexo enviado")],
});

export const sendDocuments = (): ActivityDraft => ({
  title: "Envie seus documentos",
  role: "colaborador",
  kind: "delivery",
  dueOffsetDays: -3,
  dueOffsetUnit: "business",
  visibility: "employee",
  instructions: "Envie ao RH os documentos pedidos na mensagem de boas-vindas. Se tiver qualquer dúvida, fale com o RH.",
});

export const itHeadsUp = (): ActivityDraft => ({
  title: "Confirmar acessos e equipamentos da área",
  role: "ti",
  dueOffsetDays: -3,
  dueOffsetUnit: "business",
  instructions:
    "Confirme com o gestor quais sistemas e equipamentos a pessoa vai usar. Se a jornada começou em cima da hora, priorize esta preparação.",
  checklist: [item("acessos-area", "Acessos da área confirmados com o gestor"), item("equipamentos-definidos", "Equipamentos definidos")],
});

const baseAccesses = () => [
  access("google-workspace", "Criar conta Google Workspace e grupo da área", "Google Workspace"),
  access("notion", "Liberar acesso ao Notion", "Notion"),
  access("bitrix24", "Convidar para o Bitrix24 e definir o perfil", "Bitrix24"),
];

export const prepareAccesses = (extra: ReturnType<typeof access>[] = []): ActivityDraft => ({
  title: "Preparar acessos",
  role: "ti",
  dueOffsetDays: -1,
  dueOffsetUnit: "business",
  instructions:
    "Crie as contas até a véspera do primeiro dia. Use o fluxo oficial de cada sistema e nunca escreva senhas na tarefa. Cada item marcado entra no inventário da pessoa.",
  checklist: [...baseAccesses(), ...extra, item("separar-equipamentos", "Separar notebook e acessórios")],
});

export const deliverEquipment = (): ActivityDraft => ({
  title: "Entregar equipamentos e configurar o 2FA",
  role: "ti",
  dueOffsetDays: 0,
  dueTime: "12:00",
  instructions: "Entregue os equipamentos, ajude a pessoa a entrar nos sistemas e configure a verificação em duas etapas junto com ela.",
  checklist: [
    equipment("notebook", "Entregar notebook", "Notebook"),
    equipment("headset", "Entregar headset", "Headset"),
    equipment("cracha", "Entregar crachá", "Crachá"),
    item("2fa", "Configurar 2FA nos sistemas críticos"),
    item("guia-seguranca", "Apresentar o guia de segurança"),
  ],
});

export const planFirstWeek = (): ActivityDraft => ({
  title: "Planejar a primeira semana",
  role: "gestor",
  dueOffsetDays: -2,
  dueOffsetUnit: "business",
  instructions: "Defina as primeiras entregas, quem a pessoa precisa conhecer e a agenda da primeira semana.",
  checklist: [item("agenda", "Agenda da primeira semana pronta"), item("primeiras-entregas", "Primeiras entregas definidas")],
});

export const buddyIntro = (): ActivityDraft => ({
  title: "Apresentar-se como buddy",
  role: "buddy",
  dueOffsetDays: -1,
  dueOffsetUnit: "business",
  required: false,
  instructions: "Mande uma mensagem de boas-vindas e combine um café no primeiro dia.",
});

export const welcomeMeeting = (): ActivityDraft => ({
  title: "Receber a pessoa e apresentar o time",
  role: "gestor",
  kind: "meeting",
  dueOffsetDays: 0,
  dueTime: "10:00",
  visibility: "employee",
  instructions: "Receba a pessoa, apresente o time e explique como o trabalho funciona por aqui.",
});

export const hrIntegration = (): ActivityDraft => ({
  title: "Integração com o RH",
  role: "rh",
  kind: "meeting",
  dueOffsetDays: 0,
  dueTime: "14:00",
  visibility: "employee",
  instructions: "Apresente benefícios, políticas, canais de atendimento e tire as dúvidas sobre a admissão.",
});

export const cultureGuide = (): ActivityDraft => ({
  title: "Leia o guia de cultura",
  role: "colaborador",
  kind: "reading",
  dueOffsetDays: 2,
  dueOffsetUnit: "business",
  visibility: "employee",
  instructions: "Leia o guia de cultura e os combinados do time. Anote suas dúvidas para conversar no 1:1.",
});

export const buddyFirstWeek = (): ActivityDraft => ({
  title: "Acompanhar a primeira semana",
  role: "buddy",
  dueOffsetDays: 5,
  dueOffsetUnit: "business",
  required: false,
  instructions: "Converse com a pessoa ao longo da semana e ajude com as dúvidas do dia a dia.",
});

export const firstImpressionSurvey = (): ActivityDraft => ({
  title: "Responda a pesquisa de primeiras impressões",
  role: "colaborador",
  dueOffsetDays: 15,
  visibility: "employee",
  required: false,
  instructions: "Conte como foram suas primeiras semanas. Leva poucos minutos e ajuda a melhorar a chegada de quem vem depois.",
});

export const oneOnOne30 = (): ActivityDraft => ({
  title: "1:1 de 30 dias",
  role: "gestor",
  kind: "meeting",
  dueOffsetDays: 30,
  dueTime: "15:00",
  visibility: "employee",
  instructions: "Converse sobre a adaptação, as expectativas dos dois lados e os próximos passos.",
});

export const review90 = (): ActivityDraft => ({
  title: "Avaliação de 90 dias",
  role: "gestor",
  kind: "meeting",
  dueOffsetDays: 80,
  dueTime: "15:00",
  instructions: "Registre a avaliação do período de experiência (até 90 dias) e combine o plano de desenvolvimento.",
});

export const confirmHire = (): ActivityDraft => ({
  title: "Registrar a efetivação",
  role: "rh",
  dueOffsetDays: 85,
  visibility: "hr",
  instructions: "Confirme a decisão do período de experiência com o gestor e atualize o cadastro.",
});

function onboarding(name: string, profile: string, description: string, extras: { prep?: ActivityDraft[]; accesses?: ReturnType<typeof access>[]; firstDay?: ActivityDraft[]; weeks?: ActivityDraft[] }) {
  return {
    kind: "onboarding" as const,
    name,
    profile,
    description,
    stages: [
      {
        name: "Preparar a chegada",
        description: "Documentos, acessos e agenda prontos antes do primeiro dia.",
        releaseMode: "start" as const,
        activities: [welcomeAndDocuments(), sendDocuments(), itHeadsUp(), planFirstWeek(), prepareAccesses(extras.accesses), buddyIntro(), ...(extras.prep ?? [])],
      },
      {
        name: "Primeiro dia",
        description: "Boas-vindas, equipamentos e integração.",
        releaseMode: "offset" as const,
        releaseOffsetDays: 0,
        activities: [welcomeMeeting(), deliverEquipment(), hrIntegration(), ...(extras.firstDay ?? [])],
      },
      {
        name: "Primeiras semanas",
        description: "Adaptação com acompanhamento do gestor e do buddy.",
        releaseMode: "after_previous" as const,
        activities: [cultureGuide(), buddyFirstWeek(), firstImpressionSurvey(), oneOnOne30(), ...(extras.weeks ?? [])],
      },
      {
        name: "Fim da experiência",
        description: "Avaliação e efetivação.",
        releaseMode: "offset" as const,
        releaseOffsetDays: 75,
        activities: [review90(), confirmHire()],
      },
    ],
  };
}

/* ───────────── blocos de saída ───────────── */

export const revokeAndCollect = (): ActivityDraft => ({
  title: "Revogar e recolher",
  role: "ti",
  dueOffsetDays: 0,
  dueTime: "18:00",
  ledgerRole: "revoke_and_collect",
  instructions:
    "No horário combinado com o RH, revogue cada acesso e recolha cada equipamento desta lista (ela vem do inventário da pessoa). Marque cada item ao concluir. Não bloqueie ninguém antes da hora.",
  checklist: [item("email", "Encaminhar o e-mail corporativo conforme a política"), item("arquivos", "Transferir arquivos para o gestor")],
});

export const returnEquipment = (): ActivityDraft => ({
  title: "Devolva equipamentos e crachá",
  role: "colaborador",
  kind: "delivery",
  dueOffsetDays: 0,
  dueTime: "17:00",
  visibility: "employee",
  instructions: "Devolva notebook, acessórios e crachá à TI no seu último dia. Se algo estiver com você em outro lugar, combine a devolução com o RH.",
});

export const benefitsGuidance = (): ActivityDraft => ({
  title: "Orientar sobre benefícios, pagamentos e documentos",
  role: "rh",
  dueOffsetDays: 0,
  dueTime: "16:00",
  visibility: "employee",
  instructions: "Explique as datas de pagamento, os documentos da rescisão e o que acontece com cada benefício, conforme a política vigente.",
  checklist: [item("documentos-rescisao", "Documentos da rescisão explicados"), item("beneficios", "Benefícios e prazos explicados"), item("contatos", "Contatos pós-saída informados")],
});

export const exitInterview = (): ActivityDraft => ({
  title: "Entrevista de saída",
  role: "rh",
  kind: "meeting",
  dueOffsetDays: -3,
  dueOffsetUnit: "business",
  dueTime: "15:00",
  visibility: "employee",
  required: false,
  instructions: "Ofereça um espaço de escuta para entender os motivos e recolher sugestões. Guarde observações sensíveis só no ambiente autorizado.",
});

export const knowledgeHandover = (): ActivityDraft => ({
  title: "Passagem de conhecimento",
  role: "gestor",
  dueOffsetDays: -2,
  dueOffsetUnit: "business",
  instructions: "Mapeie entregas em aberto, transfira o contexto e confirme quem assume cada responsabilidade.",
  checklist: [item("entregas", "Entregas em aberto encaminhadas"), item("responsaveis", "Novos responsáveis informados"), item("documentacao", "Documentação atualizada")],
});

export const planRevocation = (): ActivityDraft => ({
  title: "Planejar a revogação dos acessos",
  role: "ti",
  dueOffsetDays: -1,
  dueOffsetUnit: "business",
  instructions: "Combine com o RH o horário exato da revogação e confira o inventário da pessoa no Nexo. Não bloqueie acessos antes da hora.",
  checklist: [item("horario", "Horário da revogação combinado com o RH")],
});

export const formalRecord = (): ActivityDraft => ({
  title: "Registrar o desligamento",
  role: "rh",
  dueOffsetDays: 2,
  dueOffsetUnit: "business",
  visibility: "hr",
  instructions: "Conclua o registro formal da saída e confira os documentos exigidos pela política interna.",
  checklist: [item("registro", "Registro formal concluído"), item("documentos-conferidos", "Documentos conferidos")],
});

const voluntary = {
  kind: "offboarding" as const,
  name: "Desligamento · Voluntário",
  profile: "Geral",
  description: "Quando a pessoa pede para sair: transição respeitosa, passagem de conhecimento e devolução de tudo o que foi entregue.",
  stages: [
    {
      name: "Alinhar a saída",
      description: "Data confirmada e próximos passos combinados.",
      releaseMode: "start" as const,
      activities: [
        {
          title: "Confirmar a decisão e o último dia",
          role: "gestor" as const,
          dueOffsetDays: -10,
          instructions: "Converse com a pessoa, confirme a data do último dia e avise o RH com discrição.",
          checklist: [item("ultimo-dia", "Último dia confirmado"), item("rh-avisado", "RH avisado")],
        },
        {
          title: "Reunião de alinhamento",
          role: "rh" as const,
          kind: "meeting" as const,
          dueOffsetDays: -8,
          dueTime: "10:00",
          visibility: "employee" as const,
          instructions: "RH, gestor e pessoa alinham o último dia, a passagem de responsabilidades e a documentação.",
        },
      ],
    },
    {
      name: "Transição",
      description: "Conhecimento passado e saída planejada.",
      releaseMode: "offset" as const,
      releaseOffsetDays: -5,
      activities: [
        knowledgeHandover(),
        exitInterview(),
        {
          title: "Organize seus arquivos e passe o que for preciso",
          role: "colaborador" as const,
          dueOffsetDays: -2,
          dueOffsetUnit: "business" as const,
          visibility: "employee" as const,
          instructions: "Salve os arquivos de trabalho nas pastas do time e combine com o gestor o que precisa ser passado adiante.",
        },
        planRevocation(),
      ],
    },
    {
      name: "Último dia",
      description: "Acessos revogados, equipamentos devolvidos e orientações entregues.",
      releaseMode: "offset" as const,
      releaseOffsetDays: 0,
      activities: [revokeAndCollect(), returnEquipment(), benefitsGuidance()],
    },
    {
      name: "Encerramento",
      description: "Registro formal e agradecimento.",
      releaseMode: "offset" as const,
      releaseOffsetDays: 2,
      activities: [
        formalRecord(),
        {
          title: "Enviar agradecimento e contatos pós-saída",
          role: "rh" as const,
          dueOffsetDays: 2,
          visibility: "employee" as const,
          required: false,
          instructions: "Agradeça pela trajetória e deixe os canais para dúvidas sobre documentos e pagamentos.",
        },
      ],
    },
  ],
};

const involuntary = {
  kind: "offboarding" as const,
  name: "Desligamento · Involuntário",
  profile: "Geral",
  description: "Quando a empresa decide a saída: comunicação cuidadosa, revogação no horário certo e orientação individual.",
  stages: [
    {
      name: "Preparar a comunicação",
      description: "Gestor, RH e TI alinhados antes da conversa.",
      releaseMode: "start" as const,
      activities: [
        {
          title: "Alinhar a comunicação com o gestor",
          role: "rh" as const,
          dueOffsetDays: -3,
          dueOffsetUnit: "business" as const,
          visibility: "hr" as const,
          instructions: "Confirme data, horário, quem participa e como comunicar a decisão com respeito. Restrinja as informações a quem precisa saber.",
          checklist: [item("data-horario", "Data e horário confirmados"), item("roteiro", "Roteiro da conversa combinado")],
        },
        planRevocation(),
      ],
    },
    {
      name: "Comunicar",
      description: "Conversa, orientação e devolução no mesmo dia.",
      releaseMode: "offset" as const,
      releaseOffsetDays: 0,
      activities: [
        {
          title: "Conversa de desligamento",
          role: "gestor" as const,
          kind: "meeting" as const,
          dueOffsetDays: 0,
          dueTime: "10:00",
          instructions: "Gestor e RH explicam a decisão e os próximos passos com clareza e empatia, e abrem espaço para dúvidas.",
        },
        benefitsGuidance(),
        revokeAndCollect(),
        returnEquipment(),
        {
          title: "Redistribuir atividades e conhecimento",
          role: "gestor" as const,
          dueOffsetDays: 1,
          dueOffsetUnit: "business" as const,
          instructions: "Registre as entregas em andamento e defina quem assume cada uma.",
          checklist: [item("redistribuicao", "Atividades redistribuídas")],
        },
      ],
    },
    {
      name: "Encerramento",
      description: "Registro formal e escuta.",
      releaseMode: "offset" as const,
      releaseOffsetDays: 2,
      activities: [
        formalRecord(),
        {
          title: "Oferecer espaço de escuta",
          role: "rh" as const,
          dueOffsetDays: 3,
          visibility: "hr" as const,
          required: false,
          instructions: "Fique disponível para dúvidas e, quando fizer sentido, para ouvir a pessoa. Registre conteúdo sensível só no ambiente autorizado.",
        },
      ],
    },
  ],
};

export function starterTemplates(): TemplateInput[] {
  return [
    onboarding("Onboarding · Geral", "Geral", "Chegada completa: documentos, acessos, primeiro dia, acompanhamento e avaliação da experiência.", {}),
    onboarding("Onboarding · Vendas", "Vendas", "Chegada para o time comercial: CRM, carteira, metas e acompanhamento de reuniões.", {
      accesses: [access("crm", "Liberar acesso ao CRM com o perfil de vendas", "CRM")],
      firstDay: [
        {
          title: "Treinamento do produto e do processo comercial",
          role: "gestor",
          kind: "meeting",
          dueOffsetDays: 1,
          dueOffsetUnit: "business",
          dueTime: "10:00",
          visibility: "employee",
          instructions: "Apresente o produto, o funil de vendas e como as oportunidades são registradas no CRM.",
        },
      ],
      weeks: [
        {
          title: "Definir carteira e metas iniciais",
          role: "gestor",
          dueOffsetDays: 5,
          dueOffsetUnit: "business",
          instructions: "Defina a carteira inicial, as metas das primeiras semanas e como elas serão acompanhadas.",
        },
        {
          title: "Acompanhe 3 reuniões com clientes",
          role: "colaborador",
          dueOffsetDays: 10,
          dueOffsetUnit: "business",
          visibility: "employee",
          instructions: "Participe como ouvinte de pelo menos três reuniões com clientes e anote o que aprendeu.",
        },
      ],
    }),
    onboarding("Onboarding · Tecnologia", "Tecnologia", "Chegada para o time de tecnologia: repositórios, ambiente de desenvolvimento e primeira entrega.", {
      accesses: [access("github", "Liberar acesso ao GitHub e aos repositórios do time", "GitHub"), access("nuvem", "Liberar acesso ao console de nuvem", "Console de nuvem")],
      firstDay: [
        {
          title: "Configure seu ambiente de desenvolvimento",
          role: "colaborador",
          dueOffsetDays: 1,
          dueOffsetUnit: "business",
          visibility: "employee",
          instructions: "Siga o guia de ambiente do time para clonar os repositórios e rodar o projeto na sua máquina.",
        },
      ],
      weeks: [
        {
          title: "Pareamento no primeiro projeto",
          role: "buddy",
          kind: "meeting",
          dueOffsetDays: 3,
          dueOffsetUnit: "business",
          dueTime: "14:00",
          instructions: "Programe em par com a pessoa para mostrar o fluxo de trabalho, revisão de código e publicação.",
        },
        {
          title: "Primeira entrega pequena em produção",
          role: "gestor",
          dueOffsetDays: 10,
          dueOffsetUnit: "business",
          instructions: "Escolha uma tarefa pequena para a pessoa levar até produção com apoio do buddy.",
        },
      ],
    }),
    voluntary,
    involuntary,
  ].map((template) => templateInput.parse(template));
}
