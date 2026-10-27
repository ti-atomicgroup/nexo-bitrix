# Permissões do webhook no Bitrix24

O Nexo fala com o Bitrix24 por um **webhook de entrada** criado no próprio portal. As ações acontecem com as
permissões da conta que criou o webhook. Recomendamos uma **conta dedicada ao Nexo** (por exemplo
"Nexo · RH"), sem perfil de administrador, com acesso ao CRM de recrutamento e à criação de grupos.

## Escopos obrigatórios

| Escopo | Rótulo no Bitrix | Para que o Nexo usa | Métodos |
|---|---|---|---|
| `task` | Tarefas | Criar uma tarefa por atividade liberada, ler o andamento, marcar como feita, aprovar e comentar ("Cobrar") | `tasks.task.add`, `tasks.task.list`, `tasks.task.complete`, `tasks.task.renew`, `tasks.task.approve`, `task.checklistitem.*`, `task.commentitem.add` |
| `user_brief` (ou `user`) | Usuários | Mostrar quem é quem (nome e cargo) e escolher responsáveis | `user.current`, `user.get` |
| `crm` | CRM | Detectar quando um candidato chega a "Contratado" (ou a outra etapa escolhida) e vincular a tarefa ao registro | `crm.stagehistory.list`, `crm.item.get`, `crm.item.fields`, `crm.type.list`, `crm.category.list`, `crm.status.list` |
| `sonet_group` | Grupos de trabalho | Criar ou reaproveitar o projeto privado "Nexo · Jornadas", onde ficam as tarefas | `sonet_group.get`, `sonet_group.create` |

## Escopos opcionais (o Nexo liga sozinho o que estiver liberado)

| Escopo | Rótulo no Bitrix | Para que o Nexo usa | Método |
|---|---|---|---|
| `im` | Bate-papo e notificações | Avisar o colaborador e os responsáveis quando uma etapa é liberada | `im.notify.personal.add` |
| `calendar` | Calendário | Colocar 1:1 e entrevista de saída na agenda dos participantes | `calendar.event.add` |
| `log` | Feed de notícias | Publicar as boas-vindas no 1º dia | `log.blogpost.add` |
| `disk` | Drive | Receber os documentos pedidos ao colaborador: gravar cada arquivo na pasta "Nexo · Documentos" do projeto e anexá-lo à tarefa | `disk.storage.getlist`, `disk.folder.getchildren`, `disk.folder.addsubfolder`, `disk.folder.uploadfile`, `tasks.task.files.attach` |

O método `scope` (sempre disponível) é usado na instalação para conferir o que foi concedido.

## O que o Nexo nunca faz

- Não lê e-mails, mensagens nem dados financeiros. No Drive, só grava os documentos enviados pelo colaborador na
  pasta "Nexo · Documentos" do projeto (e consulta essa pasta para não gravar o mesmo arquivo duas vezes).
- Não cria nem desativa usuários no Bitrix24. A revogação de acessos é uma lista de tarefas para a TI executar e marcar.
- Não guarda o endereço do webhook em texto: ele é cifrado (AES-256-GCM) e nunca volta para o navegador.
