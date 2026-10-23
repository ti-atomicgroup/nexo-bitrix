# Nexo na Onnira Cloud e instalação pelo Marketplace

## Experiência desejada

O cliente escolhe o Nexo no Marketplace da Onnira. A Onnira hospeda uma instalação isolada do app na Cloud IA. Ao abrir pela primeira vez, a pessoa responsável conecta seu Bitrix24 informando um webhook REST de entrada criado no portal; o Nexo valida a conta e os escopos, identifica o domínio do portal e guarda a URL criptografada. Em seguida, configura o acesso RH, o projeto de tarefas e os gatilhos. O cliente não publica repositórios nem configura variáveis de ambiente.

## Escopo desta implementação

- Retirar `BITRIX_PORTAL_URL` dos pré-requisitos de hospedagem. Extrair o portal exclusivamente da URL do webhook informada no Nexo, exigir HTTPS, domínio Bitrix24 Cloud permitido, caminho REST esperado e ausência de parâmetros ou credenciais extras.
- Depois de validado, fixar esse portal na instalação persistida. Rejeitar webhook de outro portal; renovar a credencial do mesmo portal continua possível.
- Recuperar o portal persistido antes de iniciar autenticação, sincronização ou operações Bitrix após reinício.
- Apresentar um primeiro passo didático para obter e validar o webhook, com permissões necessárias. Dados de hospedagem remanescentes são responsabilidade técnica do publicador.
- Atualizar o manual distinguindo publicação técnica e configuração realizada pelo cliente. A ficha do Marketplace descreverá o app como hospedado na Onnira.

## Limite externo

O Marketplace visível permite instalar apps, mas não expõe submissão pública nem o contrato de identidade e provisionamento por instalação. A publicação no catálogo depende das instruções/acesso de publicador da Onnira. Antes de remover o código de instalação ou permitir a criação da primeira conta RH sem ele, é necessário um mecanismo verificável da Onnira que identifique quem instalou a instância. Não presumir SSO ou cabeçalhos não documentados.

## Verificação

Testar conexão de portal não pré-configurado, bloqueio de URL maliciosa e de troca de portal, recuperação após reinício, validação dos eventos no domínio fixado, renderização da tela de conexão e regressões de domínio, navegador, tipos, lint e build.
