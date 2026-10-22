# Nexo webhook-only: conexão com o Bitrix24

## Objetivo

Manter o Nexo hospedado na Onnira e conectá-lo ao portal Bitrix24 exclusivamente por webhooks. O RH usa a interface do Nexo na URL da Onnira. O Bitrix permanece como fonte de usuários, movimentações, tarefas e checklists.

## Decisões

- Não instalar uma aplicação OAuth no Bitrix. O Nexo não depende de `AUTH_ID`, `REFRESH_ID`, `APPLICATION_TOKEN`, `client_id`, `client_secret`, `event.bind` ou `event.get`.
- Usar um webhook de entrada criado por uma conta de serviço RH para as chamadas REST. A conta e os escopos do webhook limitam todas as operações feitas no portal.
- Receber eventos por webhook de saída cadastrado manualmente em Recursos do desenvolvedor no Bitrix. O evento `ONCRMDYNAMICITEMUPDATE` informa mudanças em itens de processos personalizados. O Nexo copia a URL do handler e compara o segredo do webhook recebido com o token configurado.
- Usar conciliação periódica a cada 60 segundos para recuperar mudanças perdidas e acompanhar tarefas/checklists, pois a entrega de eventos de saída não oferece retry garantido.
- Autenticar usuários de RH com contas locais do Nexo. Cada conta tem um ID de usuário Bitrix vinculado e papéis do Nexo. O vínculo é administrativo; não representa autenticação pelo Bitrix nem verifica a permissão efetiva do usuário vinculado.
- Exigir credenciais locais individuais; não usar uma senha de RH compartilhada. O primeiro administrador é criado depois que o `NEXO_SETUP_TOKEN` válido é apresentado. O administrador cria contas, papéis e vínculos com IDs Bitrix.

## Experiência de instalação

1. A Onnira executa o app com `NEXO_APP_URL`, `BITRIX_PORTAL_URL`, `NEXO_ENCRYPTION_KEY` e `NEXO_SETUP_TOKEN`; o volume persistente contém o SQLite.
2. A tela de instalação explica como criar um webhook de entrada com `task`, `user_brief`, `crm` e `userfieldconfig` (ou `user` quando esse escopo for a opção do portal). O administrador cola a URL completa no Nexo.
3. O Nexo valida que a URL é HTTPS e pertence exatamente ao portal configurado, valida sua forma, chama `profile`/`scope` e mostra a conta e escopos encontrados sem exibir novamente o segredo.
4. A tela mostra a URL de handler pública `/api/bitrix/events` e instruções para cadastrar um webhook de saída para mudanças do processo personalizado. O administrador cola o token apresentado pelo Bitrix; o Nexo valida o formato e guarda-o criptografado. A conta também pode selecionar eventos de tarefa se o portal oferecer esses eventos.
5. O assistente inicializa ou mapeia o processo de RH usando a identidade e os direitos do webhook de entrada. Em seguida, o administrador cria a primeira conta local de RH.
6. O administrador associa contas locais a usuários Bitrix e papéis. A equipe entra em `NEXO_APP_URL` com seu próprio login e senha do Nexo.

## Interface e autenticação

- Remover o fluxo de instalação/abertura OAuth do Bitrix. A interface é servida pela Onnira e não aparece como aplicativo nativo no menu do Bitrix nem recebe SSO do portal.
- Implementar sessão local com cookie `HttpOnly`, `Secure`, `SameSite=Lax`, expiração, rotação e token aleatório armazenado no banco somente como hash.
- Armazenar senhas com scrypt, salt aleatório e parâmetros versionados; nunca guardar ou registrar senhas em texto puro.
- O bootstrap com `NEXO_SETUP_TOKEN` só pode criar o primeiro administrador e deve ser encerrado após a instalação. O segredo não autentica o uso diário.
- Aplicar papéis do Nexo no servidor para RH, gestor, executor e colaborador. Exibir somente jornadas e campos permitidos pelo papel; contas sem vínculo válido não operam.
- Registrar ator local e executor Bitrix (conta que criou o webhook) no histórico da operação.

## Cliente REST e segredos

- A URL de entrada e o token do webhook de saída são credenciais confidenciais. Guardar ambos criptografados com AES-GCM e `NEXO_ENCRYPTION_KEY`, no armazenamento já persistido do Nexo.
- O cliente REST forma cada endpoint a partir da origem validada do portal e do caminho `/rest/{user_id}/{secret}/{method}.json`; parâmetros ficam no corpo POST. Nunca colocar o segredo em parâmetros, logs, mensagens de erro ou respostas ao browser.
- Validar todos os métodos e tratar rate limit, expiração/revogação, timeout e resultados incertos. Ao detectar credencial inválida, pausar automações e pedir que RH atualize o webhook; não repetir uma criação incerta sem conciliação.
- A origem do evento de saída deve corresponder a `BITRIX_PORTAL_URL`; validar o token em tempo constante e filtrar os eventos pelo `entityTypeId` e regras configuradas. Eventos duplicados são idempotentes.
- A URL completa do webhook nunca será devolvida por endpoints de leitura de configurações. A interface mostra somente estado conectado, conta associada e data da última verificação.

## Processos e eventos

- Chamadas para descobrir e criar processos, tarefas e checklists passam pelo webhook de entrada.
- O evento de saída `ONCRMDYNAMICITEMUPDATE` inicia ou atualiza a movimentação após mudança na etapa de aprovação. O Nexo confirma o tipo e a etapa por consulta REST autenticada pelo webhook de entrada antes de iniciar a jornada.
- Updates emitidos pelo Nexo podem voltar pelo webhook de saída. O Nexo filtra pela movimentação e etapa configuradas, e reserva cada movimentação uma vez para que esses retornos não abram jornadas duplicadas.
- A conciliação de 60 segundos detecta alterações não entregues; indisponibilidade do portal mantém o trabalho na fila persistida.
- Atividades pendentes, responsáveis, prazos, checks de conclusão, radar e regras de conclusão continuam com o comportamento já definido.

## Segurança e limites

- O webhook de entrada deve ser criado por uma conta RH de serviço dedicada, com somente os escopos exigidos e permissões mínimas para o processo, tarefas e usuários necessários. A política de expiração do Bitrix precisa ser observada; o assistente alerta antes de expirar quando a plataforma disponibilizar essa informação e mantém reconciliação após rotação.
- Como o Bitrix executa chamadas com a conta que criou o webhook, papéis locais do Nexo não equivalem às permissões individuais dessa pessoa no Bitrix. O Bitrix verá a conta de serviço como executor das ações.
- O Nexo não será instalado dentro do Bitrix nem terá SSO. O RH acessa a URL da Onnira. Isso é consequência de usar somente webhooks: o Bitrix documenta webhooks como ferramentas de integração sem interface; interfaces nativas usam aplicações locais.
- Webhooks de saída podem não repetir notificações quando o handler está indisponível; a conciliação periódica continua obrigatória.
- Segredos não podem ser publicados no Git nem enviados ao chat. Os usuários os inserem diretamente nas telas HTTPS de instalação do Nexo.

## Validação

- Testar validação de domínio/caminho HTTPS, criptografia e rotação de segredos, URL nunca retornada, permissões locais, sessões, login e bootstrap de primeiro administrador.
- Testar chamadas REST via caminho do webhook, paginação, rate limit, token inválido, timeout e resultado de criação incerto.
- Testar parsing e autenticação de eventos de saída em JSON e formulário, domínio/token inválidos, eventos duplicados, entidade/etapa irrelevantes e mudança aprovada válida.
- Testar conciliação depois de evento perdido, reinício da Onnira e rotação de credenciais.
- Executar testes de domínio, tipos, lint, testes de navegador e build; documentar que somente um teste com o portal de homologação comprova compatibilidade do webhook e escopos reais.

## Referências oficiais

- [Webhooks de entrada e saída](https://apidocs.bitrix24.com/local-integrations/local-webhooks.html)
- [Eventos de processos inteligentes](https://apidocs.bitrix24.com/api-reference/crm/universal/events/index.html)
- [Autorização e métodos exclusivos de aplicação](https://apidocs.bitrix24.com/settings/how-to-call-rest-api/authorization.html)
