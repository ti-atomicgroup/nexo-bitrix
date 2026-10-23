import { createRuntime } from "./runtime";
import { AppError } from "./errors";
let shuttingDown = false;
const runtime = createRuntime();
let running: Promise<void> | null = null;
function tick() {
  if (running || shuttingDown) return;
  runtime.bitrix.refreshConfiguration();
  if (!runtime.env.portalUrl) return;
  running = runtime.worker.tick().catch((error: unknown) => { console.error(JSON.stringify({ event: "worker.tick.failed", code: error instanceof AppError ? error.code : "INTERNAL" })); }).finally(() => { running = null; });
}
const interval = setInterval(tick, 60000);
tick();
async function shutdown() { shuttingDown = true; clearInterval(interval); if (running) await running; runtime.store.close(); }
process.once("SIGTERM", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
