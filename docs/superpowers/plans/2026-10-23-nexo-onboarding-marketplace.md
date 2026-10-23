# Nexo na Onnira Cloud e instalação pelo Marketplace — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer cada cliente conectar seu próprio portal Bitrix24 dentro do Nexo hospedado na Onnira Cloud.

**Architecture:** `validateEnvironment` conserva apenas segredos e URL pública da instalação, aceitando o portal antigo como configuração opcional de compatibilidade. `BitrixClient` valida o webhook recebido, fixa seu portal e o recupera do armazenamento no reinício. A tela inicial explica como gerar e validar o webhook, e a documentação distingue publicação pelo responsável técnico de instalação do cliente.

**Tech Stack:** Next.js, TypeScript, SQLite, Vitest, Playwright.

## Global Constraints

- Um portal Bitrix24 Cloud por instalação Onnira.
- Somente HTTPS e domínios Bitrix24 Cloud permitidos para webhook de entrada.
- O primeiro acesso continua protegido pelo código de instalação até a Onnira fornecer identidade verificável do instalador.
- Não afirmar publicação no Marketplace sem acesso de publicador e contrato de instalação.

---

### Task 1: Identificação segura do portal

**Files:** `src/server/security.ts`, `src/server/bitrix.ts`, `src/server/http.ts`, `scripts/start.mjs`, testes de domínio e Bitrix.

- [x] Criar testes para ambiente sem `BITRIX_PORTAL_URL`, webhook válido, domínios rejeitados, fixação do primeiro portal, rejeição do segundo e restauração após reinício.
- [x] Executar os testes e confirmar falha pela ausência do comportamento.
- [x] Extrair portal da URL validada; permitir configuração antiga opcional, fixar domínio após o primeiro webhook e recuperar a conexão criptografada ao construir o cliente.
- [x] Remover `BITRIX_PORTAL_URL` da lista de ambiente obrigatório e do bloqueio de início do worker.
- [x] Executar testes de domínio afetados e corrigir regressões.

### Task 2: Primeira conexão e documentação

**Files:** `src/components/setup-screen.tsx`, `docs/manual-instalacao.md`, `README.md`, `docs/marketplace.md`, `tests/e2e/workspace.spec.ts`.

- [x] Mostrar primeiro passo de conexão Bitrix com escopos e caminho para obter o webhook, mantendo o código inicial protegido.
- [x] Fazer a tela de hospedagem referir-se somente às três variáveis técnicas restantes.
- [x] Atualizar o guia do cliente para instalação pela Onnira e manter a publicação Git como procedimento do responsável técnico.
- [x] Executar E2E, testes, lint, tipos e build; gerar pacote para publicação.
