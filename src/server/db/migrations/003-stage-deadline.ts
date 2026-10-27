/**
 * Data-limite das etapas "quando a etapa anterior terminar".
 * - `release_latest_offset_days` (nulo = sem limite): libera nessa data mesmo que a anterior não tenha terminado, para
 *   uma tarefa esquecida não travar a jornada. Conta a partir da data-âncora, na mesma unidade da etapa.
 * - As trilhas iniciais ganham o limite em "Primeiras semanas" (2 dias úteis depois do 1º dia).
 * - "Envie seus documentos" troca o texto antigo (de antes do envio pelo link) nas trilhas e jornadas em andamento.
 */
const OLD_DOCUMENTS_TEXT = "Envie ao RH os documentos pedidos na mensagem de boas-vindas. Se tiver qualquer dúvida, fale com o RH.";
const NEW_DOCUMENTS_TEXT = "Envie cada documento abaixo por aqui mesmo: foto nítida do celular ou PDF. Se tiver qualquer dúvida, fale com o RH.";

export const migration003 = {
  id: 3,
  name: "stage-deadline",
  sql: `
ALTER TABLE template_stages ADD COLUMN release_latest_offset_days INTEGER;

UPDATE template_stages SET release_latest_offset_days = 2, release_offset_unit = 'business'
WHERE release_mode = 'after_previous' AND name = 'Primeiras semanas' AND release_offset_days = 0;

UPDATE template_activities SET instructions = '${NEW_DOCUMENTS_TEXT}'
WHERE instructions = '${OLD_DOCUMENTS_TEXT}' AND documents <> '[]';

UPDATE journey_activities SET instructions = '${NEW_DOCUMENTS_TEXT}'
WHERE instructions = '${OLD_DOCUMENTS_TEXT}' AND documents <> '[]' AND status NOT IN ('done','cancelled');
`,
};
