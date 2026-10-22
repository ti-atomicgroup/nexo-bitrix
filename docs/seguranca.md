# Segurança e operação

## Identidade e autorização

O Nexo utiliza a identidade Bitrix de quem abriu a aplicação. Credenciais de cada usuário são separadas; ações interativas não utilizam o token administrativo de outro usuário. Papéis Nexo são uma restrição adicional às permissões efetivas do portal.

A primeira instalação requer administrador verificado pelo Bitrix e segredo de bootstrap definido na hospedagem. As próximas aberturas e eventos validam o portal, `member_id` e o token da aplicação preservado na instalação. O domínio cloud autorizado é fixado por variável de ambiente; endpoints arbitrários recebidos em eventos não são utilizados.

## Credenciais e sessões

Tokens OAuth, segredo da aplicação e token de verificação são cifrados com AES-256-GCM. A chave de criptografia pertence à configuração da hospedagem e deve ficar fora do código e do banco. Não alterar essa chave sem procedimento de migração; a perda impede recuperar as credenciais cifradas.

As sessões do Nexo usam tokens aleatórios, armazenados por hash no banco e mantidos em memória no frame do navegador. O contexto de abertura é retirado do fragmento da URL depois da leitura. OAuth e segredos não são enviados como dados do workspace, gravados em localStorage ou incluídos nos logs. A sessão expira; para renovar o contexto, reabra a aplicação pelo portal.

## Dados mantidos

O SQLite contém modelos, snapshots das jornadas, usuários necessários ao processo, vínculos com tarefas e movimentações, checklists, configurações, auditoria e fila de sincronização. Informações operacionais podem conter dados pessoais e exigem proteção do volume e dos backups. A biblioteca de materiais utiliza links para arquivos existentes no Bitrix, sob suas permissões originais.

Escopos utilizados: `task`, `user_brief`, `crm` e `userfieldconfig` para provisionar campos. A aplicação não solicita escopo completo de alteração de usuários nem executa desligamentos ou revogações em outros sistemas.

## Automação e confiabilidade

A identidade de RH para execução em segundo plano é autorizada explicitamente por seu titular. O histórico diferencia origem e executor. Fila persistida e leases coordenam processos concorrentes. Resultado incerto de criação entra em conciliação; o sistema não repete uma criação sem verificar seu resultado.

Marcadores operacionais identificam tarefas/checklists para recuperação. Não removê-los das tarefas durante uma conciliação. Se a API não permitir comprovar o resultado, a operação fica pendente para investigação em vez de declarar sucesso.

## Hospedagem e backups

Use HTTPS, segredos de ambiente, acesso administrativo restrito à hospedagem e um volume persistente privado. Não exponha `data` como conteúdo estático. SQLite deve executar em uma única réplica. A fila e os leases coordenam o servidor e o worker da mesma instalação; não substituem um banco compartilhado para múltiplas réplicas.

Use `npm run backup` para produzir uma cópia consistente pela API SQLite. A cópia contém dados pessoais e credenciais cifradas: proteja-a como o banco. Guarde a chave de criptografia em cofre separado. Para restaurar, pare a instalação, preserve o banco atual, restaure a cópia e reinicie com a mesma chave. Valide a restauração em homologação antes de aplicar em produção.

## Resposta a incidentes e retenção

Em suspeita de vazamento, revogue a chave/tokens no Bitrix e restrinja a instalação antes de retomar a integração. Preserve os registros necessários à investigação sem divulgar credenciais. O administrador deve definir a retenção de históricos e backups conforme sua política; esta versão não possui expurgo automático. Solicitações de exclusão exigem procedimento administrativo que considere banco, backups e registros nativos do Bitrix.

A homologação real de permissões e implantação ainda é obrigatória antes do uso com pessoas reais.
