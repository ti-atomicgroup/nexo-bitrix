# API do Nexo para o chat da Onnira

## Objetivo

Permitir que um modelo de IA usado no chat da Onnira consulte o Nexo e execute operações autorizadas de RH. A API deve ser configurável como conector HTTP/OpenAPI na Onnira, sem depender de uma sessão de navegador e sem expor o webhook Bitrix.

## Decisões

- Expor endpoints REST sob `/api/chat/v1` e o contrato público `/api/chat/openapi.json`.
- Proteger as rotas operacionais com `Authorization: Bearer <NEXO_CHAT_API_KEY>`. A variável é opcional para não bloquear a instalação existente; sem ela, a API de chat retorna indisponível. A mesma chave fica em segredo no servidor Nexo e no conector Onnira.
- Executar operações com a identidade RH local associada à conta proprietária do webhook Bitrix. Exigir que essa conta esteja ativa e tenha papel `admin` ou `rh`; passar as ações pelos mesmos serviços de domínio usados pela interface para preservar validação, idempotência, sincronização com Bitrix e auditoria.
- Oferecer consultas de trabalho de hoje, jornadas, detalhes da jornada, modelos e busca limitada de colaboradores ativos; início de jornada com modelo existente; ações de início/conclusão/reabertura de atividade e checklist; conclusão controlada e pausa/retomada de jornada.
- Não expor login, configuração, administração de usuários, criação/edição de modelos, credenciais Bitrix ou uma operação genérica de execução. Conclusão de tarefa verifica checklists; conclusão de jornada verifica obrigatoriedades e aprovações pendentes.
- Identificar a origem das auditorias como `Onnira Chat · <usuário RH>` e não registrar o segredo. Chave inválida retorna 401; chave válida sem identidade RH retorna 403/503 com mensagem segura.
- O contrato OpenAPI descreve operações, autenticação e schemas para facilitar a configuração no conector. A documentação da API pública Onnira disponível em `https://onnira.com/docs` descreve o consumo de modelos pela Onnira, não o registro de APIs de terceiros como ferramentas; por isso este trabalho entrega a API compatível e orienta que ela seja conectada pelo recurso de conectores disponível na conta.

## Aceite

1. Sem chave configurada ou com chave errada, nenhuma operação operacional executa.
2. Uma identidade webhook sem conta Nexo RH ativa não executa operações de chat.
3. O OpenAPI é válido, revela apenas o contrato, e todas as operações protegidas declaram bearer auth.
4. Consultas respeitam visibilidade e removem detalhes internos de RH quando aplicável.
5. Ações chamam o serviço de jornadas, gravam tarefas/checklists no Bitrix e criam auditoria; repetição de início usa `requestId` idempotente já aplicado pelo domínio.
6. Concluir tarefa/jornada mantém as regras de checklist, aprovação e obrigatoriedade.
7. `npm test`, `npm run typecheck`, `npm run lint` e `npm run build` passam.

## Limites

A integração efetiva depende de a conta Onnira oferecer um conector HTTP/OpenAPI que alcance a URL HTTPS publicada do Nexo e permita guardar um header Bearer como segredo. O contrato e os passos de ligação ficam preparados; a chave de produção e a URL precisam ser configuradas na Onnira após o deploy.
