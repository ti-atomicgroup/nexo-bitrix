# Nexo v2 — Plano de implementação (Fases 0–2)

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa a tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** construir o Nexo v2 (RH na Onnira, tarefas reais no Bitrix24, link pessoal do colaborador, inventário "tudo o que entrou, sai") até o pitch de 29/10.

**Arquitetura:**
- Um processo Next.js 16 (App Router) com SQLite embutido.
- O motor sincroniza com o Bitrix por *polling* via webhook de entrada, dentro do mesmo processo (agendado em `instrumentation.ts`).
- As telas do console são *shells* de cliente que leem a API com token Bearer. A página do colaborador `/j/[token]` é renderizada no servidor, sem JavaScript.

**Stack:** Next.js 16.4, React 19.3, TypeScript 5.9 estrito, zod 4, SQLite (`node:sqlite`; `better-sqlite3` como alternativa), lucide-react, Vitest 3, Playwright (Fase 2), fontes via @fontsource.

**Especificação:** `docs/superpowers/specs/2026-10-26-nexo-v2-design.md`.

## Restrições globais (valem para todas as tarefas)

**Leitura e organização**
- Leia `AGENTS.md`: o Next.js 16 difere do seu treino. Consulte `node_modules/next/dist/docs/` antes de usar API do Next (APIs assíncronas `params`/`searchParams`, `proxy.ts`, route handlers).
- Código, identificadores e nomes de arquivos em inglês. **Todo texto visível em pt-BR**: verbo primeiro, frases curtas, datas relativas ("amanhã", "em 7 dias"), sem jargão técnico fora de Ajustes.
- Nada de `any` sem necessidade. TypeScript estrito com `noUncheckedIndexedAccess`.
- Siga a forma dos arquivos já existentes: arquivos pequenos e focados, comentários curtos só onde explicam o porquê.

**Servidor e Bitrix**
- `src/server/**` começa com `import "server-only";`, exceto `src/server/runtime/build-info.ts`.
- Nenhuma tela chama o Bitrix. Só o motor (`src/server/engine/**`) e a instalação usam o cliente Bitrix.
- Nunca registrar ou devolver ao navegador o URL do webhook. Log em JSON no stdout, sem segredos.
- Proibido simular a integração no produto. Testes usam o FakeBitrix (`tests/fakes/`), que é infraestrutura de teste.

**Interface**
- Use os tokens de `src/app/globals.css` e CSS Modules por componente. Sem Tailwind nem bibliotecas de UI.
- Ícones lucide-react, com `strokeWidth` 2.25.
- Acessibilidade WCAG AA: rótulos reais, foco visível, alvos de 44 px, status nunca só por cor, `prefers-reduced-motion`.

**Trabalho em paralelo**
- **Não use git** (o lead faz os commits). Edite **só os arquivos da sua área**. Se precisar de algo fora dela, pare e relate.
- Antes de terminar: `npm run typecheck`, `npm run lint` e `npm test`. Corrija erros nos seus arquivos; erros de outras áreas, apenas relate.

## Mapa de arquivos e donos

| Área | Dono | Arquivos |
|---|---|---|
| Fundação (pronta) | lead | `src/shared/*`, `src/server/db/{driver,migrate,index}.ts`, `src/server/db/migrations/*`, `src/server/runtime/*`, `next.config.ts`, `package.json` |
| Repositórios | lead (Onda 0) | `src/server/db/repos/*.ts`, `tests/unit/repos/*` |
| **E1 Motor** | engenheiro 1 | `src/server/bitrix/*`, `src/server/domain/*`, `src/server/engine/*`, `src/server/seeds/*`, `tests/fakes/*`, `tests/unit/{bitrix,domain,engine}/*`, `tests/integration/*` |
| **E2 Interface** | engenheiro 2 | `src/app/(console)/**`, `src/app/instalar/**`, `src/app/entrar/**`, `src/app/page.tsx`, `src/app/dev/**`, `src/components/**` (exceto `brand/`, que é estável), `src/features/**` (exceto `diagnostics/`), `src/lib/**`, `src/app/globals.css` (só acréscimos), `public/**` |
| **E3 Plataforma** | engenheiro 3 | `src/server/security/*`, `src/server/auth/*`, `src/server/http/*`, `src/server/services/*`, `src/server/log.ts`, `src/app/api/**` (exceto `health`, `probe`), `src/app/j/[token]/**`, `src/instrumentation.ts`, `tests/api/*`, `tests/e2e/*`, `scripts/*` |

## Onda 0 — Repositórios (lead)

Funções síncronas sobre `getDb()` (de `@/server/db`), com JSON (des)serializado e linhas mapeadas para tipos em camelCase. Assinaturas congeladas (os engenheiros programam contra elas):

**Configuração**
- `settings.ts`
  - Genérico: `getSetting<T>(key, schema)`, `setSetting(key, value)`.
  - Instalação: `getSetupStage()`, `setSetupStage(stage)`, `getInstallGrant()`, `setInstallGrant({ tokenHash, expiresAt, webhook })`, `clearInstallGrant()`.
  - Conexão e empresa: `getWebhookRecord()`, `setWebhookRecord(record)`, `getCompany()`, `setCompany(company)`, `getProject()`, `setProject(project)`.
  - Padrões, conteúdo e recursos: `getDefaults()`, `setDefaults(defaults)`, `getContent()`, `setContent(content)`, `getFeatures()`, `setFeatures(features)`.
  - Sincronização: `getSyncState()`, `patchSyncState(partial)`.

**Acesso**
- `users.ts`: `createUser`, `findUserByEmail`, `findUserById`, `listUsers`, `updateUser`, `countUsers`, `recordLoginFailure`, `recordLoginSuccess`, `toAppUserDTO`.
- `sessions.ts`: `createSession`, `findSessionWithUser`, `touchSession`, `deleteSession`, `deleteUserSessions`, `purgeExpiredSessions`.

**Pessoas e trilhas**
- `people.ts`: `upsertBitrixPeople`, `createPerson`, `findPerson`, `findPersonByBitrixId`, `searchPeople`, `linkPersonToBitrix`, `toPersonDTO`.
- `templates.ts`: `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `archiveTemplate`, `countTemplates`.

**Jornadas**
- `journeys.ts`: `insertJourney`, `getJourney`, `findJourneyBySourceKey`, `findJourneyByLinkHash`, `listJourneys`, `updateJourney`.
- `activities.ts`: `insertActivities`, `listActivities`, `listActivitiesByJourneyIds`, `getActivity`, `findActivityByTaskId`, `updateActivity`, `listOpenTaskActivities`, `listActivitiesToPush`.
- `ledger.ts`: `listLedger`, `listActiveLedger`, `insertLedgerItem`, `getLedgerItem`, `findLedgerByGrant`, `updateLedgerItem`, `toLedgerItemDTO`.

**Automação**
- `triggers.ts`: `listTriggers`, `getTrigger`, `createTrigger`, `updateTrigger`, `deleteTrigger`.
- `detections.ts`: `insertDetectionIfNew`, `listDetections`, `getDetection`, `updateDetection`.

**Operação**
- `jobs.ts`: `enqueueJob`, `takeDueJobs`, `completeJob`, `failJob`, `countJobs`.
- `operations.ts`: `beginOperation`, `getOperation`, `confirmOperation`, `markOperationUncertain`, `markOperationFailed`.
- `leases.ts`: `acquireLease`, `releaseLease`.
- `audit.ts`: `audit`, `listAudit`.
- `api-log.ts`: `logBitrixCall`, `recentBitrixErrors`.

Os tipos exatos ficam no topo de cada arquivo (ex.: `ActivityRow`, `JourneyRow`). Leia-os antes de usar.

## Área E2 — Interface (engenheiro 2)

Contexto visual obrigatório:
- Direção "Linhas", com verde no lugar do preto (tokens prontos em `src/app/globals.css`) e logo Rota N em `src/components/brand/logo.tsx`.
- Metáfora: cada pessoa é uma **linha** (verde-sinal = entrada, laranja = saída) com **estações** (etapas) e o marcador amarelo "você está aqui". Hoje é um **painel de partidas** (fundo verde-floresta, horários em amarelo). O colaborador recebe um **cartão de embarque** com picote tracejado.
- Títulos em Barlow Condensed 700, interface em Barlow, números grandes condensados.
- Cantos de 4–6 px, sem sombras, bordas de 1–2 px.

### Tarefa E2.1 — Kit de UI e casca do console
**Arquivos:**
- `src/components/ui/*`: Button, Field, Select, Textarea, Checkbox, Chip, Avatar (iniciais), Panel, Tabs, Drawer, Dialog, Toast, EmptyState, Stepper, Skeleton, PageHeader. Cada um com `.module.css`.
- `src/components/lines/*`:
  - **LineTrack**: linha horizontal com estações e "você está aqui".
  - **StationList**: linha vertical.
  - **DepartureBoard**: tabela acessível em estilo painel.
  - **BoardingPass**.
  - **Pictogram**: ícone em ladrilho.
- `src/components/shell/{console-shell,top-bar}.tsx`: barra verde-floresta com logo, navegação (Hoje, Pessoas, Trilhas, Ajustes; ativo sublinhado em amarelo), botão amarelo "Nova jornada", estado da sincronização e menu do usuário. Navegação compacta em telas < 768 px.
- `src/lib/api-client.ts`:
  - **Token:** `localStorage` → `sessionStorage` → memória, cada acesso em try/catch.
  - **Funções por rota** de `src/shared/api.ts` (ex.: `api.today()`, `api.createJourney(input)`), tipadas com `src/shared/contracts.ts`.
  - **Erros:** `ApiError` com `code`/`message`; 401 limpa o token e leva a `/entrar`.
- `src/lib/use-api.ts`: hook mínimo de leitura com `data`/`error`/`loading`/`reload` e revalidação opcional por intervalo.
- `src/lib/format.ts`: datas pt-BR relativas, iniciais, plural.
- `src/app/dev/vitrine/page.tsx`: vitrine dos componentes com dados de exemplo. Retorna `notFound()` em produção.

**Aceite:**
- A vitrine mostra todos os componentes em 390 px e 1440 px, sem rolagem horizontal.
- Contraste AA.
- `npm run typecheck` e `npm run lint` limpos nos seus arquivos.

### Tarefa E2.2 — Telas de acesso: `/`, `/instalar`, `/entrar`
- **`/`** (cliente) lê `GET /api/status`:
  - `setup !== "ready"` e sem token → `/instalar`;
  - sem token → `/entrar`;
  - com token → `/hoje`.
- **`/instalar`**, 3 passos com Stepper:
  1. **Conecte seu Bitrix24.** Passo a passo de como criar o webhook de entrada (Bitrix → Aplicativos → Desenvolvedores → Outro → Webhook de entrada). Marcar os escopos obrigatórios (Tarefas, Usuários, CRM, Grupos de trabalho) e os opcionais (Notificações, Agenda, Feed). Campo para colar o URL → `api.setupConnect`. Mostra o portal, a conta dona e a lista de escopos com ✓/–. Faltando um obrigatório, explica qual marcar e bloqueia o avanço.
  2. **Crie seu acesso de RH:** nome, e-mail, senha de 10+ caracteres → `api.setupAccount({ installToken })`, que guarda o token de sessão.
  3. **Prepare o Nexo:**
     - Campos: nome da empresa, responsável padrão de TI e de RH (PersonPicker sobre `api.people`) e nome do projeto ("Nexo · Jornadas").
     - Botão "Preparar e começar" → `api.setupPrepare` → `/hoje`.
     - Explica em uma linha que cria ou reaproveita o projeto privado no Bitrix e carrega as trilhas iniciais.
- **`/entrar`:** e-mail e senha → `api.login`. Mensagem clara para bloqueio por tentativas.

### Tarefa E2.3 — Hoje (`/hoje`)
Dados de `api.today()`, com recarga a cada 30 s.
- **Cabeçalho:** data por extenso, título "Painel de hoje", contadores grandes (ações, chegando em verde, saindo em laranja).
- **DepartureBoard:** colunas Quando (amarelo, condensado), Quem, O quê (+ motivo em texto menor), Situação (chip) e Ação (botão).
- **Ações:**

  | Ação | Destino |
  |---|---|
  | `start_journey` | `/pessoas/nova?deteccao=<id>` |
  | `open_activity` | `/pessoas/<journeyId>?atividade=<id>` |
  | `nudge` / `approve` | `api.activityAction`, com toast |
  | `link_person` / `open_journey` / `resolve_sync` | página da jornada |

- **Seções:** "Linhas em andamento" (LineTrack por pessoa) e "Próximos 14 dias".
- **Estados:**
  - vazio, com convite "Nenhuma pendência hoje" e botão "Nova jornada";
  - erro de sincronização visível na barra.

### Tarefa E2.4 — Pessoas, nova jornada e jornada
- **`/pessoas`:** busca, filtros (Entradas, Saídas, Concluídas) e uma linha por pessoa (LineTrack, próxima parada, risco).
- **`/pessoas/nova`** (assistente em 3 passos):
  1. Entrada ou Saída e pessoa (PersonPicker; na entrada também "pessoa ainda sem conta no Bitrix": nome e e-mail).
  2. Trilha (cartões filtrados pelo tipo, com o perfil) e data (1º dia ou último dia). Na saída, motivo voluntário ou involuntário, com nota "não aparece para o colaborador".
  3. Participantes (gestor, buddy, TI, RH, com padrões de `api.settings`) e resumo de `api.journeyPreview` ("14 atividades em 45 dias: TI 5, Gestor 4…").

  "Iniciar jornada" → `api.createJourney` com `requestId` (UUID gerado uma vez) → página da jornada. `?deteccao=<id>` pré-preenche a partir de `api.detection(id)`.
- **`/pessoas/[id]`:**
  - **Cabeçalho:** pessoa, tipo, data, contagem regressiva, progresso, ações (Pausar/Retomar, Cancelar com motivo, Concluir com bloqueios de `completion`).
  - **Linha por etapas** com as atividades (responsável, prazo relativo, situação, sincronização).
  - **Drawer da atividade** (abre também via `?atividade=`):
    - instruções e checklist (`toggle_item`);
    - links e "Abrir no Bitrix" (nova aba);
    - "Marcar como feita", "Aprovar" (status 4), "Cobrar".
  - **Abas:**
    - Acessos e equipamentos: lista do inventário, adicionar item manual, dispensar com motivo.
    - Link do colaborador: criar ou revogar; copiar; WhatsApp (`https://wa.me/?text=`); e-mail (`mailto:`); prévia usando o componente da página do colaborador.
    - Histórico.
  - Pessoa sem conta Bitrix: aviso com "Vincular conta" (PersonPicker → `api.linkPerson`).

### Tarefa E2.5 — Trilhas e Ajustes (Fase 2)
- **`/trilhas`:** galeria por tipo (verde/laranja) e perfil, com etapas e duração ("de 5 dias antes a 90 dias depois").
- **`/trilhas/[id]`** e **`/trilhas/nova`** (editor em formulário, sem arrastar):
  - Etapas com "Quando libera" (no início, X dias antes/depois, após a etapa anterior).
  - Atividades com: título, quem faz, prazo ("3 dias úteis antes do 1º dia"), obrigatória, visível ao colaborador, exige aprovação, tipo, instruções, checklist (cada item marcável como Acesso ou Equipamento, com nome) e links.
  - Biblioteca `api.library()` para inserir atividades prontas.
  - Validação com `templateInput`.
- **`/ajustes`**, seções:
  - Conexão Bitrix: portal, conta, escopos, trocar webhook.
  - Automações: gatilhos de CRM com `api.crmSources`, para escolher funil, etapa, trilha e campos.
  - Equipe: responsáveis padrão e usuários do Nexo.
  - Conteúdo do colaborador: boas-vindas, agradecimento, contatos, FAQ de entrada e de saída.
  - Recursos opcionais: notificações, agenda, Feed.
  - Diagnóstico e Registro de atividades.

### Tarefa E2.6 — Componente da página do colaborador
`src/features/collaborator/collaborator-page.tsx` recebe `CollaboratorViewDTO` e o token.
- **Componente de servidor**, sem `"use client"` e com CSS inline via `<style>`, para funcionar mesmo se `/_next/*` estiver bloqueado.
- **Entrada:** BoardingPass (nome, embarque, empresa, gestor, buddy, contagem regressiva) e StationList com "você está aqui".
  - Atividades `mine`: formulário POST para `/j/<token>/feito` com `activityId` e botão "Marcar como feita".
  - Outras atividades: "o que vai acontecer" (ex.: "TI está preparando seu acesso").
  - Depois: materiais (links), pessoas, contatos e FAQ.
- **Saída:** cabeçalho laranja respeitoso ("Obrigado por fazer parte"), o que devolver e quando, contatos e FAQ. Nunca o motivo do desligamento.
- **Mobile-first:** 360 px sem rolagem horizontal.

## Área E1 — Motor (engenheiro 1)

Briefing detalhado no prompt do agente: cliente Bitrix, domínio, motor e seeds. Contratos:

- **`src/server/bitrix/webhook-url.ts`**
  - `parseWebhookUrl(url)` → `{ portal, userId, secret }`.
  - Valida https, sem IP privado ou localhost, caminho `/rest/<id>/<segredo>/`, sem query.
  - Erros `AppError` com mensagem pt-BR.
- **`src/server/bitrix/client.ts`**
  - `createBitrixClient({ credentials: () => { portal; userId; secret } | null, transport?, sleep?, now? })` → `{ call, list, batch }`.
  - Limitador e *backoff* compartilhados em `globalThis[Symbol.for("nexo.bitrix.limiter")]`.
  - Erros classificados em `BitrixError`: `retryable`, `uncertain`, `code`.
  - Cada chamada vai para `logBitrixCall`, sem URL.
- **`src/server/bitrix/methods.ts`**: wrappers tipados.
  - Conexão e pessoas: `checkWebhook`, `listUsers`.
  - Projeto: `findGroupByName`, `createPrivateProject`.
  - Tarefas: `createTask`, `listTasksByIds`, `listTasksCreatedSince`, `completeTask`, `renewTask`, `approveTask`, `addTaskComment`.
  - Checklists: `addChecklistItems`, `getChecklists` (via batch), `toggleChecklistItem`.
  - CRM: `listCrmSources`, `listStageHistory`, `getCrmItem`.
  - Extras: `notifyUser`, `createMeeting`, `postToFeed`.
- **`src/server/domain/*`** (funções puras, TDD):
  - `dueAt(anchorDate, offsetDays, unit, time, timezone)` → ISO com fuso (`2026-10-27T18:00:00-03:00`);
  - `stageReleaseAt`;
  - `computeActivities(template, anchorDate, participants, timezone)`;
  - `stagesState`;
  - `completionCheck(activities, ledger)`;
  - `journeyRisk`;
  - `taskTitle` e `taskDescription` (BBCode);
  - transições do inventário.
- **`src/server/engine/*`**
  - Funções:
    - `startScheduler()`, `kick()`, `runCycle()`;
    - `createJourney(input, actor)`, `previewJourney(input)`;
    - `applyJourneyAction`, `applyActivityAction`;
    - `prepareWorkspace(input)`, usado pela instalação: procura ou cria o projeto, carrega as trilhas iniciais e define os padrões;
    - `refreshPeople()`.
  - Ciclo e operação: os passos do ciclo da especificação; jobs com idempotência (`operations`) e reenvio após ~2 min (no máximo 3).
- **`src/server/seeds/*`**
  - `starterTemplates()`: Onboarding Geral, Onboarding Vendas, Onboarding Tecnologia, Desligamento voluntário, Desligamento involuntário. Usa o SOP de TI e o processo de saída do Nexo antigo, generalizados e sem nomes ou telefones reais.
  - `activityLibrary()`.
- **`tests/fakes/fake-bitrix.ts`**: portal em memória com formatos reais (camelCase, `next`, `result_error`) e falhas injetáveis (`limit`, `timeout`, `commitThenTimeout`).

## Área E3 — Plataforma e API (engenheiro 3)

Briefing detalhado no prompt do agente:
- `security` (AES-256-GCM com chave em arquivo `0600`, scrypt, tokens);
- `auth` (sessões Bearer deslizantes de 12 h, máximo de 7 dias, limite de tentativas, papéis);
- `http` (wrapper: autenticação → zod → serviço → DTO, erros pt-BR, id de requisição);
- `services`:
  - instalação: connect → account → prepare;
  - ajustes, usuários, diagnóstico;
  - leitura: `buildToday`, `buildJourneyDTO`, `buildJourneySummary`;
  - colaborador: `loadCollaboratorView(token)` e `markDoneFromLink(token, activityId)`;
- todas as rotas de `src/shared/api.ts`;
- `/j/[token]/page.tsx` e `/j/[token]/feito/route.ts`;
- `instrumentation.ts` chamando `startScheduler()`;
- testes de API e harness e2e (Fase 2).

## Portões

- **G1:** jornada manual → tarefas reais no `helpbr24` → concluir no Bitrix → "feita" no Nexo em até 2 min. Dados persistem após reinício. typecheck, lint, test e build verdes.
- **G2:** roteiro do pitch de ponta a ponta na Onnira; e2e e axe verdes; tag `v0.9-pitch`.
