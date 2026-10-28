/**
 * Cargo da pessoa na jornada, informado pelo RH ao criar: aparece na jornada, nas boas-vindas do Feed e no convite
 * para o Bitrix24. Fica na jornada (e não na pessoa) porque a atualização das pessoas traz o cargo do Bitrix24 por cima.
 */
export const migration006 = {
  id: 6,
  name: "journey-position",
  sql: `
ALTER TABLE journeys ADD COLUMN person_position TEXT;
`,
};
