# Permissões do webhook no Bitrix24

O Nexo fala com o Bitrix24 por um **webhook de entrada** criado no próprio portal. As ações acontecem com as
permissões da conta que criou o webhook. Recomendamos uma **conta dedicada ao Nexo** (por exemplo
"Nexo · RH"), sem perfil de administrador, com acesso ao CRM de recrutamento e à criação de grupos.
Quem pode pedir o quê dentro do Nexo está em [permissoes.md](permissoes.md).

## Escopos obrigatórios

| Escopo | Rótulo no Bitrix | Para que o Nexo usa | Métodos |
|---|---|---|---|
| `task` | Tarefas | Criar uma tarefa por atividade liberada, ler o andamento, marcar como feita, aprovar e comentar ("Cobrar") | `tasks.task.add`, `tasks.task.list`, `tasks.task.complete`, `tasks.task.renew`, `tasks.task.approve`, `task.checklistitem.*`, `task.commentitem.add` |
| `user_brief` (ou `user`) | Usuários | Mostrar quem é quem (nome e cargo), escolher responsáveis e conferir se a conta de quem pede uma ação está ativa | `user.current`, `user.get` |
| `crm` | CRM | Detectar quando um candidato chega a "Contratado" (ou a outra etapa escolhida) e vincular a tarefa ao registro | `crm.stagehistory.list`, `crm.item.get`, `crm.item.fields`, `crm.type.list`, `crm.category.list`, `crm.status.list` |
| `sonet_group` | Grupos de trabalho | Criar ou reaproveitar o projeto privado "Nexo · Jornadas", onde ficam as tarefas, e conferir quem participa dele | `sonet_group.get`, `sonet_group.create`, `sonet_group.user.get` |

## Escopos opcionais (o Nexo liga sozinho o que estiver liberado)

| Escopo | Rótulo no Bitrix | Para que o Nexo usa | Método |
|---|---|---|---|
| `im` | Bate-papo e notificações | Avisar o colaborador e os responsáveis quando uma etapa é liberada; enviar no chat o link pessoal e o lembrete do que falta, quando o RH pede | `im.notify.personal.add`, `im.message.add` |
| `calendar` | Calendário | Colocar 1:1 e entrevista de saída na agenda dos participantes | `calendar.event.add` |
| `log` | Feed de notícias | Publicar as boas-vindas no 1º dia | `log.blogpost.add` |
| `user` | Usuários (completo) | Convidar para o Bitrix24 quem ainda não tem conta, na nova jornada ou na página da jornada. Só funciona se a conta dona do webhook for **administradora** do portal, e só a administração do Nexo pode pedir | `user.get`, `user.add` |
| `disk` | Drive | Receber os documentos pedidos ao colaborador: gravar cada arquivo na pasta "Nexo · Documentos" do projeto e anexá-lo à tarefa | `disk.storage.getlist`, `disk.folder.getchildren`, `disk.folder.addsubfolder`, `disk.folder.uploadfile`, `tasks.task.files.attach` |

Os métodos `scope` e `user.admin` (sempre disponíveis) são usados na instalação para conferir o que foi concedido e avisar se a conta tem mais privilégio do que o necessário.

## O que o Nexo nunca faz

- Não lê e-mails, mensagens nem dados financeiros. No Drive, só grava os documentos enviados pelo colaborador na
  pasta "Nexo · Documentos" do projeto (e consulta essa pasta para não gravar o mesmo arquivo duas vezes).
- Não desativa usuários no Bitrix24. A revogação de acessos é uma lista de tarefas para a TI executar e marcar.
- Só cria uma conta quando a administração pede o convite. Antes de convidar, procura uma conta com o mesmo e-mail: se ela já
  existe, vincula essa conta em vez de convidar de novo.
- Não guarda o endereço do webhook em texto: ele é cifrado (AES-256-GCM) e nunca volta para o navegador.
- Não chama nada além do portal: o destino passa pela política de [seguranca-lgpd.md](seguranca-lgpd.md), inclusive sem o worker.
