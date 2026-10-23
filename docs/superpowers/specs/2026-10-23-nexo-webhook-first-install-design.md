# Nexo — instalação por webhook e senha RH

## Resultado

Em uma instância Onnira nova, a primeira tela pede somente a URL completa do webhook Bitrix24. O Nexo valida HTTPS, domínio Bitrix Cloud, conta ativa e escopos; identifica portal e usuário. O mesmo navegador então define e-mail e senha do primeiro RH, recebe uma sessão e entra no Nexo. A conta é vinculada automaticamente ao usuário dono do webhook. As próximas visitas usam e-mail e senha.

## Segurança do primeiro acesso

- A URL do webhook é uma credencial e nunca aparece em resposta, log ou arquivo público. Ela é cifrada no SQLite.
- O servidor gera uma chave AES aleatória por instância e a grava em arquivo privado no mesmo diretório persistente do banco. `NEXO_ENCRYPTION_KEY` ainda pode sobrescrever a chave em instalações geridas pelo publicador; uma chave existente nunca é trocada silenciosamente.
- A validação do webhook cria uma autorização de instalação aleatória, de uso único e expiração curta. Só o navegador que recebeu o cookie HttpOnly pode concluir o cadastro da senha. Após o primeiro administrador, a instalação é encerrada.
- O portal existente não pode ser substituído por outro webhook. O instalador nunca reutiliza uma sessão de outro portal.
- A origem HTTPS da aplicação vem do próprio acesso à instância Onnira (`*.onnira.com.br`) ou de `NEXO_APP_URL` explícita; localhost fica disponível no desenvolvimento. A origem é fixada na primeira abertura, com validação de `Origin` nas mutações.
- A instância continua isolada por cliente. Não se presume SSO da Onnira nem publicação no Marketplace antes da documentação de publicador.

## Experiência

1. Conectar Bitrix: explicação curta, um campo para a URL do webhook, botão “Conectar Bitrix”.
2. Criar acesso RH: mostrar portal e nome da conta validada; pedir e-mail e senha com requisitos claros. O ID Bitrix é preenchido pelo servidor.
3. Entrar no Nexo: criar sessão e modelos iniciais. Configurações avançadas de projeto e gatilhos ficam disponíveis na seção Configurações; pendências necessárias para operações específicas são explicadas ali.

Não exigir código de instalação, token ou variáveis de ambiente ao cliente. A persistência do volume Onnira será homologada em etapa separada, conforme combinado com o usuário.
