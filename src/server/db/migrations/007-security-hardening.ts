/**
 * Endurecimento de segurança (Nexo v3, relatório de 03/11/2026):
 * - `sessions.transport`: como o token foi entregue (cookie protegido ou modo alternativo). Só vale pelo mesmo canal.
 *   As sessões antigas são apagadas: os tokens delas ficavam no localStorage. Todo mundo entra de novo uma vez.
 * - `audit_log`: além do ator local, a conta dele no Bitrix24 e a conta técnica (principal) com que o Nexo agiu.
 * - `rate_limit_hits`: limites de tentativas que sobrevivem a reinício e valem entre instâncias. A chave é um HMAC: nem
 *   e-mail nem IP ficam em texto.
 * - `security_events`: falhas e bloqueios para monitorar, sem credenciais.
 * - `journeys.offboarding_reason_sealed`: o motivo cifrado (a coluna antiga tem CHECK e não aceita o valor cifrado).
 * - `people.erased_at`: pessoa cujos dados foram excluídos a pedido; a atualização do cache não a traz de volta enquanto estiver inativa.
 */
export const migration007 = {
  id: 7,
  name: "security-hardening",
  sql: `
DELETE FROM sessions;
ALTER TABLE sessions ADD COLUMN transport TEXT NOT NULL DEFAULT 'bearer' CHECK (transport IN ('cookie','bearer'));

ALTER TABLE audit_log ADD COLUMN actor_bitrix_id TEXT;
ALTER TABLE audit_log ADD COLUMN bitrix_principal_id TEXT;
ALTER TABLE audit_log ADD COLUMN bitrix_principal_name TEXT;

CREATE TABLE rate_limit_hits (
  key_hash TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL
);
CREATE INDEX rate_limit_hits_key ON rate_limit_hits(key_hash, at_ms);
CREATE INDEX rate_limit_hits_expires ON rate_limit_hits(expires_ms);

CREATE TABLE security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  subject_hash TEXT,
  origin_hash TEXT
);
CREATE INDEX security_events_at ON security_events(at);

ALTER TABLE journeys ADD COLUMN offboarding_reason_sealed TEXT;

ALTER TABLE people ADD COLUMN erased_at TEXT;
`,
};
