# Segurança e LGPD

## Dados que o Nexo guarda

| Dado | Por quê | Onde e como |
|---|---|---|
| Nome, cargo e ID Bitrix das pessoas | Montar jornadas e mostrar responsáveis | SQLite, em texto (ordenação e busca; vêm do Bitrix24) |
| E-mail das pessoas e dos candidatos | Convite e vínculo de contas | SQLite, **cifrado** |
| Datas de entrada e de saída, trilha e andamento das atividades | Acompanhar a jornada | SQLite, em texto |
| Motivo do desligamento e motivo de cancelamento | Escolher a trilha certa; nunca aparecem na página do colaborador | SQLite, **cifrado** |
| Inventário de acessos e equipamentos: detalhe, motivo de dispensa e o checklist que copia esses itens | Garantir a devolução e a revogação na saída | SQLite, **cifrado** (o nome genérico do item, como "Notebook", fica em texto) |
| Texto do histórico de cada jornada | Saber quem fez o quê; costuma citar motivo, e-mail e item | SQLite, **cifrado** |
| Contas do RH no Nexo (nome, e-mail, hash da senha) | Login | SQLite (senha com scrypt; o e-mail fica em texto porque é a chave do login) |
| Endereço do webhook do Bitrix24 | Integração | SQLite, **cifrado** |
| Documento enviado pelo link: nome do arquivo e motivo de recusa | Mostrar ao RH o que chegou | SQLite, **cifrado** (tamanho, hash e situação ficam em texto) |
| Contagem de tentativas e eventos de segurança | Limites e monitoramento | SQLite, só como HMAC: nem e-mail nem IP ficam em texto |

O Nexo **não** guarda CPF, RG, dados bancários, salários nem conteúdo de entrevistas.

Cifrado significa AES-256-GCM com a chave da instância: quem copia só o banco ou um backup não lê esses campos.
A cifra é por campo, não do banco inteiro. Os nomes ficam em texto de propósito, porque o Nexo ordena e busca por eles.
O que é apagado ou substituído não fica legível no arquivo: o banco usa `secure_delete`, e a instalação vinda da v2 é reescrita ao cifrar os dados antigos.

### Documentos enviados pelo colaborador

- O RH escolhe, na trilha, quais documentos pedir. O colaborador envia cada um pelo link pessoal (PDF ou foto, até 10 MB).
  O tipo é conferido pelo conteúdo do arquivo, não pelo nome.
- **O arquivo mora no Bitrix24**, na pasta "Nexo · Documentos" do Drive do projeto privado, com uma subpasta por
  jornada, e fica anexado à tarefa da atividade. Quem vê é quem tem acesso ao projeto e à tarefa no Bitrix24.
- No Nexo, o arquivo fica **cifrado** (AES-256-GCM) na pasta de dados só até chegar ao Bitrix24, normalmente menos
  de um minuto, e depois é apagado. Se o envio falhar (ex.: falta a permissão Drive), o arquivo continua cifrado até
  o RH tentar de novo.
- Limite de 20 envios a cada 10 minutos por link.
- O RH pode **pedir de novo** um arquivo (ex.: foto ilegível) com o motivo, que o colaborador vê no link. O arquivo recusado
  continua no Drive e anexado à tarefa, como histórico, mas deixa de contar como recebido. Para apagá-lo, use o Bitrix24.

## Proteções

- **Webhook cifrado.** AES-256-GCM com uma chave da instância gerada automaticamente (arquivo com permissão `0600`
  na pasta de dados) ou informada em `NEXO_ENCRYPTION_KEY`. O endereço nunca é devolvido ao navegador; na tela
  aparece mascarado (`https://empresa.bitrix24.com.br/rest/1/••••••/`).
  - Limitação conhecida: sem `NEXO_ENCRYPTION_KEY`, a chave fica no mesmo volume do banco. Quem leva o volume inteiro leva
    os dois. Para separar, defina a variável no ambiente. O painel da Onnira não tem campo para isso: é preciso pedir ao suporte ou verificar a API.
    Ajustes → Diagnóstico mostra onde a chave está.
- **Sessões.** Token aleatório de 256 bits. O banco guarda só o hash.
  - **Com cookie** (padrão): `__Host-nexo_session`, com `HttpOnly`, `Secure`, `SameSite=None` e `Partitioned`, feito para funcionar em iframe.
    O token nunca passa pelo JavaScript: um XSS não consegue lê-lo. Validade de 12 horas, renovadas com o uso, até no máximo 7 dias.
    **Na Onnira vale o modo alternativo:** o navegador aceita e reenvia o cookie, mas a borda não o repassa ao app (conferido em 09/11/2026, [onnira-seguranca.md](onnira-seguranca.md)).
  - **Proteção contra CSRF.** O cookie só vale com o cabeçalho `X-Nexo-Client` e, quando o navegador informa, com
    `Sec-Fetch-Site: same-origin`. Outro site não consegue enviar esse cabeçalho sem CORS, que o Nexo não libera. Qualquer escrita vinda de outro
    site é recusada, mesmo em rotas públicas como o login.
  - **Modo alternativo.** Antes de entrar, o Nexo testa se o navegador e a hospedagem aceitam o cookie. Se não aceitarem (Safari em
    iframe, por exemplo), o token fica só na memória e no `sessionStorage` da aba, nunca no `localStorage`, e a sessão dura no máximo 24 horas.
    Nesse modo, o JavaScript da aba alcança o token: a CSP passa a ser a principal defesa contra um XSS.
  - Cada token só vale pelo canal em que foi entregue.
- **Content-Security-Policy.** Com nonce novo a cada página (`src/proxy.ts`) e sem `unsafe-inline` nem `unsafe-eval` em produção, nem para scripts, nem
  para estilos. A API responde com `default-src 'none'`. `frame-ancestors` limitado ao painel da Onnira, mais `nosniff` e `Referrer-Policy`.
- **Senhas.** scrypt com sal aleatório. Cinco tentativas erradas bloqueiam o login por 15 minutos.
  - **Senha temporária.** Acesso criado em Ajustes → Equipe, ou com a senha redefinida ali, entra com senha temporária. O servidor recusa com 403 (`PASSWORD_CHANGE_REQUIRED`)
    toda rota com sessão até a troca, salvo ver a própria conta, trocar a senha e sair. A nova senha precisa ser diferente da atual, e a tela pede a troca antes de abrir qualquer página.
  - `npm run senha:redefinir`, no servidor, grava a senha digitada por quem tem acesso à máquina: ela não é temporária e não exige troca.
- **Limites de tentativas.** Gravados no SQLite: continuam valendo depois de reiniciar e entre instâncias que dividem o volume.
  - Login: 5 por conta e 30 por origem, a cada 15 minutos. Sem teto geral, para ninguém conseguir trancar o login de todos.
  - Instalação: 20 conexões no total e 10 por origem, a cada 10 minutos.
  - Sonda pública: 30 por origem e 300 no total, por minuto.
  - A origem é o `X-Forwarded-For`, contado da direita. `NEXO_TRUSTED_PROXY_HOPS` diz quantos proxies há na frente do Nexo (padrão: 1).
  - Com o Nexo exposto direto, sem proxy, use `NEXO_TRUSTED_PROXY_HOPS=0`: o cabeçalho é ignorado, porque o cliente poderia forjá-lo, e todos dividem a mesma chave de origem.
  - Se o banco falhar, a contagem segue na memória até ele voltar.
- **Monitoramento.** Falhas de login, bloqueios e excessos ficam em `security_events` por 90 dias, só com hashes, nunca credenciais.
  Ajustes → Diagnóstico mostra a contagem das últimas 24 horas, e bloqueios e excessos também vão para o log, no máximo uma linha por minuto. A tabela tem teto de 10 mil linhas, para uma inundação não encher o disco.
- **Destino do Bitrix24 (SSRF).** A mesma política no worker e no transporte direto (`scripts/lib/bitrix-policy.mjs`):
  - só `empresa.bitrix24.<zona oficial>`; portal em domínio próprio só listado em `NEXO_BITRIX_ALLOWED_HOSTS`, no servidor, nunca pela interface;
  - só https, sem porta nem usuário, só em `/rest/`, sem seguir redirecionamentos;
  - o DNS é conferido a cada conexão, e a conexão usa o endereço conferido. Endereço privado ou reservado, IPv4 ou IPv6, não recebe a chamada,
    mesmo que o nome tenha sido trocado depois da validação (rebinding).
- **Diagnóstico.** `/api/probe` é público e só responde se a API e o banco estão de pé e se os cabeçalhos chegaram. Não grava e não chama ninguém.
  O ambiente do servidor (`/api/probe/full`) é só para a administração, sem caminhos, pid nem cabeçalhos. `/health` diz só que o processo está vivo.
- **Papéis e permissões no Bitrix24.** Veja a seção abaixo e a matriz em [permissoes.md](permissoes.md).
- **Link do colaborador.** Token de 256 bits, guardado só como hash.
  - Mostra apenas as atividades marcadas como visíveis ao colaborador.
  - Expira 30 dias depois do fim da jornada e pode ser revogado a qualquer momento.
  - A página não é indexada (`noindex`), não envia Referer e não fica em cache.
- **Instalação protegida.** O assistente só funciona enquanto não existe administrador, e a criação do primeiro
  acesso fica presa à aba que validou o webhook (token de instalação de 30 minutos).
- **Registros.** Logs em JSON sem segredos (o endereço do webhook nunca é registrado; só o nome do método do Bitrix24).
  O histórico mostra quem fez o quê e quando, com a conta da pessoa no Bitrix24 e a conta técnica com que o Nexo agiu.

## Permissões no Bitrix24

As ações rodam com as permissões da conta dona do webhook, limitadas aos escopos concedidos ([escopos.md](escopos.md)).
O Nexo não usa OAuth por pessoa: fala com o portal por esse webhook. Por isso, antes de agir por alguém do RH, ele faz no servidor
uma **validação equivalente**. O modelo completo está em [permissoes.md](permissoes.md).

As tarefas ficam no projeto privado "Nexo · Jornadas" e seguem as regras de acesso do próprio Bitrix24: cada
responsável vê as suas tarefas, e o gestor entra como observador nas tarefas da jornada da sua equipe.

## Pasta de dados

- A pasta fica com permissão `0700` e os arquivos com `0600`: só o usuário do processo lê e grava. O banco já nasce fechado, e tudo é conferido a
  cada abertura. Ajustes → Diagnóstico mostra o que ainda estiver aberto. Em Windows, quem protege é a ACL da pasta do usuário.
- A pasta contém o banco, a chave da instância (se não estiver no ambiente), documentos em trânsito e as cópias de segurança.
- A cifragem e o acesso ao volume em si são da hospedagem. O que confirmar com a Onnira está em [onnira-seguranca.md](onnira-seguranca.md).

## Cópia de segurança

- **Automática.** Uma por dia, feita pelo próprio Nexo, com um retrato consistente do banco cifrado com AES-256-GCM, em `backups/` na pasta de dados.
- **Retenção.** 14 dias (`NEXO_BACKUP_KEEP_DAYS`, de 1 a 365). Depois disso, o arquivo é apagado.
- **Fora do volume.** Em Ajustes → Dados pessoais, a administração baixa uma cópia cifrada, sempre nova, e o download fica registrado.
  A cópia automática protege de banco corrompido ou publicação com defeito, mas não de perder o volume: para isso, guarde uma cópia fora dele.
- **Chave.** Sem a chave da instância, a cópia não abre. Se a chave estiver só no volume e ele se perder, as cópias também se perdem. Para que a cópia
  externa sirva, defina `NEXO_ENCRYPTION_KEY` e guarde a chave em outro lugar seguro.
- **Restaurar.** Numa máquina com o Nexo parado:

  ```bash
  npm run backup:restaurar -- nexo-AAAA-MM-DD.sqlite.enc restaurado.sqlite
  ```

  O comando nunca sobrescreve um arquivo. Confira o resultado antes de trocar o banco.

## Retenção e descarte

| O quê | Prazo | Como sai |
|---|---|---|
| Jornadas encerradas, com atividades e documentos | 24 meses (Ajustes → Dados pessoais, de 12 a 120 meses) | Exclusão automática no cuidado diário, registrada no histórico |
| Registro de atividades | O mesmo prazo das jornadas | Exclusão automática |
| Inventário e cadastro de quem não tem mais jornada | Com a última jornada da pessoa | Exclusão automática. Quem segue ativo no portal mantém o cadastro e o inventário, que ainda vale para a saída. Item que não voltou nunca sai sozinho: é pendência, não histórico |
| Link do colaborador | 30 dias depois do fim da jornada | Deixa de abrir |
| Sessões | Quando vencem | Exclusão automática |
| Eventos de segurança | 90 dias | Exclusão automática |
| Trabalhos da fila (texto cifrado) | 7 dias (concluídos) ou 90 dias (com falha) | Exclusão automática |
| Candidatos dispensados, detectados no CRM | O mesmo prazo das jornadas | Nome, e-mail e link saem da detecção; a marca fica, para o registro não ser detectado de novo |
| Cópias de segurança | 14 dias | Exclusão automática |

## Direitos do titular

Em Ajustes → Dados pessoais, a administração procura a pessoa por nome ou e-mail, inclusive candidatos e contas desativadas.

- **Exportar** entrega um arquivo JSON com tudo o que o Nexo guarda sobre ela: jornadas, atividades, documentos, histórico e inventário.
- **Excluir** pede o nome digitado e não tem volta. Apaga jornadas, atividades, documentos em trânsito, inventário e trabalhos da fila, e limpa o texto do histórico.
  A linha do histórico continua (quem fez e quando), sem o conteúdo.
  - Com jornada em andamento, a exclusão espera o cancelamento ou a conclusão. Com acesso ativo ao Nexo, espera a desativação; depois, o acesso perde nome e e-mail, e o histórico mostra "Acesso removido".
  - A pessoa sai dos responsáveis padrão. As detecções do CRM com o mesmo e-mail ficam sem nome nem e-mail; o registro continua no CRM.
  - O recibo lista as tarefas e os arquivos que **continuam no Bitrix24**. O Nexo não apaga nada lá: quem responde pelo portal decide.
  - As cópias de segurança guardam os dados até vencerem, em no máximo 14 dias.
  - Quem continua ativo no Bitrix24 reaparece na lista de pessoas na próxima atualização, só com o que vem de lá. Quem está desativado não volta.
  - O nome da pessoa como responsável em jornadas de outras pessoas continua lá, porque faz parte do registro delas.
