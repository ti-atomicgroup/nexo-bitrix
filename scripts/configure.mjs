import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const portalInput = option("--portal");
const appInput = option("--url");
if (!portalInput || !appInput) {
  console.error(
    "Uso: npm run configure -- --portal https://sua-empresa.bitrix24.com.br --url https://seu-app-publicado",
  );
  process.exit(1);
}
if (existsSync(".env")) {
  console.error(
    "O arquivo .env já existe. Edite-o diretamente para preservar as chaves e os dados existentes.",
  );
  process.exit(1);
}
const portal = new URL(portalInput),
  app = new URL(appInput);
if (
  portal.protocol !== "https:" ||
  !/^[a-z0-9-]+\.bitrix24\.(com|com\.br|eu|de|es|fr|it|pl|in|id|vn|com\.tr|kz|ru|by|ua|cn|mx)$/.test(
    portal.hostname,
  ) ||
  portal.username ||
  portal.password ||
  app.protocol !== "https:" ||
  app.username ||
  app.password
) {
  console.error(
    "Informe o portal cloud Bitrix24 e a URL pública da aplicação, ambos HTTPS e sem credenciais.",
  );
  process.exit(1);
}
writeFileSync(
  ".env",
  `NEXO_APP_URL=${app.origin}\nBITRIX_PORTAL_URL=${portal.origin}\nNEXO_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nNEXO_SETUP_TOKEN=${randomBytes(32).toString("hex")}\nNEXO_DATA_DIR=./data\nPORT=3000\n`,
  { flag: "wx", mode: 0o600 },
);
console.info(
  "Arquivo .env criado. As chaves foram geradas localmente e não serão exibidas. Consulte esse arquivo para configurar a Onnira e autorizar a instalação. Preserve NEXO_ENCRYPTION_KEY ao atualizar a aplicação.",
);
