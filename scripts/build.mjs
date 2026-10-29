#!/usr/bin/env node
/**
 * `npm run build`: `next build` com o teto de memória do V8 escolhido pelo ambiente.
 * - Até 1,5 GB de memória (a Onnira dá 512 MB ao contêiner): 320 MB, para o build caber sem ser morto pelo sistema.
 * - Máquina comum: metade da memória, até 4 GB. O build do zero (sem o cache em .next/cache) passa de 320 MB
 *   e morria com "JavaScript heap out of memory" numa instalação nova a partir do código.
 * NEXO_BUILD_HEAP_MB força um valor (em MB).
 */
import { spawnSync } from "node:child_process";
import { totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MB = 1024 * 1024;
const SMALL_MACHINE_BYTES = 1536 * MB;

/** Teto do heap em MB: o limite do contêiner (cgroup), quando existe e é menor que a máquina; senão, a memória da máquina. */
export function buildHeapMb(env = process.env, total = totalmem(), constrained = process.constrainedMemory?.() ?? 0) {
  const forced = Number(env.NEXO_BUILD_HEAP_MB);
  if (Number.isInteger(forced) && forced >= 128) return forced;
  const available = constrained > 0 && constrained < total ? constrained : total;
  return available <= SMALL_MACHINE_BYTES ? 320 : Math.min(4096, Math.floor(available / MB / 2));
}

function main() {
  const heapMb = buildHeapMb();
  console.log(JSON.stringify({ at: new Date().toISOString(), level: "info", event: "build_start", source: "build", heapMb }));
  const next = join(root, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [`--max-old-space-size=${heapMb}`, next, "build", "--webpack"], { cwd: root, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
