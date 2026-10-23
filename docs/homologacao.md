# Homologação do Nexo

Este roteiro exige portal de testes, contas fictícias e uma instalação publicada na Onnira. Não utilizar dados reais de clientes.

Use um portal Bitrix24 de teste autorizado. Os itens abaixo permanecem pendentes até a publicação HTTPS e a instalação pelo administrador do portal.

## Instalação

- [ ] A URL pública usa HTTPS; `./data` está em volume persistente e há uma única réplica.
- [ ] O aplicativo abre pelo menu do Bitrix e reconhece o usuário correto.
- [ ] O administrador consegue concluir o assistente. Um usuário comum não consegue alterar a instalação.
- [ ] ID/chave de aplicação incorretos e segredo de bootstrap inválido são rejeitados.
- [ ] Abrir a URL fora do portal não concede sessão nem exibe dados de jornadas.

## Processo e modelos

- [ ] Criar o processo de RH e conferir seus campos, funil e etapas no Bitrix.
- [ ] Alternativamente, associar um processo existente por nomes/seleções, sem editar IDs no código.
- [ ] Revisar permissões do processo no Bitrix, limitando informações de RH aos responsáveis.
- [ ] Editar um modelo, iniciar jornada, alterar novamente o modelo e confirmar snapshot preservado.

## Jornada manual

- [ ] Iniciar admissão com pessoa, modelo, data e responsáveis fictícios.
- [ ] Conferir movimentação, tarefas, usuários responsáveis, datas e checklists nativos.
- [ ] Conferir prazos antes/no/depois da data principal e o fuso horário.
- [ ] Repetir a mesma solicitação e confirmar que não surgem novas tarefas.
- [ ] Mover a mesma movimentação para aprovação e confirmar que continua com uma única jornada.
- [ ] Repetir para offboarding: equipamentos, conhecimento, atividades e solicitações de revogação.

## Jornada automática

- [ ] Configurar um gatilho de cada tipo suportado: Lead, Negócio ou Processo Inteligente; selecionar quadro, funil, etapa, modelo e campos do nome/data.
- [ ] Mover um candidato fictício para a etapa de contratação e confirmar que a origem aparece na jornada com os dados mapeados.
- [ ] Testar candidato sem usuário Bitrix: tarefas de RH/TI são criadas, atividades pessoais aguardam vínculo e passam a ser criadas depois que RH associa uma conta ativa.
- [ ] Confirmar seleção de modelo e responsáveis e atualização da movimentação de RH para execução.
- [ ] Reenviar evento ou entrar novamente na aprovação; não criar nova jornada para o mesmo registro.
- [ ] Concluir as tarefas obrigatórias da primeira etapa no Bitrix e confirmar que só então as tarefas da etapa seguinte aparecem no Kanban.
- [ ] Testar etapa por data relativa, incluindo uma data já vencida, e confirmar liberação na conciliação sem alterar prazos originais.
- [ ] Aprovar registro incompleto; verificar pendência clara e ausência de tarefas incompletas.
- [ ] Corrigir o registro; confirmar recuperação sem bloquear outras aprovações válidas.
- [ ] Pausar uma regra e confirmar que o restante da instalação continua funcionando.

## Execução e permissões

- [ ] Concluir item de checklist no Nexo e conferir no Bitrix; repetir no sentido inverso.
- [ ] Tarefa aguardando aprovação não aparece como concluída.
- [ ] Jornada com atividade obrigatória/checklist pendente não pode ser encerrada.
- [ ] Colaborador vê apenas suas orientações e atividades permitidas.
- [ ] Retirar acesso a uma tarefa no Bitrix; confirmar que descrição e documentos não aparecem pelo cache.
- [ ] Usuário sem permissão não altera tarefas, regras, papéis ou configurações.
- [ ] Cancelar movimentação e confirmar que não são criadas novas tarefas nem concluída a jornada cancelada.

## Recuperação e publicação

- [ ] Simular indisponibilidade e limites da API; conferir pendências, logs e recuperação.
- [ ] Testar criação com resposta incerta e verificar conciliação antes de qualquer reenvio.
- [ ] Confirmar renovação OAuth e isolamento entre usuários.
- [ ] Reiniciar durante execução pendente e conferir retomada sem duplicação.
- [ ] Reiniciar/publicar atualização na Onnira e conferir persistência do banco e da chave.
- [ ] Conferir layout dentro do frame, navegador com cookies de terceiros bloqueados, celular e teclado.

Registre resultados, versão, data, portal de homologação e evidências sem credenciais. Testes automatizados locais e capturas fictícias não substituem este roteiro.
