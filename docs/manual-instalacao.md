# Manual fácil de instalação do Nexo

O Nexo roda na Onnira Cloud IA. Cada cliente conecta seu próprio portal Bitrix24 por webhook. O fluxo de instalação pelo Marketplace depende da liberação de publicação pela Onnira; até lá, o responsável técnico pode publicar uma instância pela Cloud IA usando os passos de hospedagem abaixo.

## Se você vai usar o Nexo

1. Abra o Nexo instalado na sua conta Onnira. Na primeira tela, escolha **Conecte seu Bitrix24**.
2. Entre no seu portal Bitrix24 com a conta de RH que executará as tarefas. Crie um webhook REST **de entrada** em **Aplicativos → Recursos do desenvolvedor → Webhooks**, com os escopos `task`, `user_brief` (ou `user`), `crm`, `sonet` e `userfieldconfig`.
3. Cole a URL completa do webhook no Nexo e escolha **Validar conexão**. O Nexo identifica seu portal, testa a conta e verifica os escopos.
4. No mesmo navegador, informe seu e-mail e crie uma senha com pelo menos 12 caracteres. Clique em **Criar acesso RH**. O Nexo reconhece automaticamente a conta Bitrix do webhook. Esta etapa deve ser concluída em até dez minutos; se expirar, valide o webhook novamente.
5. Configure o projeto de tarefas e revise os modelos. Para receber eventos e iniciar jornadas automaticamente, siga o passo 5 deste manual.

O webhook dá ao Nexo as permissões da conta Bitrix que o criou. Use uma conta de serviço autorizada pelo RH e mantenha a URL em segredo. Clientes não precisam configurar `BITRIX_PORTAL_URL`, publicar Git ou criar chaves de criptografia.

**Pendente para o Marketplace:** a Onnira ainda precisa fornecer o processo de publicação no catálogo e a garantia de uma instância isolada por cliente. A primeira conta RH só pode ser criada após validar o webhook, no mesmo navegador e dentro do prazo indicado.

## Se você vai publicar uma instância técnica na Cloud IA

- Acesso de administrador à aplicação Onnira e ao portal Bitrix24.
- Um usuário Bitrix de serviço para RH, com permissão para consultar colaboradores, criar tarefas e operar o processo de movimentações.
- Acesso ao repositório público `https://github.com/ti-atomicgroup/nexo-bitrix`.

O Nexo é aberto pela URL da Onnira. O Bitrix fornece os dados e as tarefas por webhook. As contas locais do Nexo controlam o acesso à tela; use somente pessoas autorizadas de RH.

## 1. Publique na Onnira

1. Entre em [app.onnira.com](https://app.onnira.com) e crie uma aplicação a partir de um repositório GitHub.
2. Informe `https://github.com/ti-atomicgroup/nexo-bitrix` e selecione a branch `feat/nexo-workflows-kanban` até esta versão ser incorporada à branch principal.
3. Escolha o runtime Next.js, diretório base `/` e configure os comandos:

   | Campo | Valor |
   | --- | --- |
   | Instalação | `npm ci` |
   | Build | `npm run build` |
   | Inicialização | `npm start` |
   | Porta | `3000` |

4. Publique a aplicação e abra a URL HTTPS pública mostrada pela Onnira. O Nexo identifica essa origem na primeira abertura. Este procedimento é do responsável técnico, não do cliente que instala pelo Marketplace.

## 2. Preserve os dados da instância

Ative o volume persistente da Onnira em `/app/.data`. O banco SQLite e a chave de criptografia criada pelo Nexo ficam nesse volume. Preserve e inclua o volume no procedimento de backup e restauração; sem a chave original, as credenciais Bitrix armazenadas não podem ser decifradas. A aplicação precisa de uma instância isolada por cliente e de uma única réplica usando esse SQLite.

`NEXO_APP_URL`, `NEXO_ENCRYPTION_KEY` e `NEXO_DATA_DIR` são opções técnicas do publicador; o cliente não precisa preenchê-las. `PORT` tem padrão `3000`.

Para habilitar comandos pelo chat Onnira, crie um segredo separado `NEXO_CHAT_API_KEY` (pelo menos 32 caracteres aleatórios). No PowerShell, use `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` e cole o resultado apenas na configuração secreta do servidor e do conector. Nunca reutilize o webhook Bitrix.

### Ativar sugestões opcionais por IA

Para habilitar a trilha guiada, adicione também `NEXO_AI_BASE_URL` (endpoint HTTPS compatível com OpenAI Chat Completions, sem `/chat/completions`), `NEXO_AI_MODEL` e `NEXO_AI_API_KEY`. Os três valores ficam somente como segredos/variáveis no servidor da Onnira. Sem qualquer um deles, a abertura manual continua disponível e a tela informa que a sugestão está desabilitada. Não cole a chave no Nexo ou no Git.

Ao pedir uma sugestão, o RH cola a descrição da vaga. O Nexo envia essa descrição e o catálogo do modelo escolhido ao provedor configurado; não envia nome, e-mail ou identificador do colaborador. O texto da vaga é mantido apenas durante a solicitação e não é salvo pelo Nexo. Antes de usar com dados internos, confirme a política de retenção e uso de dados do provedor contratado pela empresa. O RH revisa e aprova as tarefas e prazos antes de iniciar a jornada. Competências sem atividade correspondente são mostradas como lacunas para decisão humana.

### Conectar o chat Onnira à API do Nexo

1. Configure `NEXO_CHAT_API_KEY` como variável secreta no ambiente da aplicação e reinicie/republique o Nexo.
2. Confirme que a conta Bitrix que criou o webhook está associada a uma conta Nexo ativa com papel `admin` ou `rh`.
3. No recurso de conectores da Onnira, cadastre a API externa usando `https://<url-publicada-do-nexo>/api/chat/openapi.json` e autenticação Bearer com a mesma chave secreta. Os nomes dos menus dependem da versão/plano da Onnira.
4. Teste primeiro `GET /api/chat/v1/workspace` para consultar o trabalho de hoje. Depois, habilite as ações de início/conclusão de tarefas conforme a política interna de RH.
5. Se a Onnira não aceitar uma URL OpenAPI externa ou um segredo Bearer no conector, peça à equipe Onnira para habilitar esse recurso no plano da conta; a API do Nexo estará pronta, mas o chat ainda não poderá chamá-la.

O chat pode consultar tarefas de hoje, buscar colaboradores ativos, listar jornadas e modelos, iniciar uma jornada com modelo existente, iniciar/concluir/reabrir tarefas e marcar itens do checklist. O Nexo valida a conta RH, repassa alterações ao Bitrix e registra auditoria. O modelo de IA não recebe a URL nem a chave do webhook Bitrix.

## 3. Crie o webhook de entrada no Bitrix

O webhook de entrada permite que o Nexo consulte o Bitrix e crie tarefas em nome do usuário de serviço.

1. Entre no portal Bitrix24 que será conectado com o usuário de serviço de RH. Para o teste deste projeto, o portal é [helpbr24.bitrix24.com.br](https://helpbr24.bitrix24.com.br).
2. Abra **Aplicativos → Recursos do desenvolvedor → Webhooks → Webhook de entrada**. Os nomes dos menus podem variar um pouco conforme a interface do portal.
3. Conceda os escopos `task`, `user_brief` (ou `user`), `crm`, `sonet` e `userfieldconfig`. `sonet` permite preparar o projeto RH; `userfieldconfig` permite criar campos do processo.
4. Crie o webhook e copie a URL completa, inclusive a parte secreta. O Bitrix só mostra essa credencial durante a criação.
5. Em outra aba, abra a URL publicada do Nexo. No assistente, cole a URL completa do webhook de entrada e escolha **Validar conexão**.
6. Quando a validação passar, crie o primeiro acesso RH com e-mail e senha. O Nexo vincula automaticamente o usuário Bitrix que criou o webhook.

Se a validação indicar escopos ausentes, edite ou crie novamente o webhook com os escopos necessários e atualize a URL no Nexo. Se indicar acesso negado, confira as permissões efetivas do usuário de serviço no Bitrix.

## 4. Configure o processo e os modelos

No assistente do Nexo, configure o processo **Movimentações de Pessoas** ou selecione um processo que já exista. O app consulta campos e etapas disponíveis no Bitrix; nenhum ID precisa ser copiado para o código. A preparação também cria uma vez o projeto privado **Nexo · RH** para as tarefas e o Kanban.

Depois, adicione os profissionais de RH como participantes do projeto no Bitrix24, escolha os responsáveis de RH e TI, revise os modelos iniciais de onboarding e offboarding e ajuste atividades, prazos, instruções e obrigatoriedade. Crie modelos por perfil, como RH, Vendedor ou Liderança. Na abertura, o RH escolhe explicitamente o modelo e revisa as etapas antes de iniciar. Na edição do modelo, configure cada etapa para liberar no início, em uma data relativa à data principal, ou após a conclusão das atividades obrigatórias da etapa anterior. O Nexo só cria no Kanban as tarefas da etapa liberada. A tarefa de preparação para TI é calculada para três dias úteis antes da entrada e um dia útil antes da saída. Feriados não são descontados até haver calendário configurado.

Faça o primeiro teste com dados fictícios: inicie uma jornada manual, abra a tarefa criada no Bitrix, confira responsável, prazo e checklist e marque uma atividade concluída. O teste de offboarding também deve ser feito com uma pessoa fictícia; o Nexo registra solicitações para revogar acessos, enquanto a equipe responsável realiza e confirma as ações nos outros sistemas.

## 5. Ative o início automático (opcional)

O início manual funciona sem este passo. Para iniciar jornadas quando uma aprovação muda de etapa no Bitrix, crie um webhook de saída:

1. No Bitrix, abra a área de webhooks de saída/eventos e assine `ONCRMDYNAMICITEMUPDATE`, `ONCRMDEALUPDATE` ou `ONCRMLEADUPDATE` para aprovações e `ONTASKUPDATE` para sincronizar movimentações no Kanban. `ONTASKDELETE` pode ser usado para sinalizar tarefas removidas.
2. No Nexo, abra **Configurações → Conexão** e copie a URL do handler de eventos, terminada em `/api/bitrix/events`.
3. Cole essa URL no Bitrix e salve a configuração do evento.
4. Copie o token emitido/configurado para proteger o envio e registre-o nas configurações de conexão do Nexo.
5. Em **Configurações → Processo de RH**, descubra os Kanbans, selecione quadro, funil, etapa, modelo e campos do nome e da data. Mude um registro fictício para a etapa escolhida e confira se uma única jornada foi criada. Se o candidato ainda não tiver conta Bitrix, tarefas de RH e TI seguem; vincule o usuário quando a conta existir para liberar as tarefas pessoais. Depois mova uma tarefa fictícia entre colunas do Kanban e confirme a atualização no Nexo.

O Nexo também consulta as etapas configuradas a cada 60 segundos. Se um evento se perder, a conciliação recupera o registro aprovado. Eventos repetidos e conciliação não criam uma segunda jornada para a mesma origem.

Webhook de entrada significa **Nexo chama o Bitrix**. Webhook de saída significa **Bitrix avisa o Nexo** quando o registro muda. Não use o endereço do webhook de entrada como endereço do evento.

## Se algo não funcionar

| O que você vê | O que conferir |
| --- | --- |
| A página não abre ou não salva a conexão | O responsável técnico deve conferir os logs e o volume persistente `/app/.data` da instância na Onnira. |
| A criação de senha informa que a validação expirou | Valide o webhook novamente no mesmo navegador e crie a senha em até dez minutos. |
| `SCOPES_MISSING` | Recrie o webhook de entrada com `task`, `user_brief` ou `user`, `crm`, `sonet` e `userfieldconfig`; atualize a URL no Nexo. |
| Bitrix retorna 403 ou acesso negado | Confira permissões do usuário que criou o webhook. O Bitrix aplica as permissões dessa conta às operações do Nexo. |
| Início automático não acontece | Confira a URL `/api/bitrix/events`, assinatura do evento, token de saída e regra que associa a etapa de aprovação a um modelo. |
| Dados somem após republicar | Ative e preserve o volume persistente em `/app/.data`, incluindo banco e chave da instância. |
| Webhook foi exposto ou perdido | Revogue-o no Bitrix, crie outro e atualize a conexão do Nexo. Nunca cole credenciais em tickets ou mensagens. |

Para suporte, anote horário, ação, mensagem/código de erro e identificador da jornada. Remova tokens, senhas e dados pessoais antes de compartilhar logs.

## Checklist final

- [ ] URL HTTPS da Onnira abre o Nexo.
- [ ] Volume persistente em `/app/.data` está ativo e foi incluído no backup.
- [ ] Webhook de entrada passou no teste de conexão.
- [ ] Primeiro acesso RH foi criado com senha e vínculo automático à conta do webhook.
- [ ] Uma jornada manual de teste criou tarefas reais no Bitrix.
- [ ] Projeto privado Nexo · RH está acessível aos profissionais RH convidados no Bitrix.
- [ ] (Opcional) Evento de saída iniciou exatamente uma jornada no teste.
- [ ] Backup seguro do volume com banco e chave de criptografia foi guardado.

