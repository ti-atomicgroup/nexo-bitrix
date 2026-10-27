#!/usr/bin/env node
/**
 * `npm start`: sobe o worker do Bitrix24 (scripts/bitrix-worker.mjs) e o Nexo (next start) juntos.
 * Os dois combinam um token interno gerado aqui; o Nexo fala com o worker por http://127.0.0.1:<NEXO_WORKER_PORT>.
 * Se o worker cair, volta sozinho (espera crescente até 30 s). Se o Nexo cair, os dois saem para a plataforma reiniciar.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT || "3000";
const workerPort = process.env.NEXO_WORKER_PORT || (port === "3901" ? "3902" : "3901");
const token = process.env.NEXO_WORKER_TOKEN || randomBytes(32).toString("base64url");
const env = { ...process.env, PORT: port, NEXO_WORKER_PORT: workerPort, NEXO_WORKER_TOKEN: token, NEXO_BITRIX_WORKER_URL: `http://127.0.0.1:${workerPort}` };

const log = (level, event, data = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), level, event, source: "start", ...data }));

let stopping = false;
let worker = null;
let restarts = 0;
let startedAt = 0;

function startWorker() {
  startedAt = Date.now();
  worker = spawn(process.execPath, [join(root, "scripts", "bitrix-worker.mjs")], { cwd: root, env, stdio: "inherit" });
  worker.on("exit", (code, signal) => {
    worker = null;
    if (stopping) return;
    if (Date.now() - startedAt > 60_000) restarts = 0;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(restarts++, 5));
    log("warn", "worker_exited", { code, signal, restartInMs: delay });
    setTimeout(startWorker, delay);
  });
}

startWorker();

const web = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "0.0.0.0"], {
  cwd: root,
  env,
  stdio: "inherit",
});

web.on("exit", (code, signal) => {
  stopping = true;
  worker?.kill("SIGTERM");
  log(code === 0 ? "info" : "error", "web_exited", { code, signal });
  process.exit(code ?? (signal ? 1 : 0));
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    worker?.kill(signal);
    web.kill(signal);
  });
}
