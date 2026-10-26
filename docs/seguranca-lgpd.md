# Segurança e LGPD

## Dados que o Nexo guarda

| Dado | Por quê | Onde |
|---|---|---|
| Nome, e-mail, cargo e ID Bitrix das pessoas | Montar jornadas e mostrar responsáveis | SQLite (cache dos usuários do Bitrix24) |
| Datas de entrada e de saída, trilha e andamento das atividades | Acompanhar a jornada | SQLite |
| Motivo do desligamento (voluntário/involuntário) | Escolher a trilha certa | SQLite, visível só para o RH, nunca na página do colaborador |
| Inventário de acessos e equipamentos (ex.: "Notebook · 4471") | Garantir a devolução e a revogação na saída | SQLite |
| Contas do RH no Nexo (nome, e-mail, hash da senha) | Login | SQLite (senha com scrypt) |
| Endereço do webhook do Bitrix24 | Integração | SQLite, **cifrado** com AES-256-GCM |

O Nexo **não** guarda CPF, RG, dados bancários, salários, documentos pessoais nem conteúdo de entrevistas.

## Proteções

- **Webhook cifrado.** AES-256-GCM com uma chave da instância gerada automaticamente (arquivo com permissão `0600`
  na pasta de dados) ou informada em `NEXO_ENCRYPTION_KEY`. O endereço nunca é devolvido ao navegador; na tela
  aparece mascarado (`https://empresa.bitrix24.com.br/rest/1/••••••/`).
  - Limitação conhecida: a chave fica no mesmo volume do banco. Para separar, defina `NEXO_ENCRYPTION_KEY` no ambiente.
- **Sessões.** Token aleatório de 256 bits enviado no cabeçalho `Authorization`. O banco guarda só o hash.
  - Validade: 12 horas, renovadas com o uso, até no máximo 7 dias.
  - Não há cookies, o que evita CSRF dentro do iframe da Onnira.
- **Senhas.** scrypt com sal aleatório. Cinco tentativas erradas bloqueiam o login por 15 minutos.
- **Papéis.** Administrador (instala, conecta o Bitrix24, gerencia usuários e automações) e RH (opera jornadas e trilhas).
- **Link do colaborador.** Token de 256 bits, guardado só como hash.
  - Mostra apenas as atividades marcadas como visíveis ao colaborador.
  - Expira 30 dias depois do fim da jornada e pode ser revogado a qualquer momento.
  - A página não é indexada (`noindex`), não envia Referer e não fica em cache.
- **Instalação protegida.** O assistente só funciona enquanto não existe administrador, e a criação do primeiro
  acesso fica presa à aba que validou o webhook (token de instalação de 30 minutos).
- **Cabeçalhos.** Content-Security-Policy restritiva, com `frame-ancestors` limitado ao painel da Onnira, mais `nosniff` e `Referrer-Policy`.
- **Registros.** Logs em JSON sem segredos (o endereço do webhook nunca é registrado; só o nome do método do Bitrix24).
  O histórico de cada jornada mostra quem fez o quê e quando.

## Permissões no Bitrix24

As ações rodam com as permissões da conta dona do webhook, limitadas aos escopos concedidos ([escopos.md](escopos.md)).
As tarefas ficam no projeto privado "Nexo · Jornadas" e seguem as regras de acesso do próprio Bitrix24: cada
responsável vê as suas tarefas, e o gestor entra como observador nas tarefas da jornada da sua equipe.

## Retenção

- Jornadas concluídas ficam disponíveis para consulta do RH.
- O link do colaborador expira 30 dias depois do fim da jornada.
- Para apagar os dados de uma pessoa, o administrador pode remover a jornada e o inventário. A exportação e a exclusão completa por pessoa estão previstas na próxima versão.
