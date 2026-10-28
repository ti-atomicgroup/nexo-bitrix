#!/usr/bin/env node
/**
 * Redefine a senha de um acesso do Nexo direto no banco (para quem tem acesso ao servidor, ex.: o Nexo local).
 * Uso: npm run senha:redefinir -- [e-mail]
 * A senha é digitada no terminal, sem aparecer na tela, e nunca vai para argumentos, logs ou arquivos.
 * Também zera as tentativas erradas, desfaz o bloqueio e encerra as sessões abertas desse acesso.
 */
import { randomBytes, scrypt } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";

// Mesmo formato de src/server/security/passwords.ts: scrypt$N$r$p$<sal hex>$<hash hex>.
const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MIN_LENGTH = 10;

function dataDir() {
  if (process.env.NEXO_DATA_DIR?.trim()) return resolve(process.env.NEXO_DATA_DIR.trim());
  if (existsSync("/app/.data/nexo.sqlite")) return "/app/.data";
  if (existsSync(".data/nexo.sqlite")) return resolve(process.cwd(), ".data");
  return resolve(process.cwd(), "data");
}

function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  return new Promise((done, fail) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...COST, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) fail(error);
      else done(["scrypt", COST.N, COST.r, COST.p, salt.toString("hex"), key.toString("hex")].join("$"));
    });
  });
}

/** Um leitor só para todas as perguntas; o que é digitado não aparece na tela. */
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
};
const lines = rl[Symbol.asyncIterator]();

async function askHidden(question) {
  rl.output.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  rl.output.write("\n");
  return value ?? "";
}

function fail(message) {
  rl.close();
  console.error(`\n${message}`);
  process.exit(1);
}

const file = join(dataDir(), "nexo.sqlite");
if (!existsSync(file)) fail(`Não encontrei o banco do Nexo em ${file}. Rode na pasta do projeto ou informe NEXO_DATA_DIR.`);
// Espera até 5 s se o Nexo estiver gravando no banco na mesma hora (como o servidor faz).
const db = new DatabaseSync(file, { timeout: 5000 });
const users = db.prepare("SELECT id, name, email, role FROM app_users WHERE active = 1 ORDER BY role, email").all();
if (!users.length) fail("Não há acessos ativos neste Nexo.");

const wanted = process.argv[2]?.trim().toLowerCase();
const user = wanted ? users.find((item) => String(item.email).toLowerCase() === wanted) : users.length === 1 ? users[0] : null;
if (!user) {
  fail(`Informe o e-mail do acesso: npm run senha:redefinir -- <e-mail>\nAcessos ativos: ${users.map((item) => item.email).join(", ")}`);
}

console.log(`Nova senha para ${user.name} (${user.email}). Ela não aparece enquanto você digita.`);
const password = await askHidden("Nova senha (mínimo 10 caracteres): ");
if (password.length < MIN_LENGTH) fail("A senha precisa ter pelo menos 10 caracteres. Nada foi alterado.");
if ((await askHidden("Repita a nova senha: ")) !== password) fail("As senhas não conferem. Nada foi alterado.");

rl.close();
const hash = await hashPassword(password);
const now = new Date().toISOString();
let sessions = 0;
try {
  db.exec("BEGIN IMMEDIATE");
  db.prepare("UPDATE app_users SET password_hash = ?, failed_logins = 0, locked_until = NULL, must_change_password = 0 WHERE id = ?").run(hash, user.id);
  sessions = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id).changes;
  db.prepare("INSERT INTO audit_log (at, actor_type, actor_id, actor_name, action, entity, entity_id, detail) VALUES (?, 'system', NULL, NULL, ?, 'user', ?, ?)").run(
    now,
    "Senha redefinida pelo terminal do servidor",
    user.id,
    JSON.stringify({ text: `Acesso ${user.email}; ${sessions} sessão(ões) encerrada(s).` }),
  );
  db.exec("COMMIT");
} catch (error) {
  if (db.isTransaction) db.exec("ROLLBACK");
  const busy = /locked|busy/i.test(String(error?.message));
  console.error(
    busy
      ? "\nO banco está ocupado pelo Nexo neste momento. Nada foi alterado; rode o comando de novo em alguns segundos."
      : `\nNão deu para gravar a nova senha. Nada foi alterado. (${error?.message ?? error})`,
  );
  process.exit(1);
} finally {
  if (db.isOpen) db.close();
}
console.log(`Pronto. Senha de ${user.email} redefinida; o bloqueio por tentativas foi desfeito. Entre no Nexo com a nova senha.`);
