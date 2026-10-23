# Manual fácil de instalação do Nexo

Este guia leva você da publicação até o primeiro teste. Você vai hospedar o Nexo na Onnira e conectá-lo ao portal Bitrix24 `helpbr24.bitrix24.com.br` usando webhooks. Não precisa instalar o Nexo como aplicativo do Marketplace.

## O que você precisa

- Acesso de administrador à aplicação Onnira e ao portal Bitrix24.
- Um usuário Bitrix de serviço para RH, com permissão para consultar colaboradores, criar tarefas e operar o processo de movimentações.
- Acesso ao repositório público `https://github.com/ti-atomicgroup/nexo-bitrix`.

O Nexo é aberto pela URL da Onnira. O Bitrix fornece os dados e as tarefas por webhook. As contas locais do Nexo controlam o acesso à tela; use somente pessoas autorizadas de RH.

## 1. Publique na Onnira

1. Entre em [app.onnira.com](https://app.onnira.com) e crie uma aplicação a partir de um repositório GitHub.
2. Informe `https://github.com/ti-atomicgroup/nexo-bitrix` e selecione a branch `main`.
3. Escolha o runtime Next.js, diretório base `/` e configure os comandos:

   | Campo | Valor |
   | --- | --- |
   | Instalação | `npm ci` |
   | Build | `npm run build` |
   | Inicialização | `npm start` |
   | Porta | `3000` |

4. Publique a aplicação. Copie a URL HTTPS que a Onnira mostrar, por exemplo `https://seu-app.onnira.com.br`. Essa será a `NEXO_APP_URL`.

## 2. Configure as variáveis da Onnira

Na configuração da aplicação, abra **Variáveis de ambiente** (ou **Environment Variables**) e adicione:

| Nome | Valor |
| --- | --- |
| `NEXO_APP_URL` | URL HTTPS da aplicação, sem `/` no final |
| `BITRIX_PORTAL_URL` | `https://helpbr24.bitrix24.com.br` |
| `NEXO_ENCRYPTION_KEY` | Chave secreta aleatória com 64 caracteres hexadecimais |
| `NEXO_SETUP_TOKEN` | Segredo aleatório forte para proteger a configuração inicial |
| `NEXO_DATA_DIR` | `/app/.data` |
| `PORT` | `3000` |

Para gerar os dois segredos no Windows PowerShell, abra o terminal no projeto baixado e execute:

```powershell
node -e "console.log('NEXO_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex')); console.log('NEXO_SETUP_TOKEN=' + require('crypto').randomBytes(32).toString('base64url'))"
```

Copie cada valor diretamente para a variável correspondente na Onnira. Trate-os como senhas: não os envie no chat, não os coloque no Git e não os compartilhe em capturas de tela. Guarde uma cópia segura da chave de criptografia; sem ela, os webhooks armazenados não podem ser decifrados depois de uma restauração.

Ative o volume persistente da Onnira no caminho `/app/.data`. Salve as variáveis e mande a Onnira republicar/reiniciar a aplicação. A página deve abrir na URL publicada e mostrar o assistente de instalação.

## 3. Crie o webhook de entrada no Bitrix

O webhook de entrada permite que o Nexo consulte o Bitrix e crie tarefas em nome do usuário de serviço.

1. Entre no portal [helpbr24.bitrix24.com.br](https://helpbr24.bitrix24.com.br) com o usuário de serviço de RH.
2. Abra **Aplicativos → Recursos do desenvolvedor → Webhooks → Webhook de entrada**. Os nomes dos menus podem variar um pouco conforme a interface do portal.
3. Conceda os escopos `task`, `user_brief` (ou `user`), `crm` e `userfieldconfig` se for criar campos pelo assistente.
4. Crie o webhook e copie a URL completa, inclusive a parte secreta. O Bitrix só mostra essa credencial durante a criação.
5. Em outra aba, abra a URL publicada do Nexo. No assistente, cole a URL completa do webhook de entrada e o valor de `NEXO_SETUP_TOKEN`; escolha **Testar conexão**.
6. Quando a validação passar, crie o primeiro administrador local do Nexo. Vincule o mesmo usuário Bitrix que criou o webhook.

Se a validação indicar escopos ausentes, edite ou crie novamente o webhook com os escopos necessários e atualize a URL no Nexo. Se indicar acesso negado, confira as permissões efetivas do usuário de serviço no Bitrix.

## 4. Configure o processo e os modelos

No assistente do Nexo, configure o processo **Movimentações de Pessoas** ou selecione um processo que já exista. O app consulta campos e etapas disponíveis no Bitrix; nenhum ID precisa ser copiado para o código.

Depois, escolha os responsáveis de RH e TI, revise os modelos iniciais de onboarding e offboarding e ajuste atividades, prazos, instruções e obrigatoriedade. A tarefa de preparação para TI é calculada para três dias úteis antes da entrada e um dia útil antes da saída. Feriados não são descontados até haver calendário configurado.

Faça o primeiro teste com dados fictícios: inicie uma jornada manual, abra a tarefa criada no Bitrix, confira responsável, prazo e checklist e marque uma atividade concluída. O teste de offboarding também deve ser feito com uma pessoa fictícia; o Nexo registra solicitações para revogar acessos, enquanto a equipe responsável realiza e confirma as ações nos outros sistemas.

## 5. Ative o início automático (opcional)

O início manual funciona sem este passo. Para iniciar jornadas quando uma aprovação muda de etapa no Bitrix, crie um webhook de saída:

1. No Bitrix, abra a área de webhooks de saída/eventos e assine o evento `ONCRMDYNAMICITEMUPDATE`.
2. No Nexo, abra **Configurações → Conexão** e copie a URL do handler de eventos, terminada em `/api/bitrix/events`.
3. Cole essa URL no Bitrix e salve a configuração do evento.
4. Copie o token emitido/configurado para proteger o envio e registre-o nas configurações de conexão do Nexo.
5. Mude um registro fictício de movimentação para a etapa de aprovação configurada e confira se uma única jornada foi criada.

Webhook de entrada significa **Nexo chama o Bitrix**. Webhook de saída significa **Bitrix avisa o Nexo** quando o registro muda. Não use o endereço do webhook de entrada como endereço do evento.

## Se algo não funcionar

| O que você vê | O que conferir |
| --- | --- |
| Página informa que falta configuração | Confira as quatro variáveis principais (`NEXO_APP_URL`, `BITRIX_PORTAL_URL`, `NEXO_ENCRYPTION_KEY`, `NEXO_SETUP_TOKEN`), salve e reinicie na Onnira. |
| `SCOPES_MISSING` | Recrie o webhook de entrada com `task`, `user_brief` ou `user`, `crm` e, quando necessário, `userfieldconfig`; atualize a URL no Nexo. |
| Bitrix retorna 403 ou acesso negado | Confira permissões do usuário que criou o webhook. O Bitrix aplica as permissões dessa conta às operações do Nexo. |
| Início automático não acontece | Confira a URL `/api/bitrix/events`, assinatura do evento, token de saída e regra que associa a etapa de aprovação a um modelo. |
| Dados somem após republicar | Ative o volume persistente em `/app/.data` e mantenha o mesmo valor de `NEXO_ENCRYPTION_KEY`. |
| Webhook foi exposto ou perdido | Revogue-o no Bitrix, crie outro e atualize a conexão do Nexo. Nunca cole credenciais em tickets ou mensagens. |

Para suporte, anote horário, ação, mensagem/código de erro e identificador da jornada. Remova tokens, senhas e dados pessoais antes de compartilhar logs.

## Checklist final

- [ ] URL HTTPS da Onnira abre o Nexo.
- [ ] Volume persistente e variáveis estão configurados.
- [ ] Webhook de entrada passou no teste de conexão.
- [ ] Administrador local está vinculado ao usuário Bitrix correto.
- [ ] Uma jornada manual de teste criou tarefas reais no Bitrix.
- [ ] (Opcional) Evento de saída iniciou exatamente uma jornada no teste.
- [ ] Backup seguro da chave de criptografia foi guardado.

