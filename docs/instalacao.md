# Instalação do Nexo (manual fácil)

Tempo estimado: **5 minutos**. Você vai precisar de:

- acesso ao seu portal **Bitrix24** com permissão para criar webhooks (Aplicativos → Desenvolvedores);
- o Nexo aberto na **Onnira** (ou rodando localmente, para testes).

## 1. Crie o webhook no Bitrix24

1. No Bitrix24, abra **Aplicativos → Desenvolvedores → Outro → Webhook de entrada**.
2. Dê um nome, por exemplo **Nexo · Jornadas**.
3. Marque as permissões:
   - **Obrigatórias:** Tarefas (`task`), Usuários (`user_brief` ou `user`), CRM (`crm`) e Grupos de trabalho (`sonet_group`).
   - **Opcionais:** Bate-papo e notificações (`im`), Calendário (`calendar`), Feed de notícias (`log`) e Drive (`disk`).
     Sem o Drive, o link pessoal mostra os documentos pedidos só como lista, sem envio de arquivos.
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

Pronto. Não há variáveis de ambiente para preencher nem chaves para gerar.

## 3. Primeiros passos

- **Nova jornada:** escolha a pessoa, a trilha e a data. O Nexo mostra quantas tarefas serão criadas e para quem.
- **Link do colaborador:** na página da jornada, aba "Link do colaborador", envie por WhatsApp ou e-mail.
- **Automação:** em Ajustes → Automações, escolha o funil e a etapa do CRM que significa "contratado". O Nexo passa a mostrar no Painel de hoje quem foi contratado, com a jornada pronta para iniciar.

## Publicação na Onnira (responsável técnico)

1. Repositório público no GitHub com este código; branch de publicação (ex.: `nexo-v2`).
2. Na Onnira, crie ou edite a aplicação apontando para o repositório e a branch. Diretório base `/`.
3. Comandos padrão de Next.js: `npm ci`, `npm run build`, `npm start` (porta 3000).
4. Os dados ficam no volume persistente `/app/.data` (equivale ao `./data` local): banco SQLite, chave da instância e registros.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "Marque estes escopos no webhook" | Edite o webhook no Bitrix24, marque os escopos listados, salve e cole o endereço de novo. |
| "A conta que criou o webhook está inativa" | Crie o webhook com uma conta ativa. |
| "Limite temporário do Bitrix24" | O Bitrix24 limita chamadas por segundo. O Nexo espera e tenta de novo sozinho. |
| O link do colaborador abre "Acesso permitido somente dentro da Onnira" | A Onnira bloqueia acessos de fora do painel. Peça ao suporte da Onnira para liberar o caminho `/j/*`. |
| Página em branco ou erro | Abra `/diagnostico` e use "Copiar relatório" para enviar ao suporte. |
| Esqueceu a senha ou o login ficou bloqueado | Outro administrador redefine em Ajustes → Equipe. Sem outro administrador, quem tem acesso ao servidor roda `npm run senha:redefinir -- <e-mail>` na pasta do Nexo: a nova senha é digitada no terminal, o bloqueio é desfeito e as sessões abertas desse acesso são encerradas. |
