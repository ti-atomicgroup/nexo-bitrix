# O que confirmar com a Onnira

O código do Nexo protege os arquivos que ele controla. O disco, os backups da plataforma e a borda são da Onnira.
A documentação pública (`onnira.com/docs`, lida em 04/11/2026) cobre a API e os deploys, mas não diz nada sobre estes pontos.
Enquanto o suporte não responder, trate-os como **não confirmados**.

## Mensagem para o suporte

> Olá! Publicamos o app Nexo (dados de RH, com dados pessoais) no Onnira Cloud e precisamos confirmar, para a nossa conformidade com a LGPD:
>
> 1. O volume persistente (`.data`) é cifrado em repouso? Com qual tecnologia, e quem guarda as chaves?
> 2. Quem da Onnira pode ler o conteúdo do volume, e esse acesso fica registrado?
> 3. A plataforma faz backup do volume? Com que frequência, por quanto tempo, cifrado e em que região?
> 4. Quando uma aplicação é excluída, o volume e os backups dela são apagados? Em quanto tempo?
> 5. A borda repassa os cabeçalhos `Cookie` e `Set-Cookie` para o app, sem alterar? Ela injeta scripts no HTML?
> 6. No `X-Forwarded-For` que chega ao app, quantos proxies a borda acrescenta, e o último endereço da lista é o do cliente?
> 7. Existe limite de requisições na borda, e podemos configurá-lo por aplicação?
> 8. O suporte pode definir uma variável de ambiente secreta na aplicação (usaremos `NEXO_ENCRYPTION_KEY`), fora do volume?

## O que muda conforme a resposta

| Pergunta | Se a resposta for não | O que fazer |
|---|---|---|
| 1 e 2 | Volume sem cifra ou sem controle de acesso | Os campos de maior risco continuam cifrados pelo Nexo. Defina `NEXO_ENCRYPTION_KEY` para a chave não ficar no volume. Registre o risco residual: nomes e datas ficam em texto. |
| 3 e 4 | Sem backup da plataforma, ou sem prazo de descarte | Guarde a cópia cifrada de Ajustes → Dados pessoais em outro lugar, com a frequência que a empresa precisar. |
| 5 | A borda altera cookies | O Nexo cai sozinho no modo alternativo. `/diagnostico` mostra qual modo está em uso. |
| 5 | A borda injeta script | A CSP bloqueia o script injetado. Se isso quebrar o painel, é preciso combinar a origem do script com a Onnira. |
| 6 | Número de proxies diferente de 1 | Ajuste `NEXO_TRUSTED_PROXY_HOPS`. Com o valor errado, as origens podem se misturar e o limite por origem bloqueia antes da hora. |
| 7 | Sem limite na borda | Os limites do próprio Nexo continuam valendo. |
| 8 | Sem variável secreta | A chave fica em `.nexo-key`, no volume, e um vazamento do volume inteiro leva os dados e a chave juntos. |
