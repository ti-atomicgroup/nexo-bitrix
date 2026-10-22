import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const source = resolve(
  process.env.NEXO_DATA_DIR ||
    (existsSync("/app/.data") ? "/app/.data" : "./data"),
  "nexo.sqlite",
);
if (!existsSync(source)) {
  console.error(
    "Banco não encontrado. Confirme NEXO_DATA_DIR e a instalação antes de fazer backup.",
  );
  process.exit(1);
}
mkdirSync("output/backups", { recursive: true, mode: 0o700 });
const target = join(
  "output/backups",
  `nexo-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.sqlite`,
);
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(target);
  console.info(
    `Backup consistente criado em ${target}. Proteja-o como o banco original.`,
  );
} finally {
  db.close();
}
