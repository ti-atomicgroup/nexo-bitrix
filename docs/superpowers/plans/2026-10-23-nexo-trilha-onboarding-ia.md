# Nexo — trilhas de onboarding assistidas por IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usar IA para transformar uma descrição de vaga em uma trilha de onboarding por competências que o RH revisa antes de gerar tarefas Bitrix, com etapas, materiais e progresso visíveis ao colaborador.

**Architecture:** O Nexo mantém um catálogo de atividades e competências aprovadas por RH. Um adapter de provedor compatível com a API OpenAI recebe somente a descrição e os dados do catálogo, valida a resposta estruturada e propõe uma trilha. A jornada guarda um snapshot após aprovação humana; o fluxo manual existente continua disponível sem provedor. A visão do colaborador filtra dados pela jornada e pela visibilidade já definida.

**Tech Stack:** Next.js App Router, TypeScript, React, SQLite/Drizzle, Zod, Vitest, Playwright, provedor externo compatível com Chat Completions via `fetch` no servidor.

## Global Constraints

- Usar Bitrix somente via webhooks de entrada e saída; não alterar autenticação ou escopos REST do Bitrix.
- Não enviar nome, e-mail, ID, histórico ou perfil pessoal do colaborador ao provedor; enviar a descrição profissional colada pelo RH e o catálogo aprovado.
- Não armazenar a descrição da vaga ou resposta bruta do provedor; persistir apenas a trilha editada/aprovada e sua justificativa.
- Não gerar tarefa operacional livremente: recomendações devem apontar para atividades aprovadas; lacunas exigem cadastro ou decisão manual do RH.
- RH precisa revisar e confirmar a trilha antes de qualquer criação de tarefa no Bitrix.
- IA não avalia, classifica ou pontua candidatos ou colaboradores, nem altera tarefa após início da jornada.
- Credenciais ficam como segredos de ambiente no servidor Onnira; o cliente nunca recebe a chave. Manual continua funcionando quando IA estiver desabilitada.
- Endpoint do provedor é fixado em configuração administrativa de servidor, exige HTTPS em produção e não é aceito a partir de input do usuário; limitar tamanho do prompt/resposta e timeout.
- Tratar a descrição como dado não confiável, inclusive instruções para ignorar o prompt; a saída estruturada precisa apontar IDs permitidos e passar por validação no servidor.
- Aplicar permissões por papel e visibilidade em qualquer resposta de API e tela do colaborador.
- Testes usam provedor stub e dados sintéticos; não afirmam conexão real nem usam chave externa.
- Seguir cópias simples em português, responsividade do frame Bitrix, teclado, contraste e `prefers-reduced-motion`.
- Usar Feedz apenas como inspiração conceitual para etapas, materiais e progresso; criar identidade e fluxo Nexo próprios, sem copiar telas, textos ou interações.

## File Map

- `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/server/models.ts`, `src/server/validation.ts`: competência de atividade, recomendação validada e snapshot de trilha aprovado.
- `src/server/security.ts`, `src/server/runtime.ts`, `.env.example`: configuração opcional do provedor, validação segura e adapter no servidor.
- `src/server/ai-provider.ts`, `src/server/onboarding-trail.ts`: chamada estruturada, limite de entrada, validação, correspondência com catálogo e redação de erros.
- `src/server/http.ts`, `src/app/api/ai/onboarding-trail/route.ts`, `src/lib/client.ts`: endpoint autenticado para sugerir trilha sem salvar texto bruto.
- `src/server/journeys.ts`, `src/server/workspace.ts`: congelar trilha aprovada, gerar atividades a partir do snapshot e filtrar a jornada do colaborador.
- `src/components/templates.tsx`, atividade de modelo: RH associa competências e materiais às atividades aprovadas.
- `src/components/journey-form.tsx`: inserir descrição, solicitar recomendação, revisar/editar e confirmar antes de iniciar.
- `src/components/nexo-app.tsx`, `src/components/workspace.tsx`, `src/components/journey-detail.tsx`: experiência de progresso simples para colaborador, limitada aos dados visíveis.
- `src/app/globals.css`: estados de análise, revisão, trilha por etapas e versão mobile.
- `tests/backend/ai-provider.test.ts`, `tests/backend/onboarding-trail.test.ts`, `tests/backend/journeys.test.ts`, `tests/backend/security-domain.test.ts`, `tests/client/*`, `tests/e2e/workspace.spec.ts`: cobertura de privacidade, saída inválida, aprovação e permissões.
- `docs/manual-instalacao.md`, `docs/api.md`, `docs/seguranca.md`, `README.md`: configuração de segredos opcionais, limites de dados e fallback manual.

---

### Task 1: Catalogar competências sem quebrar modelos existentes

**Interfaces:** `ActivityDefinition.competencies: string[]` opcional/default `[]`. Nova `ApprovedTrailSnapshot` inclui atividades já aprovadas, competências relacionadas, razões curtas e fonte do modelo, sem guardar a descrição. O schema aceita modelos e jornadas legados.

- [x] Adicionar testes de parsing de modelo antigo e atividade com competências.
- [x] Rodar testes de seed para confirmar o comportamento anterior aos campos.
- [x] Implementar contratos, defaults Zod e migração/backfill segura (defaults compatíveis no schema).
- [x] Adicionar campo compacto de competências no editor de atividade com exemplos.
- [x] Rodar testes focados e `npm run typecheck`.

### Task 2: Conectar o adapter de IA opcional no servidor

**Interfaces:** `NEXO_AI_BASE_URL`, `NEXO_AI_MODEL` e `NEXO_AI_API_KEY` são opcionais; qualquer um ausente desabilita o recurso com status explicável. `AiProvider.suggestTrail(input): Promise<unknown>` encapsula HTTP e nunca loga prompt, resposta ou credencial. O adapter exige JSON estruturado e limita tamanho, tempo e tentativas.

- [x] Escrever testes de indisponibilidade por falta de configuração, chamada com payload reduzido, timeout e erro do provedor.
- [x] Ler a documentação Next.js de Route Handlers em `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` antes de criar a rota.
- [x] Implementar adapter server-only via `fetch`, validação de ambiente e endpoint autenticado, com stub injetável para teste.
- [x] Validar resposta estruturada; rejeitar IDs de atividade inexistentes e saídas excessivas.
- [x] Confirmar que nenhuma descrição, resposta ou chave entra em logs, banco, analytics ou resposta de erro.
- [x] Rodar testes do adapter/API e typecheck.

### Task 3: Recomendar, revisar e aprovar a trilha

**Interfaces:** `POST /api/ai/onboarding-trail` recebe `{ description, templateId }` apenas de RH autorizado e retorna competências extraídas, recomendações existentes e lacunas. Não cria jornada nem tarefas. O submit manual recebe `approvedTrail` com IDs/valores revisados e salva snapshot validado.

- [x] Testar que o payload ao provedor não contém colaborador, conta ou identificadores do portal.
- [x] Testar tentativa de prompt injection na descrição sem permitir mudanças de escopo ou IDs fora do catálogo.
- [x] Testar que competências cobertas apontam a atividades aprovadas e lacunas não criam atividades automaticamente.
- [x] Criar fluxo guiado com botão “Montar trilha com IA”, indicação clara de análise e fallback manual quando desabilitada.
- [x] Criar tela de revisão por etapas: motivo/competência, atividade/material, prazo e responsável; permitir remover, reordenar e editar antes de iniciar.
- [x] Exigir confirmação explícita; gerar tarefas Bitrix exclusivamente do plano aprovado e idempotente.
- [x] Testar resposta inválida sem tarefas parciais/duplicadas; testar que editar modelo depois não altera jornada ativa.
- [x] Rodar testes de domínio, cliente e E2E do fluxo de sugestão.

### Task 4: Mostrar trilha, materiais e progresso ao colaborador

**Interfaces:** usuário `colaborador` visualiza somente suas próprias jornadas, atividades `employee`, materiais liberados, prazos e progresso. Atividades `hr`, justificativas, notas internas e dados de outros colaboradores nunca são retornados.

- [x] Adicionar testes de autorização para atividade interna e jornada de terceiro; snapshot interno é removido da resposta do colaborador.
- [x] Implementar a visão “Minha trilha” com fases, prazos, instruções, materiais e progresso das atividades visíveis.
- [x] Mostrar estados confirmados do Bitrix e sincronização pendente sem inferir conclusão.
- [x] Conferir navegação por teclado, layout 390px e acessibilidade automatizada existente.
- [x] Rodar testes de permissão, typecheck e E2E.

### Task 5: Documentar instalação, privacidade e validação final

- [x] Documentar as variáveis IA opcionais no manual Onnira, sem pedir chave no chat nem armazená-la em banco.
- [x] Explicar que o Nexo não guarda prompt/resposta bruta; o administrador deve verificar a política de retenção do provedor.
- [x] Documentar fallback manual, revisão humana obrigatória, lacunas de competências e conteúdo visível ao colaborador.
- [x] Rodar `npx vitest run` (64 testes), `npm run typecheck`, `npm run lint`, `npm run build` e `npm run test:e2e` (15 testes).
- [x] Inspecionar a captura sintética desktop da revisão e validar a navegação mobile em 390px.
- [x] Executar `git diff --check` e conferir que segredos e descrições não foram adicionados ao diff ou aos screenshots.
