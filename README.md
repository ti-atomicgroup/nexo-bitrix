# Nexo

Onboarding e offboarding de colaboradores integrados ao **Bitrix24**, hospedado na **Onnira Cloud**.
"Cada chegada bem-recebida. Cada saída sem pendência."

Projeto do Desafio Vibecode Br24 (card 11).

- O RH monta a jornada de quem chega ou sai a partir de trilhas prontas. Cada atividade liberada vira uma tarefa no
  projeto do Nexo no Bitrix24, com responsável, prazo e checklist.
- Gestor, TI e buddy trabalham só no Bitrix24. O Nexo acompanha o andamento e mostra no **Painel de hoje** o que vence
  hoje, o que está atrasado e quem cobrar.
- Quando um registro do CRM chega a uma etapa (por exemplo, "Contratado"), ele aparece no Painel como
  **Detectado no Bitrix24**, com a nova jornada já preenchida.
- O colaborador acompanha a própria jornada por um link pessoal, sem senha. Na saída, o inventário de acessos e
  equipamentos lista o que precisa ser devolvido ou revogado, e a jornada só é concluída quando nada fica pendente.

## Requisitos

- **Node.js 22 ou superior**, com npm. O Nexo usa o SQLite embutido do Node (22.13+); em versões anteriores, usa o
  `better-sqlite3`, que vem nas dependências opcionais.
- Um portal **Bitrix24** em que você possa criar um webhook de entrada.

## Instalar e rodar

```bash
npm install
npm run build
npm start
```

Abra `http://localhost:3000`. Os dados ficam em `./data`, criada sozinha e fora do Git. Para instalar exatamente as
versões do `package-lock.json`, use `npm ci` no lugar de `npm install`.

## Primeiro acesso (uns 5 minutos)

Na primeira vez, o Nexo abre sozinho o assistente **Vamos preparar o Nexo**, em três passos. Nada é criado no Bitrix24
antes do último passo.

### 1. Conectar o Bitrix24

1. No Bitrix24, abra **Recursos para desenvolvedores → Outro → Webhook de entrada**.
2. Em **Configurar permissões**, marque **Tarefas**, **Usuários**, **CRM** e **Grupos de trabalho**. Para os extras,
   marque também **Notificações**, **Agenda**, **Feed de notícias** e **Drive**.
3. Clique em **Salvar** e copie o endereço do webhook, no formato `https://suaempresa.bitrix24.com.br/rest/1/abc123/`.
4. No Nexo, cole o endereço e clique em **Conectar**. O Nexo mostra o portal, o dono do webhook e as permissões
   encontradas. Se faltar uma obrigatória, ele diz qual marcar. Depois, clique em **Continuar**.

Crie o webhook com uma conta dedicada, sem acesso de administrador. O Nexo guarda o endereço cifrado e nunca o mostra
de novo.

### 2. Criar o acesso de RH

Informe seu nome, seu e-mail e uma senha de pelo menos 10 caracteres. Este primeiro acesso é de administração.

### 3. Preparar o Nexo

Confira o nome da empresa (aparece no link do colaborador), o nome do projeto no Bitrix24 (se já existir um projeto
com esse nome, o Nexo usa o mesmo) e os responsáveis padrão de TI e de RH. Clique em **Preparar e começar**.

O Nexo cria ou reaproveita o projeto privado no Bitrix24, carrega as trilhas iniciais e abre o **Painel de hoje**.
As trilhas iniciais são Onboarding · Geral, Onboarding · Tecnologia, Onboarding · Vendas, Desligamento · Voluntário e
Desligamento · Involuntário.

### Depois da instalação

- **Entrar:** em `/entrar`, com o e-mail e a senha do passo 2.
- **Primeira jornada:** clique em **Nova jornada** e escolha quem chega ou sai, a trilha, a data e quem participa.
  As atividades liberadas viram tarefas no projeto do Bitrix24.
- **Detecção pelo CRM:** em **Ajustes → Automações do CRM**, escolha o funil, a etapa e a trilha sugerida.
- **Outras pessoas do RH:** em **Ajustes → Equipe → Novo acesso ao Nexo**.
- **Senha esquecida:** quem administra cria uma nova em **Ajustes → Equipe**. Com acesso ao servidor, também dá para
  usar `npm run senha:redefinir -- seu@email.com.br`.

## Publicar na Onnira

1. Envie a branch para o repositório público conectado à Onnira.
2. Na Onnira, aponte a aplicação para a branch e clique em **Salvar e republicar**. Os comandos são `npm ci`,
   `npm run build` e `npm start` (porta 3000). Em **Ver logs**, confira se o deploy começou; ele leva uns 6 minutos.
3. Abra o app pelo painel da Onnira. No primeiro acesso aparece o mesmo assistente. Os dados ficam no volume
   persistente, a pasta oculta `.data` do projeto (`/app/.data`), que equivale ao `./data` local.

A autorização do painel da Onnira vence em 10 minutos. Se o Nexo avisar que ela venceu, recarregue a página (F5) e
abra o Nexo de novo.

Nenhuma variável de ambiente é obrigatória. Opcionais:

- `PORT`: porta do servidor (padrão 3000).
- `NEXO_DATA_DIR`: outra pasta de dados.
- `NEXO_BUILD_HEAP_MB`: memória do build. Por padrão, 320 MB em ambientes de até 1,5 GB (como os 512 MB da Onnira)
  e metade da memória da máquina, até 4 GB, nos demais.

## Documentação

- [`docs/instalacao.md`](docs/instalacao.md): instalação passo a passo.
- [`docs/escopos.md`](docs/escopos.md): por que o Nexo pede cada permissão do webhook.
- [`docs/seguranca-lgpd.md`](docs/seguranca-lgpd.md): segurança e LGPD.
- [`docs/superpowers/specs/2026-10-26-nexo-v2-design.md`](docs/superpowers/specs/2026-10-26-nexo-v2-design.md):
  especificação aprovada.

## Diagnóstico

- `/diagnostico`: confere o que a hospedagem oferece (Node, SQLite, pasta de dados persistente, iframe, armazenamento,
  abas, cópia, download, e-mail e WhatsApp). O botão **Copiar relatório** gera um JSON sem dados pessoais nem segredos.
- `/diagnostico/sem-referer`: a mesma verificação sem o cabeçalho Referer (descobre se a borda da hospedagem bloqueia
  scripts).
- `/j/teste`: abra numa janela anônima para saber se o link pessoal do colaborador funciona fora da hospedagem.
- `/health` e `/api/health`: versão, commit e Node que estão no ar.

## Verificação

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes (Vitest) usam um Bitrix24 simulado, sem chamar o portal real.
