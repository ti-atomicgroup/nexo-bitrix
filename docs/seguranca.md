# Segurança e operação

## Identidade e autorização

O Nexo usa contas locais para autenticar profissionais. Operações Bitrix e eventos em segundo plano usam somente a identidade da conta de RH que criou o webhook de entrada. Essa conta de serviço precisa ter permissões efetivas suficientes para cada método; papéis Nexo restringem quem pode administrar o app, enquanto permissões do Bitrix continuam valendo para tarefas e projeto.

A primeira instalação requer administrador verificado pelo Bitrix e segredo de bootstrap definido na hospedagem. As próximas aberturas e eventos validam o portal, `member_id` e o token da aplicação preservado na instalação. O domínio cloud autorizado é fixado por variável de ambiente; endpoints arbitrários recebidos em eventos não são utilizados.

## Credenciais e sessões

URL do webhook de entrada e token do webhook de saída são cifrados com AES-256-GCM. A chave de criptografia pertence à configuração da hospedagem e deve ficar fora do código e do banco. Não alterar essa chave sem procedimento de migração; a perda impede recuperar as credenciais cifradas.

As sessões do Nexo usam tokens aleatórios, armazenados por hash no banco e mantidos em memória no navegador. Credenciais Bitrix não são enviadas como dados do workspace, gravadas em localStorage ou incluídas nos logs. A sessão expira; entre novamente com sua conta local do Nexo.

## Dados mantidos

O SQLite contém modelos, snapshots das jornadas, usuários necessários ao processo, vínculos com tarefas e movimentações, checklists, configurações, auditoria e fila de sincronização. Informações operacionais podem conter dados pessoais e exigem proteção do volume e dos backups. A biblioteca de materiais utiliza links para arquivos existentes no Bitrix, sob suas permissões originais.

Escopos utilizados: `task`, `user_brief` (ou `user`), `crm`, `sonet` para o projeto privado RH e `userfieldconfig` para provisionar campos. O projeto não recebe membros não-RH automaticamente. A aplicação não solicita escopo completo de alteração de usuários nem executa desligamentos ou revogações em outros sistemas.

## Automação e confiabilidade

A identidade de RH para execução em segundo plano é autorizada explicitamente por seu titular. O histórico diferencia origem e executor. Fila persistida e leases coordenam processos concorrentes. Resultado incerto de criação entra em conciliação; o sistema não repete uma criação sem verificar seu resultado.

Marcadores operacionais identificam tarefas/checklists para recuperação. Não removê-los das tarefas durante uma conciliação. Se a API não permitir comprovar o resultado, a operação fica pendente para investigação em vez de declarar sucesso.

## Hospedagem e backups

Use HTTPS, segredos de ambiente, acesso administrativo restrito à hospedagem e um volume persistente privado. Não exponha `data` como conteúdo estático. SQLite deve executar em uma única réplica. A fila e os leases coordenam o servidor e o worker da mesma instalação; não substituem um banco compartilhado para múltiplas réplicas.

Use `npm run backup` para produzir uma cópia consistente pela API SQLite. A cópia contém dados pessoais e credenciais cifradas: proteja-a como o banco. Guarde a chave de criptografia em cofre separado. Para restaurar, pare a instalação, preserve o banco atual, restaure a cópia e reinicie com a mesma chave. Valide a restauração em homologação antes de aplicar em produção.

## Resposta a incidentes e retenção

Em suspeita de vazamento, revogue a chave/tokens no Bitrix e restrinja a instalação antes de retomar a integração. Preserve os registros necessários à investigação sem divulgar credenciais. O administrador deve definir a retenção de históricos e backups conforme sua política; esta versão não possui expurgo automático. Solicitações de exclusão exigem procedimento administrativo que considere banco, backups e registros nativos do Bitrix.

A homologação real de permissões e implantação ainda é obrigatória antes do uso com pessoas reais.

## Sugestões opcionais por IA

O provedor é configurado no servidor da Onnira pelas variáveis `NEXO_AI_BASE_URL`, `NEXO_AI_MODEL` e `NEXO_AI_API_KEY`; a chave não é retornada em status nem enviada ao navegador. Sem configuração completa, o fluxo manual segue ativo. A descrição profissional colada pelo RH é encaminhada ao provedor configurado sem dados pessoais do colaborador e não é persistida pelo Nexo. O administrador deve validar contrato, região e política de retenção do provedor antes de habilitar. Respostas são estruturadas e validadas contra o modelo: IDs externos, novos procedimentos ou alterações de responsável são rejeitados. A recomendação não inicia tarefas; RH revisa e confirma o plano.
