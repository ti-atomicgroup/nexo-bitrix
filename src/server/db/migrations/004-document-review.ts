/**
 * Revisão dos documentos pelo RH: um arquivo recebido pode ser recusado ("pedir de novo") com o motivo.
 * O arquivo continua no Drive e anexado à tarefa (histórico), mas deixa de contar como recebido.
 */
export const migration004 = {
  id: 4,
  name: "document-review",
  sql: `
ALTER TABLE documents ADD COLUMN rejected_at TEXT;
ALTER TABLE documents ADD COLUMN rejected_reason TEXT;
`,
};
