import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const dev = process.argv.includes("--dev");
const children = new Set();
let stopping = false;
function run(script, args) {
  const child = spawn(process.execPath, [resolve(script), ...args], {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });
  children.add(child);
  child.on("error", (error) => {
    console.error("Falha ao iniciar processo Nexo:", error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping && code !== 0) stop(code || 1);
  });
  return child;
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
const web = run("node_modules/next/dist/bin/next", [
  dev ? "dev" : "start",
  "--hostname",
  "0.0.0.0",
  "--port",
  process.env.PORT || "3000",
]);
web.on("exit", (code) => {
  if (!stopping) stop(code || 0);
});
const required = [
  "NEXO_APP_URL",
  "NEXO_ENCRYPTION_KEY",
  "NEXO_SETUP_TOKEN",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length)
  console.info(
    "Nexo: guia de instalação disponível. Configure as variáveis de ambiente para ativar o sincronizador.",
  );
else run("node_modules/tsx/dist/cli.mjs", ["src/server/worker-entry.ts"]);
process.once("SIGTERM", () => stop());
process.once("SIGINT", () => stop());
