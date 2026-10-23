# Guia facilitado de instalação Onnira — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajudar a pessoa administradora a configurar com segurança as quatro variáveis iniciais da aplicação Nexo hospedada na Onnira.

**Architecture:** A tela de bloqueio já consome `PublicStatus.missingEnvironment`. Expandir esse estado visual com instruções fixas, orientações contextuais e uma ação de copiar comando; não adicionar endpoint nem persistência de segredos. Atualizar o manual para refletir a mesma sequência.

**Tech Stack:** Next.js App Router, React, TypeScript, lucide-react, CSS existente, Playwright.

## Global Constraints

- Segredos de ambiente são configurados no serviço Onnira e nunca enviados ao cliente.
- Não inferir a URL canônica da aplicação a partir de cabeçalhos HTTP.
- Gerar os segredos no computador do administrador e mantê-los fora do Git e do chat.
- Preservar o fluxo de conexão webhook Bitrix existente.

---

### Task 1: Explicar e validar os pré-requisitos no bloqueio inicial

**Files:**
- Modify: `src/components/setup-screen.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/workspace.spec.ts`

- [ ] Ampliar o teste E2E da instalação para verificar instruções, nomes das quatro variáveis, comando e botão de cópia.
- [ ] Executar o teste para confirmar que falha porque o guia e o botão ainda não existem.
- [ ] Implementar passos numerados, origem de cada valor, comando copiável para geração local dos segredos e texto de reinício/validação; nunca colocar campos de segredo nessa tela.
- [ ] Mostrar os erros de configuração retornados pela validação sem marcá-los como configuração concluída.
- [ ] Executar o teste de instalação e revisar a tela em viewport desktop e móvel.

### Task 2: Alinhar o manual à experiência

**Files:**
- Modify: `docs/manual-instalacao.md`

- [ ] Reescrever o início do manual em passos correspondentes à tela: publicar, copiar URL pública, adicionar variáveis, gerar segredos localmente, persistência/reinício, retornar e conectar webhook.
- [ ] Revisar os comandos PowerShell para que não peçam segredos no chat e preservem todos os requisitos atuais de publicação.
- [ ] Executar `npm run lint`, `npm run typecheck`, `npm run test:e2e` e `npm run build`.
