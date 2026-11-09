# O que confirmar com a Onnira

O código do Nexo protege os arquivos que ele controla. O disco, os backups da plataforma e a borda são da Onnira.
A documentação pública (`onnira.com/docs`, lida em 04/11/2026) cobre a API e os deploys, mas não diz nada sobre os pontos abaixo.
Enquanto o suporte não responder, trate as perguntas como **não confirmadas**.

## O que já foi observado

Observado no painel e nos testes de até 05/11/2026. Pode mudar com a plataforma: `/diagnostico` mostra o estado atual.

| Ponto | O que se viu |
|---|---|
| Acesso de fora do painel | Qualquer caminho, inclusive `/j/*` e `/api/probe`, responde 403 ("Acesso permitido somente dentro da Onnira"). **O link pessoal não abre para o colaborador** enquanto isso não for liberado. |
| Cabeçalhos | A borda remove `Authorization`. `X-Nexo-Session` chega ao app. |
| Cookie protegido | Com a v3, dentro do painel, `/diagnostico` mostra "Bloqueado aqui" e o Nexo usa o modo alternativo. Pelo F12, em 09/11: a borda entrega o `Set-Cookie` ao navegador, o navegador o aceita e o reenvia com `X-Nexo-Client` e `Sec-Fetch-Site: same-origin`, mas o app não recebe o cookie. **A borda não repassa ao app os cookies do navegador**, só usa o próprio (`ONNIRA_CLOUD_SESSION`). |
| Sessão do painel | O painel abre o app com um token que vale cerca de 10 minutos. Depois disso, as chamadas levam 403 até recarregar a página e abrir o app de novo. |
| Dados | `/app/.data` sobrevive a reinícios e republicações, e as permissões ficam restritas ao processo. |
| Variáveis de ambiente | O formulário do painel só edita nome, repositório, branch, diretório e plano. Não há onde definir `NEXO_ENCRYPTION_KEY`. |
| Publicação | O push não dispara o deploy: é preciso "Salvar e republicar", que leva cerca de 6 minutos. `RUNNING` não diz qual código está no ar: confira a versão nos logs. |
| Versão antiga depois de republicar | Já aconteceu mais de uma vez. Em 26/10, a causa foi falta de memória no build. Em 05/11, um app existente refez o build e seguiu com o código antigo, inclusive com branch nova e outra URL. Um app criado na hora pegou a versão certa, mas, ao republicar esse mesmo app com um commit novo em outra branch, o código novo não entrou: a resposta da API seguiu no formato antigo, conferida no F12. Hoje, só a criação do app mostrou trazer o código atual. A causa não está apurada. |
| Logs | O painel mostra a saída resumida do deploy, sem o clone. A API pública promete logs de build, com chave criada em Minha conta → Segurança → Integração por API. Isso ainda não foi testado. |

## Mensagem para o suporte

> Olá! Temos o app Nexo (dados de RH, com dados pessoais) no Onnira Cloud. Precisamos de ajuda em três assuntos, em ordem de urgência.
>
> **1. Acesso externo ao link do colaborador.** Os colaboradores recebem um link pessoal por WhatsApp ou e-mail, em `/j/<token>`, e precisam abri-lo sem conta na Onnira. Hoje esse caminho responde 403 ("Acesso permitido somente dentro da Onnira"). É possível liberar só o caminho `/j/*` por aplicação? O restante deve continuar protegido.
>
> **2. Sessão no iframe.** O app grava um cookie `__Host-` com `Secure`, `SameSite=None` e `Partitioned`. O navegador o recebe e o reenvia (conferido no F12), mas o app não o recebe: pelo visto, a borda repassa só o `ONNIRA_CLOUD_SESSION`. Sabemos também que ela remove `Authorization`.
> - Vocês confirmam que a borda remove o cabeçalho `Cookie`? Há como repassar ao app os cookies dele, ao menos os com prefixo `__Host-nexo_`?
> - A borda injeta scripts no HTML?
>
> **3. Conformidade (LGPD).**
> 1. O volume persistente (`.data`) é cifrado em repouso? Com qual tecnologia, e quem guarda as chaves?
> 2. Quem da Onnira pode ler o conteúdo do volume, e esse acesso fica registrado?
> 3. A plataforma faz backup do volume? Com que frequência, por quanto tempo, cifrado e em que região?
> 4. Quando uma aplicação é excluída, o volume e os backups dela são apagados? Em quanto tempo?
> 5. No `X-Forwarded-For` que chega ao app, quantos proxies a borda acrescenta, e o último endereço da lista é o do cliente?
> 6. Existe limite de requisições na borda, e podemos configurá-lo por aplicação?
> 7. O painel não tem campo de variáveis de ambiente. Vocês podem definir uma variável secreta na aplicação (`NEXO_ENCRYPTION_KEY`), fora do volume, ou ela pode ser definida pela API?

Se um app existente continuar com o código antigo depois de republicar, acrescente à mensagem o ID dele, o commit esperado e o horário dos deploys, e peça para verificar qual commit foi clonado e se há commit fixado ou cópia da fonte em cache.

## O que muda conforme a resposta

| Pergunta | Se a resposta for não | O que fazer |
|---|---|---|
| 1 | `/j/*` não pode ser liberado | O colaborador não acessa o link fora do painel. A etapa dele precisa ser acompanhada pelo RH, ou o Nexo precisa de outra hospedagem para esse caminho. |
| 2, cookies | A borda altera cookies | O Nexo continua no modo alternativo: sessão de até 24 horas, com o token acessível ao JavaScript da aba. A CSP passa a ser a principal defesa contra roubo do token. |
| 2, scripts | A borda injeta script | A CSP bloqueia o script injetado. Se isso quebrar o painel, é preciso combinar a origem do script com a Onnira. |
| 3.1 e 3.2 | Volume sem cifra ou sem controle de acesso | Os campos de maior risco continuam cifrados pelo Nexo, mas a chave fica no mesmo volume até a pergunta 3.7 ser resolvida. Registre o risco residual: nomes e datas ficam em texto. |
| 3.3 e 3.4 | Sem backup da plataforma, ou sem prazo de descarte | Guarde a cópia cifrada de Ajustes → Dados pessoais em outro lugar, com a frequência que a empresa precisar. |
| 3.5 | Número de proxies diferente de 1 | Ajuste `NEXO_TRUSTED_PROXY_HOPS`. Com o valor errado, as origens podem se misturar e o limite por origem bloqueia antes da hora. |
| 3.6 | Sem limite na borda | Os limites do próprio Nexo continuam valendo. |
| 3.7 | Sem variável secreta | A chave fica em `.nexo-key`, no volume, e um vazamento do volume inteiro leva os dados e a chave juntos. |
