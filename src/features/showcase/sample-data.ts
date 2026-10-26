/**
 * Dados de exemplo da vitrine (`/dev/vitrine`). Pessoas e empresa fictícias. As datas são relativas a hoje,
 * para os rótulos ("amanhã", "em 7 dias") fazerem sentido em qualquer dia. Nunca usados no produto.
 */
import { addDays } from "@/lib/format";
import type { CollaboratorViewDTO, JourneySummaryDTO, PersonDTO, ScopeCheckDTO, TodayDTO } from "@/shared/contracts";

const COMPANY = "Atomic Group";

function at(day: string, time: string): string {
  return `${day}T${time}:00-03:00`;
}

function person(id: string, name: string, position: string, department: string): PersonDTO {
  return { id, bitrixUserId: id.replace(/\D/g, "") || "1", name, email: null, position, department, active: true, source: "bitrix" };
}

export function buildSamples(today: string) {
  const ana = person("p-11", "Ana Souza", "Executiva de vendas", "Comercial");
  const bruno = person("p-12", "Bruno Lima", "Analista de suporte", "Atendimento");
  const carla = person("p-13", "Carla Mendes", "Desenvolvedora", "Tecnologia");

  const lines: JourneySummaryDTO[] = [
    {
      id: "j-1",
      kind: "onboarding",
      person: ana,
      templateName: "Onboarding Vendas",
      profile: "Comercial",
      anchorDate: addDays(today, 7),
      status: "active",
      progress: { done: 3, total: 14, percent: 21 },
      line: [
        { position: 1, name: "Antes do 1º dia", state: "current" },
        { position: 2, name: "Primeiro dia", state: "upcoming" },
        { position: 3, name: "Primeira semana", state: "upcoming" },
        { position: 4, name: "Primeiro mês", state: "upcoming" },
      ],
      nextStop: { label: "Preparar notebook", at: at(addDays(today, 2), "18:00") },
      risk: "attention",
    },
    {
      id: "j-2",
      kind: "offboarding",
      person: bruno,
      templateName: "Desligamento voluntário",
      profile: "",
      anchorDate: addDays(today, 3),
      status: "active",
      progress: { done: 5, total: 11, percent: 45 },
      line: [
        { position: 1, name: "Comunicação", state: "done" },
        { position: 2, name: "Antes do último dia", state: "current" },
        { position: 3, name: "Último dia", state: "upcoming" },
        { position: 4, name: "Depois da saída", state: "upcoming" },
      ],
      nextStop: { label: "Último dia", at: addDays(today, 3) },
      risk: "critical",
    },
    {
      id: "j-3",
      kind: "onboarding",
      person: carla,
      templateName: "Onboarding Tecnologia",
      profile: "Engenharia",
      anchorDate: addDays(today, -12),
      status: "active",
      progress: { done: 12, total: 16, percent: 75 },
      line: [
        { position: 1, name: "Antes do 1º dia", state: "done" },
        { position: 2, name: "Primeiro dia", state: "done" },
        { position: 3, name: "Primeiras semanas", state: "current" },
        { position: 4, name: "Primeiro mês", state: "upcoming" },
        { position: 5, name: "Experiência", state: "upcoming" },
      ],
      nextStop: { label: "1:1 de 30 dias", at: at(addDays(today, 18), "10:00") },
      risk: "ok",
    },
  ];

  const todayDto: TodayDTO = {
    date: today,
    greetingName: "Marina Rocha",
    counters: { actions: 6, arriving: 2, leaving: 1 },
    board: [
      {
        id: "b-1",
        kind: "detection",
        when: { label: "Agora", at: null, overdue: false },
        who: { name: "Diego Rocha", journeyId: null, kind: "onboarding" },
        what: "Contratado no CRM",
        reason: "Funil Recrutamento, etapa Contratado. A trilha e a data já vêm preenchidas.",
        status: { tone: "info", label: "Novo" },
        action: { type: "start_journey", label: "Iniciar jornada", targetId: "det-1" },
      },
      {
        id: "b-2",
        kind: "hr_activity",
        when: { label: "Ontem 18:00", at: at(addDays(today, -1), "18:00"), overdue: true },
        who: { name: "Bruno Lima", journeyId: "j-2", kind: "offboarding" },
        what: "Agendar a entrevista de saída",
        reason: "Atividade do RH na etapa Antes do último dia.",
        status: { tone: "late", label: "Atrasada" },
        action: { type: "open_activity", label: "Abrir", targetId: "a-12" },
      },
      {
        id: "b-3",
        kind: "approval",
        when: { label: "Hoje 18:00", at: at(today, "18:00"), overdue: false },
        who: { name: "Carla Mendes", journeyId: "j-3", kind: "onboarding" },
        what: "Aprovar o acesso ao repositório",
        reason: "A TI concluiu e a tarefa espera a sua aprovação.",
        status: { tone: "attention", label: "Aguardando você" },
        action: { type: "approve", label: "Aprovar", targetId: "a-21" },
      },
      {
        id: "b-4",
        kind: "risk",
        when: { label: "Amanhã 12:00", at: at(addDays(today, 1), "12:00"), overdue: false },
        who: { name: "Ana Souza", journeyId: "j-1", kind: "onboarding" },
        what: "Preparar notebook",
        reason: "A TI ainda não começou e o 1º dia é em 7 dias.",
        status: { tone: "attention", label: "Em risco" },
        action: { type: "nudge", label: "Cobrar", targetId: "a-3" },
      },
      {
        id: "b-5",
        kind: "sync_error",
        when: { label: "Há 10 min", at: null, overdue: false },
        who: { name: "Bruno Lima", journeyId: "j-2", kind: "offboarding" },
        what: "Tarefa não chegou ao Bitrix24",
        reason: "O Bitrix24 pediu uma pausa. O Nexo tenta de novo em 2 min.",
        status: { tone: "late", label: "Falhou" },
        action: { type: "resolve_sync", label: "Ver jornada", targetId: "j-2" },
      },
      {
        id: "b-6",
        kind: "missing_data",
        when: { label: "Até sexta", at: null, overdue: false },
        who: { name: "Carla Mendes", journeyId: "j-3", kind: "onboarding" },
        what: "Escolher o buddy",
        reason: "Sem buddy, 2 atividades ficam sem responsável.",
        status: { tone: "info", label: "Falta dado" },
        action: { type: "open_journey", label: "Completar", targetId: "j-3" },
      },
    ],
    lines,
    upcoming: [
      { journeyId: "j-2", personName: "Bruno Lima", kind: "offboarding", anchorDate: addDays(today, 3), daysUntil: 3 },
      { journeyId: "j-1", personName: "Ana Souza", kind: "onboarding", anchorDate: addDays(today, 7), daysUntil: 7 },
      { journeyId: "j-4", personName: "Diego Rocha", kind: "onboarding", anchorDate: addDays(today, 12), daysUntil: 12 },
    ],
    sync: { connected: true, lastCycleAt: null, lastError: null, rateLimitedUntil: null, queued: 2 },
  };

  const collaboratorOnboarding: CollaboratorViewDTO = {
    kind: "onboarding",
    company: COMPANY,
    person: { firstName: "Ana", name: "Ana Souza" },
    anchorDate: addDays(today, 7),
    daysUntilAnchor: 7,
    message:
      "Que bom ter você com a gente, Ana!\nPreparamos tudo para a sua primeira semana ser tranquila. Qualquer dúvida, é só chamar o RH.",
    progress: { done: 2, total: 8, percent: 25 },
    stages: [
      {
        position: 1,
        name: "Antes do 1º dia",
        state: "current",
        activities: [
          {
            id: "c-1",
            title: "Enviar os documentos de admissão",
            instructions: "Mande foto do RG, do CPF e do comprovante de endereço pelo e-mail do RH.",
            kind: "task",
            dueAt: at(addDays(today, 2), "18:00"),
            status: "done",
            mine: true,
            ownerLabel: "Você",
            links: [],
          },
          {
            id: "c-2",
            title: "Assinar o termo de uso de equipamentos",
            instructions: "Leia o termo e assine pelo link. Leva uns 5 minutos.",
            kind: "task",
            dueAt: at(addDays(today, 3), "18:00"),
            status: "todo",
            mine: true,
            ownerLabel: "Você",
            links: [{ label: "Termo de uso de equipamentos", url: "https://exemplo.com.br/termo-de-uso" }],
          },
          {
            id: "c-3",
            title: "Preparar o seu notebook",
            instructions: "",
            kind: "delivery",
            dueAt: at(addDays(today, 5), "18:00"),
            status: "todo",
            mine: false,
            ownerLabel: "TI",
            links: [],
          },
          {
            id: "c-4",
            title: "Criar a sua conta de e-mail",
            instructions: "",
            kind: "task",
            dueAt: at(addDays(today, 6), "18:00"),
            status: "done",
            mine: false,
            ownerLabel: "TI",
            links: [],
          },
        ],
      },
      {
        position: 2,
        name: "Primeiro dia",
        state: "upcoming",
        activities: [
          {
            id: "c-5",
            title: "Café de boas-vindas com o time",
            instructions: "Na copa do 3º andar. A sua liderança recebe você na recepção.",
            kind: "meeting",
            dueAt: at(addDays(today, 7), "09:30"),
            status: "waiting",
            mine: true,
            ownerLabel: "Você",
            links: [],
          },
          {
            id: "c-6",
            title: "Apresentar as ferramentas do time",
            instructions: "",
            kind: "meeting",
            dueAt: at(addDays(today, 7), "14:00"),
            status: "waiting",
            mine: false,
            ownerLabel: "Seu buddy",
            links: [],
          },
        ],
      },
      {
        position: 3,
        name: "Primeira semana",
        state: "upcoming",
        activities: [
          {
            id: "c-7",
            title: "Ler o guia de cultura",
            instructions: "",
            kind: "reading",
            dueAt: at(addDays(today, 11), "18:00"),
            status: "waiting",
            mine: true,
            ownerLabel: "Você",
            links: [{ label: "Guia de cultura da Atomic Group", url: "https://exemplo.com.br/guia-de-cultura" }],
          },
          {
            id: "c-8",
            title: "Conversa de primeira semana",
            instructions: "",
            kind: "meeting",
            dueAt: at(addDays(today, 12), "16:00"),
            status: "waiting",
            mine: false,
            ownerLabel: "Sua liderança",
            links: [],
          },
        ],
      },
    ],
    people: [
      { role: "gestor", name: "Rafael Prado", position: "Coordenador comercial" },
      { role: "buddy", name: "Júlia Campos", position: "Executiva de vendas" },
      { role: "rh", name: "Marina Rocha", position: "Analista de pessoas" },
    ],
    contacts: [
      { label: "E-mail do RH", value: "pessoas@exemplo.com.br" },
      { label: "WhatsApp do RH", value: "+55 11 90000-0000" },
    ],
    faq: [
      { question: "Que horas começa o primeiro dia?", answer: "Às 9h. O Rafael recebe você na recepção." },
      { question: "Preciso levar algum documento?", answer: "Só um documento com foto. O restante já foi enviado." },
      { question: "Como peço ajuda com acessos?", answer: "Fale com a TI pelo canal Ajuda TI no Bitrix24." },
    ],
    completed: false,
  };

  const collaboratorOffboarding: CollaboratorViewDTO = {
    kind: "offboarding",
    company: COMPANY,
    person: { firstName: "Bruno", name: "Bruno Lima" },
    anchorDate: addDays(today, 3),
    daysUntilAnchor: 3,
    message: "Obrigado por tudo, Bruno. Separamos aqui o que falta para a sua saída ser simples. Conte com o RH no que precisar.",
    progress: { done: 1, total: 4, percent: 25 },
    stages: [
      {
        position: 2,
        name: "Antes do último dia",
        state: "current",
        activities: [
          {
            id: "o-1",
            title: "Devolver o notebook e o carregador",
            instructions: "Entregue para a TI no 2º andar até as 17h. Se estiver em casa, responda ao RH que combinamos a retirada.",
            kind: "delivery",
            dueAt: at(addDays(today, 3), "17:00"),
            status: "todo",
            mine: true,
            ownerLabel: "Você",
            links: [],
          },
          {
            id: "o-2",
            title: "Devolver o crachá",
            instructions: "",
            kind: "delivery",
            dueAt: at(addDays(today, 3), "18:00"),
            status: "done",
            mine: true,
            ownerLabel: "Você",
            links: [],
          },
          {
            id: "o-3",
            title: "Entrevista de saída",
            instructions: "",
            kind: "meeting",
            dueAt: at(addDays(today, 2), "15:00"),
            status: "todo",
            mine: false,
            ownerLabel: "RH",
            links: [],
          },
        ],
      },
      {
        position: 3,
        name: "Último dia",
        state: "upcoming",
        activities: [
          {
            id: "o-4",
            title: "Encerrar os acessos às ferramentas",
            instructions: "",
            kind: "task",
            dueAt: at(addDays(today, 3), "18:00"),
            status: "waiting",
            mine: false,
            ownerLabel: "TI",
            links: [],
          },
        ],
      },
    ],
    people: [
      { role: "gestor", name: "Rafael Prado", position: "Coordenador de atendimento" },
      { role: "rh", name: "Marina Rocha", position: "Analista de pessoas" },
    ],
    contacts: [{ label: "E-mail do RH", value: "pessoas@exemplo.com.br" }],
    faq: [
      { question: "Quando recebo os valores da rescisão?", answer: "Em até 10 dias depois do último dia, na conta cadastrada." },
      { question: "Posso guardar arquivos pessoais do notebook?", answer: "Sim. Copie até a véspera do último dia; depois a TI apaga tudo." },
    ],
    completed: false,
  };

  const scopes: ScopeCheckDTO = {
    required: { task: true, user_brief: true, crm: false, sonet_group: true },
    optional: { im: true, calendar: false, log: true },
  };

  return { today, todayDto, lines, collaboratorOnboarding, collaboratorOffboarding, scopes, company: COMPANY };
}

export type Samples = ReturnType<typeof buildSamples>;
