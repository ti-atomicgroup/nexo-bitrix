> Especificação aprovada pelo usuário em 26/10/2026 (modo plano). Fonte única de verdade do Nexo v2; mudanças de escopo devem atualizar este arquivo.

# Nexo — produto novo de onboarding e offboarding (Bitrix24 + Onnira)

## Contexto

**O desafio**
- Desafio Vibecode Br24, card 11/15. Pitch de 5 min em **29/10 (qui)**; entrega definitiva **03/11**. Hoje é 26/10 (seg).
- **O card pede:**
  - modelos com etapas e checklists configuráveis;
  - tarefas automáticas para RH, gestores, TI e demais;
  - documentos e orientações;
  - progresso com pendências, prazos e responsáveis;
  - desligamento com devolução de equipamentos, encerramento de atividades e revogação de acessos.
- **O guia exige:**
  - Next.js + Node; SQLite em `./data`; API REST do Bitrix sem IDs fixos.
  - Cache e sincronização; assistente inicial; permissões respeitadas.
  - Tokens protegidos e escopos mínimos.
  - pt-BR responsivo, mensagens claras e logs.
  - Hospedagem na Onnira; integração real (proibido simular ou ter token no código).
- **Banca:** apresentação 30%, tecnologias 25%, facilidade 15%, instalação/segurança 15%, criatividade 15%.

**Por que um produto novo**
- O Nexo atual (branch `feat/nexo-workflows-kanban`, feito com Codex) criou tarefas reais no portal de teste `helpbr24`. Mas:
  - nunca abriu na Onnira (iframe em branco; causa provável: worker `tsx` caindo e derrubando o servidor);
  - não tem experiência real para o colaborador;
  - a UI é genérica, com texto de 8–12px;
  - consulta o Bitrix a cada tela (risco de `QUERY_LIMIT`);
  - tem bagagem legada (OAuth, processo de aprovação, API de chat).

**Restrições confirmadas da Onnira (26/10)**
- A borda devolve **403 "Acesso permitido somente dentro da Onnira"** para tudo que vem de fora do painel. `frame-ancestors` aceita só `app.onnira.com(.br)`.
- O app roda em iframe cross-site, com restrição a cookies de terceiros.
- Volume persistente em `/app/.data`; 512 MB de RAM; sem tela de variáveis de ambiente.
- Deploy via repositório GitHub público (`npm ci` / `build` / `start`); a versão do Node é desconhecida.
- API pública (`public-api.onnira.com/v1`) com status e logs de deploy, usando chave do usuário.
- **Consequências:**
  - todo o Bitrix funciona por *polling* via webhook de entrada;
  - o link do colaborador só abre fora da Onnira se ela liberar acesso público a `/j/*`.

**Decisões do usuário (26/10)**
- **Produto:** novo, reaproveitando o motor Bitrix.
- **Design:** direção visual "Linhas", com **verde no lugar do preto** e logo **Rota N**.
- **Colaborador:** acompanha por **link pessoal** enviado por WhatsApp ou e-mail.
- **Extras:** notificações (im), agenda (calendar), Feed (log) e IA para trilhas, esta depois do essencial e com provedor a decidir.
- **Skills:** ui-ux-pro-max e ui-ux-designer.

## Produto

**Promessa:** "Cada chegada bem-recebida. Cada saída sem pendência."

1. **RH no comando (Nexo, no painel da Onnira):**
   - Hoje mostra o que fazer agora, com o motivo e uma ação por linha.
   - Pessoas mostra as jornadas como linhas; Trilhas guarda os modelos; Ajustes guarda a configuração.
2. **Todo mundo trabalha no Bitrix:**
   - Cada atividade liberada vira tarefa real no projeto privado "Nexo · Jornadas", com responsável, prazo, checklist, descrição e vínculo ao CRM.
   - O gestor entra como observador em todas as tarefas da jornada da pessoa dele.
   - Gestor, TI e buddy não precisam abrir o Nexo.
3. **Colaborador acolhido:**
   - `/j/<token>`, mobile-first e sem senha.
   - Na entrada: cartão de embarque, linha com estações, "marcar como feito", materiais, pessoas e FAQ.
   - Na saída: tom respeitoso, com o que devolver, datas, benefícios e contatos.
   - O RH envia por WhatsApp (`wa.me`), e-mail (`mailto`), copiando o link ou por notificação no Bitrix.

**Diferencial-assinatura: "Tudo o que entrou, sai."**
- O inventário de acessos e equipamentos por pessoa segue os estados: planejado → ativo → devolução pedida → encerrado (ou dispensado, com motivo).
- Itens de checklist marcados como *acesso* ou *equipamento* no onboarding alimentam o inventário. Também aceita entradas manuais, para quem entrou antes do Nexo.
- O desligamento cria **uma** tarefa para a TI, "Revogar e recolher", cujo checklist é exatamente o que está ativo.
- Só o inventário pendente bloqueia a conclusão da jornada.

**Automação "Detectado no Bitrix":**
- O RH escolhe o funil ou processo inteligente e a etapa (ex.: "Contratado").
- O Nexo lê `crm.stagehistory.list` a cada minuto e mostra em Hoje: "Ana Souza foi contratada → Iniciar jornada", com o assistente já preenchido.

**Extras** (ligam sozinhos conforme os escopos do webhook):
- notificações e envio do link (im);
- 1:1 e entrevista de saída como evento de agenda (calendar);
- boas-vindas no Feed no 1º dia (log);
- IA para montar trilhas na Fase 4, com conector genérico compatível com OpenAI e Anthropic e chave cifrada em Ajustes.

## Experiência e telas

**Direção "Linhas"** (mockup v3, com verde no lugar do preto)
- **Metáfora visual:** cada pessoa percorre uma **linha** (verde-sinal = entrada, laranja = saída) com **estações** (etapas) e "você está aqui". Hoje é um **painel de partidas**; o colaborador recebe um **cartão de embarque**. Os rótulos continuam simples (etapa, atividade).
- **Cores:**
  - estrutura em verde-floresta `#0B3B2C` (barra superior, painel, botões, pictogramas);
  - texto em verde-tinta `#0E2A21`, fundo `#EEF3EF` e branco;
  - entradas `#00A651` (e `#00843D` com texto branco), saídas `#FF6A13`;
  - ação e atenção em amarelo `#FFD200`, atraso em `#D7261E`, links em `#0066CC`.
- **Tipografia:** Barlow Condensed (títulos, números, painel), Barlow (interface) e Archivo Black (logotipo), todas via `@fontsource`. Corpo de 16px; nada abaixo de 13px.
- **Logo Rota N:** o "N" desenhado como trajeto verde, com partida branca e destino amarelo, mais "nexo". Fornece favicon, ícone e marca do Marketplace em `public/`.
- **Forma:**
  - cantos de 4–6px, sem sombras, bordas de 1–2px;
  - linhas de 6px com estações circulares;
  - pictogramas lucide em ladrilho verde-floresta;
  - picote no cartão de embarque.
- **Acessibilidade:** WCAG AA, foco visível amarelo sobre verde, alvos de 44px, status nunca só por cor, `prefers-reduced-motion`.
- **Texto:** verbo primeiro e datas relativas. Sem jargão fora de Ajustes. Avatares por iniciais (a CSP bloqueia imagens externas).

**Rotas** (código em inglês, UI em português):

| Rota | Conteúdo |
|---|---|
| `/instalar` | 1) Colar o webhook (passo a passo com os escopos marcados). 2) Criar o acesso de RH. 3) "Preparar o Nexo" em 1 clique: procura ou cria o projeto, carrega as trilhas iniciais, define responsáveis padrão |
| `/entrar` | Login |
| `/hoje` | Painel de partidas (quando, quem, o quê, situação, ação): detecções do Bitrix, dados faltando, erros, atividades do RH atrasadas ou de hoje, riscos críticos com "Cobrar". Contadores (ações, chegando, saindo) e "Linhas em andamento" |
| `/pessoas` | Mapa das linhas com "você está aqui" e próxima parada. Busca |
| `/pessoas/nova` | Quem (usuário Bitrix ou pessoa sem conta) → trilha e data → participantes (gestor, buddy, TI, RH). Resumo: "14 atividades em 45 dias" |
| `/pessoas/[id]` | Linha por etapas com gaveta da atividade: instruções, checklist, links, abrir no Bitrix, aprovar (status 4), cobrar. Abas: Acessos e equipamentos, Link do colaborador (com prévia como componente), Histórico. Pausar, cancelar e concluir |
| `/trilhas`, `/trilhas/[id]` | Galeria por tipo e perfil. Editor em formulário: etapas, quando libera, quem faz, prazo em dias úteis ou corridos, obrigatória, visível ao colaborador, checklist com marcação de inventário, links, tipo reunião. Biblioteca de atividades prontas (só leitura) |
| `/ajustes` | Conexão Bitrix, gatilhos, equipe e responsáveis padrão, conteúdo do colaborador (boas-vindas, FAQ, contatos), Diagnóstico (último ciclo, fila, último erro, limite, driver, versão), registro de atividades |
| `/j/[token]` | Renderizada no servidor, **sem JavaScript**: CSS inline e formulário POST em `/j/[token]/feito`. Assim a Onnira só precisa liberar `/j/*` |

## Arquitetura

**Processo e inicialização**
- Um único processo Node: Next.js 16 (App Router), React 19, TypeScript estrito.
- `start`: `node --disable-warning=ExperimentalWarning node_modules/next/dist/bin/next start -H 0.0.0.0`.
- Sem worker separado e sem variáveis obrigatórias.
- `next.config.ts`:
  - `typescript.ignoreBuildErrors: true`, com `tsc` como portão separado, porque a RAM de 512 MB é curta;
  - dependências de build em `dependencies`.

**Banco**
- **Um único driver**, escolhido pela sonda:
  - `node:sqlite` via `process.getBuiltinModule('node:sqlite')` se o Node for ≥ 22.13;
  - senão `better-sqlite3` como dependência normal, se `npm ci` funcionar lá.
- Envoltório fino:
  - cache de *statements*;
  - `tx(fn)` com `BEGIN IMMEDIATE`, que rejeita função assíncrona;
  - WAL com conferência do modo efetivo (cai para DELETE se preciso);
  - conexão única e preguiçosa, em `globalThis[Symbol.for('nexo.db')]`;
  - nunca abre o banco na importação, porque o build pré-renderiza.
- **Pasta de dados:** `NEXO_DATA_DIR` → `/app/.data` (se gravável) → `./data`. A documentação explica que `./data` corresponde ao volume na Onnira. **Sem symlink.**
- **Tabelas tipadas:**
  - Configuração e acesso: `settings`, `app_users`, `sessions`.
  - Pessoas e modelos: `people`, `templates`, `template_stages`, `template_activities`.
  - Jornadas: `journeys` (*snapshot* do modelo, `source_key` único, `link_token_hash`), `journey_activities`, `ledger_items`.
  - Automação: `triggers`, `detections`.
  - Operação: `jobs`, `leases`, `operations` (diário de idempotência), `audit_log`, `api_log` (com teto).
- **Migrações** versionadas em `src/server/db/migrations/`.

**Motor**
- `instrumentation.ts` → `register()`:
  - envolvido em try/catch, sem chamar o Bitrix;
  - agenda o laço com `setTimeout(...).unref()`;
  - singletons (banco, limitador, agendador, `kick()`) em `globalThis[Symbol.for('nexo.*')]`, para que cópias do módulo não dupliquem a taxa;
  - desligado em `next dev` salvo `NEXO_SCHEDULER=1`.
- **Escritor único:** toda mudança no Bitrix vira *job*. As rotas só enfileiram e chamam `kick()`.
- **Robustez do ciclo:**
  - uma linha de *lease*, que expira após 3 ciclos;
  - `finally` reagenda o próximo ciclo;
  - um *watchdog* religa o laço a partir das requisições;
  - "último ciclo" aparece no Diagnóstico.
- **Ciclo** (60 s):
  1. Libera as etapas vencidas ou cuja anterior concluiu.
  2. Envia os jobs pendentes.
  3. Consulta as tarefas abertas **por lista de IDs**: `filter.ID[]`, 50 por página, com `select`. Detecta exclusão e mudança de projeto, sem cursor de data.
  4. Lê os checklists via `batch` a cada 3–5 min para as tarefas abertas, e sempre que uma tarefa fecha.
  5. Lê os gatilhos de CRM.
  6. Atualiza o cache de pessoas: sob demanda e uma vez por dia.
- **As telas leem só o SQLite.**

**Login no iframe**
- Token Bearer guardado no armazenamento do navegador: `localStorage` → `sessionStorage` → memória, cada um com try/catch.
- Sem cookie, logo sem CSRF.
- As páginas do console são só *shells* no cliente. O SQLite só é lido em `app/api/**` e `app/j/**`, sem Server Actions, e `import 'server-only'` vale em todo `src/server/**`.
- Downloads usam URL assinada de curta duração.
- Sessão deslizante de 12 h (máximo de 7 dias); senha com scrypt e limite de tentativas.
- Papéis: admin e rh.

**Robustez de página**
- `global-error.tsx` e `error.tsx` em pt-BR.
- `/api/health` não toca o banco: versão, build e Node.
- A sonda testa `Referrer-Policy` `no-referrer` contra `same-origin` (hipótese: a borda da Onnira bloqueia o JS sem Referer).

## Integração Bitrix

- **Portado do Nexo antigo:**
  - transporte POST JSON com timeout de 20 s e sem redirect;
  - parser e cifra do webhook (`src/server/security.ts` antigo);
  - classificação de erros, paginação e descoberta de funis e etapas (`src/server/bitrix.ts` antigo);
  - prazos em dias úteis (`src/server/domain.ts` antigo).
  - Lidos via `git show feat/nexo-workflows-kanban:<arquivo>`.
- **Limitador e lotes:**
  - limitador compartilhado de ~2 req/s;
  - *backoff* em `QUERY_LIMIT_EXCEEDED`, `OPERATION_TIME_LIMIT`, 429 e 503;
  - `batch` com até 50 comandos, tratando `result_error`.
- **Tarefas:**
  - título "Ana Souza · Onboarding — Criar conta Google Workspace";
  - descrição BBCode com contexto, instruções, links e "gerenciado pelo Nexo";
  - `XML_ID=nexo:<atividade>`, `GROUP_ID` do projeto, `AUDITORS` = RH + gestor, `UF_CRM_TASK` = item de origem;
  - `DEADLINE` no formato `2026-10-27T18:00:00-03:00`;
  - **`TASK_CONTROL=N` por padrão**; o status 4 aparece como "aguardando aprovação", com o botão `tasks.task.approve`;
  - checklist com item raiz e filhos via `PARENT_ID`.
- **Idempotência:**
  - se a resposta for incerta, lista o projeto por `GROUP_ID` + `>=CREATED_DATE` e compara `xmlId` no código;
  - se não achar, reenvia após ~2 min, no máximo 3 vezes;
  - depois disso, vira um cartão em Hoje.
- **"Concluída" = status do Bitrix.** Tarefa apagada no Bitrix é sinalizada e nunca recriada.
- **Gatilhos:**
  - lead usa `STATUS_ID` (sem categoria);
  - etapas de negócio com prefixo do funil (`C3:WON`); processo inteligente em `DT{tipo}_{cat}:…`;
  - `TYPE_ID=1` também conta;
  - o cursor começa no maior ID atual (sem reprocessar histórico) e há uma detecção por (gatilho, registro).
- **Ações do RH:**
  - **"Cobrar"** = comentário na tarefa citando o responsável (`task.commentitem.add`, escopo task), com `im` como alternativa.
  - **"Preparar"** procura o projeto pelo nome antes de `sonet_group.create`.
- **Escopos:**
  - obrigatórios: `task`, `user_brief` (ou `user`), `crm`, `sonet_group`;
  - opcionais: `im`, `calendar`, `log`;
  - a tabela método → escopo → motivo fica na documentação;
  - recomendação: uma conta Bitrix dedicada e não-admin para o webhook.

## Segurança, LGPD e logs

**Segredos e cabeçalhos**
- Webhook cifrado com AES-256-GCM, chave em arquivo `0600` na pasta de dados.
- A documentação admite com honestidade que a chave fica no mesmo volume do banco.
- O webhook nunca volta ao navegador, só mascarado; o validador exige https, sem IP privado e caminho `/rest/<id>/<segredo>/`.
- CSP:
  - `frame-ancestors 'self' https://app.onnira.com https://app.onnira.com.br`;
  - `connect-src 'self'`, `img-src 'self' data:`;
  - sem `dangerouslySetInnerHTML`.
- Instalação só enquanto não existe admin, presa à aba que validou o webhook.

**Link do colaborador**
- Token de 256 bits guardado só como hash.
- Token inválido ou revogado responde 404; expira 30 dias após o fim da jornada.
- Só POST altera algo; limite por hash do token.
- Cabeçalhos `noindex`, `no-referrer` e `no-store`.
- Mostra só atividades visíveis ao colaborador e nunca o tipo ou motivo do desligamento.

**LGPD**
- Inventário de dados e mínimo necessário (sem CPF ou RG).
- Retenção definida, com expurgo quando o link expira; exportar e apagar pessoa (Fase 4).

**Logs**
- JSON no stdout, com id da requisição e nome do método Bitrix, nunca o URL.
- Registro de atividades visível em Ajustes.

## Estrutura do repositório (nesta worktree, substituindo o código antigo)

```
src/instrumentation.ts                   register() protegido → server/engine/boot
src/shared/      enums, contracts (DTOs), schemas (zod), api (rota → req/res)   ← congelado na Fase 0
src/server/db/   driver, migrate, migrations/001_init.sql, repos/*
src/server/security/  crypto, webhook-url, session, rate-limit
src/server/bitrix/    transport, limiter, client (call/list/batch), methods, dates
src/server/domain/    deadlines, release, completion, ledger, task-text   (puros, TDD)
src/server/engine/    boot, scheduler, tick, operations, jobs, steps/*
src/server/services/  install, journeys, today, templates, collaborator, settings, diagnostics
src/server/http.ts  log.ts  seeds/*
src/app/api/**/route.ts                  auth → zod → service → DTO
src/app/(console)/{hoje,pessoas,trilhas,ajustes}  src/app/{instalar,entrar}  (shells no cliente)
src/app/j/[token]/page.tsx + feito/route.ts
src/components/ui/*  src/features/<área>/*  src/lib/{api-client,format}.ts
tests/fakes/fake-bitrix.ts  tests/{unit,integration,api,e2e}/  scripts/{bitrix-smoke.mjs,seed-local.ts,onnira.mjs}
docs/  README (avaliar em 5 min), instalacao, seguranca-lgpd, escopos, homologacao, pitch, marketplace, onnira-probe
```

- `scripts/seed-local.ts` preenche um SQLite local, para a UI ter dados antes do motor existir, sem "modo mock" no produto.
- `.gitignore` cobre `.data/`, `data/` e os arquivos `Historico_conversa_*`.

## Fases, tarefas e portões

**Como vamos trabalhar**
- Branch `claude/onboarding-offboarding-project-f23302`.
- **Primeiro passo:** gravar a especificação, espelhando este plano, em `docs/superpowers/specs/2026-10-26-nexo-v2-design.md` e o plano detalhado (skill writing-plans) em `docs/superpowers/plans/`. Fazer commit. A aprovação deste plano vale como revisão da especificação.
- **Execução:** subagent-driven-development com 3 engenheiros e arquivos disjuntos:
  - **E1 (motor):** `server/{bitrix,domain,engine}`, `tests/{fakes,unit,integration}`.
  - **E2 (interface):** `app/(console)`, `app/{instalar,entrar}`, `app/j/**/page.tsx`, `components`, `features`, `lib`, CSS.
  - **E3 (plataforma):** `server/{db,security,services}`, `http.ts`, `log.ts`, `app/api`, `app/j/**/route.ts`, `instrumentation.ts`, configs, `tests/{api,e2e}`.
  - Mudanças em `shared/*` só por adição, feitas por mim.
- **Disciplina:** TDD na regra de negócio. Revisão de código e verification-before-completion antes de cada portão.
- **Publicação:** eu faço os commits locais. Push e republicação ficam com você; eu faço o push se você autorizar na hora. Opcional: uma chave de API Onnira num arquivo local fora do Git, para `scripts/onnira.mjs` ler status e logs.

| Quando | Tarefa | Quem |
|---|---|---|
| **Seg, noite** | P1 **Sonda Onnira**: esqueleto publicável com `/diagnostico` (Node, sqlite, memória, pasta gravável, contador de boot, cabeçalhos recebidos, Referer, armazenamento, popup, área de transferência, download, `mailto`/`wa.me` no iframe, `/j/teste`) | E3 |
| | P2 Congelar `shared/*` e `001_init.sql` | eu + E1 |
| | P3 Smoke no portal real das incógnitas (`XML_ID`, filtro `ID[]`, `PARENT_ID`, `DEADLINE`, status 4, stagehistory, nome do projeto, comentário). **Peço sua autorização antes de criar algo no `helpbr24`. Você cola o webhook só no instalador local (nunca no chat); o smoke usa a mesma configuração cifrada** | E1 |
| | P4 Tokens de design, fontes, logo, *shell*, kit de UI | E2 |
| **G0** | Driver escolhido, `docs/onnira-probe.md` preenchido, contratos congelados | |
| **Ter** | T1 Cliente Bitrix + FakeBitrix · T2 Motor (operações, liberação, criação, consulta por IDs, jobs, agendador) | E1 |
| | T3 Banco, repositórios, http, log, autenticação, cabeçalhos · T4 APIs (instalar e preparar, login, pessoas, jornadas, hoje, sincronizar agora) | E3 |
| | T5 Telas: instalar, entrar, hoje, pessoas, nova jornada, jornada | E2 |
| **G1** | Na Onnira: jornada → tarefas com checklist no `helpbr24` → conclusão no Bitrix → "feito" no Nexo em até 2 min. Dados sobrevivem a reinício. typecheck, lint, test e build verdes | |
| **Qua** | W1 Inventário, desligamento e bloqueio de conclusão · W2 Detecção CRM → Hoje → assistente preenchido · W7 Docs, CI (GitHub Actions) e capturas | E1 |
| | W3 Token e página `/j` com POST, envio do link · W4 APIs de Ajustes · W6 e2e + axe em 390 e 1440 px | E3 |
| | W5 Abas da jornada, Trilhas (galeria + editor), Ajustes, visual do `/j` | E2 |
| | W8 Extras, se o G1 passar no horário (primeiro a cortar), nesta ordem: envio do link por notificação (im); upload de materiais (até 10 MB, gravado em disco por *stream* e baixado via token); 1:1 na agenda (calendar); boas-vindas no Feed (log) | E1/E3 |
| **G2** | O roteiro do pitch roda de ponta a ponta na Onnira com `helpbr24`; tag `v0.9-pitch` | |
| **Qui, manhã** | Republicar e conferir. Dados fictícios no portal (com sua autorização). `docs/pitch.md` mapeado aos critérios. Plano B: local + vídeo curto | |
| **Até 03/11** | Ajustes pedidos pela banca; IA para trilhas; extras que ficarem; upload de arquivos; feriados; início automático por gatilho; recuperação de senha; materiais do Marketplace (descrição de até 280 caracteres, descrição completa, instalação, suporte, segurança, 5 imagens) | |

**Fora da quinta (Fase 4):**
- `better-sqlite3` como reserva, se a sonda não exigir;
- symlink, cursor `CHANGED_DATE` e varredura de exclusões;
- upload de arquivos, só se o W8 não alcançar (na quinta os materiais podem ser só links);
- IA, arrastar e soltar, reatribuição e "dúvidas" interativas (o FAQ estático fica).

## Verificação

**Os 10 testes que importam (Vitest)**
1. Prazos: dias úteis e corridos, *offset* negativo, 18:00 local com fuso.
2. Liberação e conclusão: inventário ativo bloqueia e a dispensa exige motivo.
3. Criação idempotente: Bitrix grava e dá timeout, sem duplicar; não encontrado → exatamente um reenvio; 4xx limpo.
4. Ciclo completo contra o FakeBitrix: jornada → tarefas (`GROUP_ID`, observadores, prazo, raiz do checklist) → fechar no fake → libera a próxima etapa. Um passo que falha não derruba `/api/health` nem o laço.
5. Consulta por IDs: tarefa apagada é sinalizada sem ser recriada; status 4 aparece como aguardando aprovação.
6. Cliente Bitrix: *backoff* nos limites; limitador único mesmo com duas cópias do módulo; `result_error`; paginação.
7. Gatilhos: cursor no maior ID, uma detecção por registro, lead via `STATUS_ID`.
8. Inventário de rotas: toda `app/api/**` sem token responde 401, salvo uma lista de exceções; matriz de papéis; o segredo do webhook nunca aparece em resposta ou log.
9. Link do colaborador: só o hash é guardado; 404 quando revogado ou expirado; só atividades visíveis; só POST altera; cabeçalhos e limite.
10. **Playwright no build de produção** contra `tests/e2e/fake-bitrix-server.ts` (`node:http`, rotas `/__fake/*`), pré-carregado com `--import` para redirecionar `e2e.bitrix24.com.br`, sem gancho de teste no produto:
    - fluxos: instalar → jornada → sincronizar → fechar no fake → progresso; desligamento gera a lista de revogação;
    - axe e larguras de 390 e 1440 px;
    - página de iframe provando login sem cookie.

**Portal real e Onnira**
- `npm run bitrix:smoke` lê o webhook só do ambiente local, mais o roteiro em `docs/homologacao.md`.
- Onnira, conferindo:
  - o app abre no painel;
  - reiniciar e republicar mantém os dados;
  - `/j/<token>` anônimo dá 403 até a Onnira liberar e abre quando há login na Onnira.

**Antes de cada portão:** `npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build`.

## Riscos

- **Link fora da Onnira (403):**
  - Abra hoje o pedido ao suporte da Onnira para acesso público a `/j/*`; a página já não precisa de `/_next`.
  - No pitch, abrir logado na Onnira.
  - Plano B: tarefa e notificação no Bitrix para quem tem conta.
- **Página em branco na Onnira:** a sonda vem antes de tudo. O processo é único, nada derruba o servidor, há `global-error` e o teste de `Referrer-Policy`.
- **Driver SQLite e memória:** a sonda decide; o build sem checagem de tipos economiza RAM.
- **Limite do Bitrix:** consulta por IDs, `batch`, limitador global e telas que nunca chamam a API.
- **Prazo:** portões G0, G1 e G2. Os extras (W8) são o primeiro corte; a IA fica para 03/11.
