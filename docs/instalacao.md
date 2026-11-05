# Instalação do Nexo (manual fácil)

Tempo estimado: **5 minutos**. Você vai precisar de:

- acesso ao seu portal **Bitrix24** com permissão para criar webhooks (Recursos para desenvolvedores);
- o Nexo aberto na **Onnira** (ou rodando localmente, para testes).

## 1. Crie o webhook no Bitrix24

1. No Bitrix24, abra **Recursos para desenvolvedores → Outro → Webhook de entrada**.
2. Dê um nome, por exemplo **Nexo · Jornadas**.
3. Marque as permissões:
   - **Obrigatórias:** Tarefas (`task`), Usuários (`user_brief` ou `user`), CRM (`crm`) e Grupos de trabalho (`sonet_group`).
   - **Opcionais:** Bate-papo e notificações (`im`), Calendário (`calendar`), Feed de notícias (`log`) e Drive (`disk`).
     Sem o Drive, o link pessoal mostra os documentos pedidos só como lista, sem envio de arquivos.
   - **Para convidar pelo Nexo:** Usuários (`user`) no lugar de `user_brief`, num webhook de conta **administradora**.
     Sem isso, quem ainda não tem conta é convidado pelo Bitrix24 e vinculado na página da jornada.
4. Clique em **Salvar** e só depois copie o **endereço do webhook**. Ele muda ao salvar.

> Dica: crie o webhook com uma conta dedicada ao Nexo. As tarefas aparecem como criadas por essa conta, e o acesso
> fica independente de pessoas que mudam de função. A tabela completa de permissões está em [`escopos.md`](escopos.md).

## 2. Siga o assistente do Nexo

Ao abrir o Nexo pela primeira vez, o assistente pede três coisas:

1. **Conecte seu Bitrix24.** Cole o endereço do webhook. O Nexo confere o portal, a conta e as permissões e mostra o que está faltando, se for o caso.
2. **Crie seu acesso de RH.** Nome, e-mail e uma senha com pelo menos 10 caracteres. É com ela que você volta ao Nexo depois.
3. **Prepare o Nexo.** Nome da empresa e quem faz as tarefas de TI e de RH por padrão. Um clique e o Nexo:
   - cria (ou reaproveita) o projeto privado **Nexo · Jornadas** no Bitrix24;
   - carrega as trilhas iniciais (entrada geral, vendas, tecnologia; saída voluntária e involuntária);
   - abre o **Painel de hoje**.

Pronto. Não há variáveis de ambiente obrigatórias nem chaves para gerar. Para produção com dados reais, veja [Antes de usar com dados reais](#antes-de-usar-com-dados-reais).

## 3. Primeiros passos

- **Nova jornada:** escolha a pessoa, a trilha e a data. O Nexo mostra quantas tarefas serão criadas e para quem.
- **Link do colaborador:** na página da jornada, aba "Link do colaborador", envie pelo chat do Bitrix24 (para quem já
  tem conta) ou copie e mande por onde preferir. Na mesma aba, "Lembrar pelo Bitrix24" manda o que falta, com um
  atalho para cada tarefa.
- **Outras pessoas do RH:** em Ajustes → Equipe → Novo acesso. Para agir no Bitrix24 pelo Nexo, a pessoa precisa ter conta ativa no portal, com o mesmo e-mail ou vinculada ali, e participar do projeto **Nexo · Jornadas**. Veja [`permissoes.md`](permissoes.md).
- **Automação:** em Ajustes → Automações, escolha o funil e a etapa do CRM que significa "contratado". O Nexo passa a mostrar no Painel de hoje quem foi contratado, com a jornada pronta para iniciar.

## Publicação na Onnira (responsável técnico)

1. Repositório público no GitHub com este código; branch de publicação (ex.: `nexo-v2`).
2. Na Onnira, crie ou edite a aplicação apontando para o repositório e a branch. Diretório base `/`.
3. Comandos padrão de Next.js: `npm ci`, `npm run build`, `npm start` (porta 3000). No envio por ZIP, escolha
   "Outro / configurar manualmente" e informe esses três comandos. Node 22 ou superior (`.nvmrc` e `engines`).
   Teste de saúde: `/health` ou `/api/health`, que respondem 200 sem tocar no banco e sem dizer nada sobre o ambiente.
4. Os dados ficam no volume persistente, a pasta oculta `.data` do projeto (`/app/.data`; equivale ao `./data` local): banco SQLite, chave da instância e registros. Em Ajustes → Diagnóstico, a pasta de dados deve aparecer como `onnira-volume`; se aparecer `local`, os dados se perdem a cada publicação.

### Worker do Bitrix24

`npm start` (`scripts/start.mjs`) sobe dois processos:

- **Nexo** (`next start`, porta `PORT`): telas e API. Não abre conexão com o Bitrix24.
- **Worker do Bitrix24** (`scripts/bitrix-worker.mjs`, só em `127.0.0.1:3901`): é o único que chama a API REST do
  Bitrix24. O Nexo manda cada chamada para ele por `http://127.0.0.1`, sem passar pelo domínio público, e o worker
  acorda o motor a cada minuto por `POST http://127.0.0.1:${PORT}/api/jobs/tick`.

Os dois combinam um token interno gerado na partida. O worker e o transporte direto seguem a mesma política de destino
([`seguranca-lgpd.md`](seguranca-lgpd.md)) e nunca registram o endereço do webhook. Se o worker cair, volta sozinho.
Ajustes → Diagnóstico mostra se ele está ligado, e o teste de conexão em `/diagnostico`, só para a administração, inclui a saída feita por ele.
`npm run start:web`, ou uma hospedagem que não sobe por `npm start`, roda só o Nexo, que então chama o Bitrix24 direto, com a mesma política.

### Antes de usar com dados reais

1. Responda à lista de [`onnira-seguranca.md`](onnira-seguranca.md) com o suporte da Onnira: cifragem e backups do volume.
2. Defina `NEXO_ENCRYPTION_KEY` (64 caracteres hexadecimais; gere com `openssl rand -hex 32`), para a chave não ficar no volume do banco, e guarde uma cópia dela em lugar seguro. **Numa instalação que já tem dados, antes copie o valor atual de `.nexo-key`:** com outra chave, o que já foi cifrado deixa de abrir.
3. Crie o webhook com uma conta dedicada e o mínimo de escopos. O Nexo avisa se houver privilégio a mais.
4. Confira `/diagnostico` dentro do painel: "Sessão por cookie protegido" diz qual modo está em uso, e a CSP deve deixar a página funcionar normalmente.
5. Baixe uma cópia em Ajustes → Dados pessoais e teste a restauração uma vez (`npm run backup:restaurar`).

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "Marque estes escopos no webhook" | Edite o webhook no Bitrix24, marque os escopos listados, salve e cole o endereço de novo. |
| "A conta que criou o webhook está inativa" | Crie o webhook com uma conta ativa. |
| "Limite temporário do Bitrix24" | O Bitrix24 limita chamadas por segundo. O Nexo espera e tenta de novo sozinho. |
| O link do colaborador abre "Acesso permitido somente dentro da Onnira" | A Onnira bloqueia acessos de fora do painel. Peça ao suporte da Onnira para liberar o caminho `/j/*`. |
| Página em branco ou erro | Abra `/diagnostico` e use "Copiar relatório" para enviar ao suporte. Sem entrar no Nexo, o relatório traz só o básico; com um acesso de administração, traz o ambiente do servidor. |
| "Seu acesso ao Nexo ainda não está ligado a uma pessoa do Bitrix24" | Em Ajustes → Equipe, vincule o acesso à pessoa certa. Se ela acabou de entrar no portal, atualize a lista de pessoas antes. |
| "Você não participa do projeto" | No Bitrix24, inclua a pessoa no projeto **Nexo · Jornadas**. Em até 5 minutos, o Nexo reconhece. |
| "Use o endereço do seu portal Bitrix24" com um portal em domínio próprio | O responsável técnico libera o domínio em `NEXO_BITRIX_ALLOWED_HOSTS` (separados por vírgula). |
| Todo mundo entrou de novo depois de atualizar para a v3 | É esperado, uma vez só: as sessões antigas foram encerradas porque o token ficava no navegador. |
| Esqueceu a senha ou o login ficou bloqueado | Outro administrador redefine em Ajustes → Equipe. Sem outro administrador, quem tem acesso ao servidor roda `npm run senha:redefinir -- <e-mail>` na pasta do Nexo: a nova senha é digitada no terminal, o bloqueio é desfeito e as sessões abertas desse acesso são encerradas. |
