/**
 * Pedido e envio de documentos pelo link pessoal.
 * - `documents` (JSON) nas atividades: o que o RH pede (formato `DocumentRequest` de src/shared/contracts.ts).
 * - Tabela `documents`: cada arquivo recebido. O arquivo fica cifrado na pasta de dados só até chegar ao Drive do projeto
 *   no Bitrix24 (`local_file` volta a nulo); depois o Nexo guarda apenas nome, tamanho, hash e o vínculo com o Bitrix.
 * - A atividade inicial "Envie seus documentos" passa a pedir a lista padrão (trilhas e jornadas em andamento).
 */
const DEFAULT_REQUESTS = JSON.stringify([
  { key: "documento-com-foto", name: "Documento com foto", hint: "RG ou CNH, frente e verso.", required: true },
  { key: "comprovante-residencia", name: "Comprovante de residência", hint: "Conta de luz, água ou internet dos últimos 3 meses.", required: true },
  { key: "dados-bancarios", name: "Dados bancários", hint: "Print do app do banco com agência e conta.", required: false },
]).replace(/'/g, "''");

export const migration002 = {
  id: 2,
  name: "documents",
  sql: `
ALTER TABLE template_activities ADD COLUMN documents TEXT NOT NULL DEFAULT '[]';
ALTER TABLE journey_activities ADD COLUMN documents TEXT NOT NULL DEFAULT '[]';

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  journey_id TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES journey_activities(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received','sent','error')),
  local_file TEXT,
  drive_file_id TEXT,
  bitrix_url TEXT,
  attachment_id TEXT,
  error TEXT,
  received_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX documents_activity ON documents(activity_id, request_key);
CREATE INDEX documents_journey ON documents(journey_id);

UPDATE template_activities SET documents = '${DEFAULT_REQUESTS}'
  WHERE title = 'Envie seus documentos' AND role = 'colaborador' AND visibility = 'employee' AND documents = '[]';
UPDATE journey_activities SET documents = '${DEFAULT_REQUESTS}'
  WHERE title = 'Envie seus documentos' AND role = 'colaborador' AND visibility = 'employee' AND documents = '[]'
    AND status NOT IN ('done','cancelled');
`,
};
