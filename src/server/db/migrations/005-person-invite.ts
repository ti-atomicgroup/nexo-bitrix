/**
 * Convite para o Bitrix24 (`user.add`): a pessoa sem conta fica "enviando" até o Bitrix24 devolver a conta nova,
 * ou "falhou" com o motivo para o RH tentar de novo ou vincular à mão.
 */
export const migration005 = {
  id: 5,
  name: "person-invite",
  sql: `
ALTER TABLE people ADD COLUMN invite_status TEXT;
ALTER TABLE people ADD COLUMN invite_error TEXT;
`,
};
