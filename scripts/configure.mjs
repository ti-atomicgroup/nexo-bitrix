import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const appInput = option("--url");
if (!appInput) {
  console.error(
    "Uso: npm run configure -- --url https://seu-app-publicado",
  );
  process.exit(1);
}
if (existsSync(".env")) {
  console.error(
    "O arquivo .env já existe. Edite-o diretamente para preservar as chaves e os dados existentes.",
  );
  process.exit(1);
}
const app = new URL(appInput);
if (
  app.protocol !== "https:" ||
  app.username ||
  app.password
) {
  console.error(
    "Informe a URL pública HTTPS da aplicação, sem credenciais.",
  );
  process.exit(1);
}
writeFileSync(
  ".env",
  `NEXO_APP_URL=${app.origin}\nNEXO_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nNEXO_DATA_DIR=./data\nPORT=3000\n`,
  { flag: "wx", mode: 0o600 },
);
console.info(
  "Arquivo .env criado. A chave foi gerada localmente e não será exibida. Preserve NEXO_ENCRYPTION_KEY ao atualizar a aplicação.",
);
