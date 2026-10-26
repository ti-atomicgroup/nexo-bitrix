# Nexo

Onboarding e offboarding de colaboradores integrados ao **Bitrix24**, hospedado na **Onnira Cloud**.
"Cada chegada bem-recebida. Cada saída sem pendência."

> Versão 2 em construção para o Desafio Vibecode Br24 (card 11). A especificação aprovada está em
> [`docs/superpowers/specs/2026-10-26-nexo-v2-design.md`](docs/superpowers/specs/2026-10-26-nexo-v2-design.md).

## Rodar localmente

Requer Node.js 22.13 ou superior (usa o SQLite embutido do Node; `better-sqlite3` é a alternativa).

```bash
npm install
npm run build
npm start
```

O app abre em `http://localhost:3000`. Os dados ficam em `./data` (criada automaticamente e fora do Git).

## Publicar na Onnira

1. Envie a branch para o repositório público conectado à Onnira.
2. Na Onnira, aponte a aplicação para a branch e republique. Comandos: `npm ci`, `npm run build`, `npm start` (porta 3000).
3. Abra o app pelo painel da Onnira. Na Onnira os dados ficam no volume persistente `/app/.data`, que equivale ao `./data` local.

Nenhuma variável de ambiente é obrigatória. Opcionais: `NEXO_DATA_DIR` (outra pasta de dados) e `PORT`.

## Sonda de ambiente

Antes da versão completa, a página **`/diagnostico`** confere o que a hospedagem oferece: versão do Node, SQLite,
pasta de dados persistente, cabeçalhos que chegam ao servidor, armazenamento no iframe, abrir abas, copiar, baixar,
e-mail e WhatsApp. O botão **Copiar relatório** gera um JSON sem dados pessoais ou segredos.

- `/diagnostico/sem-referer`: mesma verificação sem o cabeçalho Referer (descobre se a borda da Onnira bloqueia scripts).
- `/j/teste`: abra numa janela anônima para saber se o link pessoal do colaborador funciona fora da Onnira.
- `/api/health`: versão e commit que estão no ar.

## Verificação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
