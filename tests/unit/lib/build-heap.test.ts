import { describe, expect, it } from "vitest";
import { buildHeapMb } from "../../../scripts/build.mjs";

const GB = 1024 ** 3;

/** Teto de memória do `npm run build`: cabe nos 512 MB da Onnira e não morre num build do zero em máquina comum. */
describe("memória do build", () => {
  it("contêiner pequeno (Onnira, 512 MB) fica em 320 MB, mesmo numa máquina grande", () => {
    expect(buildHeapMb({}, 16 * GB, 0.5 * GB)).toBe(320);
    expect(buildHeapMb({}, 1 * GB, 0)).toBe(320);
  });

  it("máquina comum usa metade da memória, até 4 GB", () => {
    expect(buildHeapMb({}, 14 * GB, 0)).toBe(4096);
    expect(buildHeapMb({}, 4 * GB, 0)).toBe(2048);
    // cgroup sem limite ("max") devolve um número enorme: vale a memória da máquina.
    expect(buildHeapMb({}, 4 * GB, 2 ** 62)).toBe(2048);
  });

  it("NEXO_BUILD_HEAP_MB força o valor", () => {
    expect(buildHeapMb({ NEXO_BUILD_HEAP_MB: "1024" }, 1 * GB, 0)).toBe(1024);
    expect(buildHeapMb({ NEXO_BUILD_HEAP_MB: "abc" }, 1 * GB, 0)).toBe(320);
  });
});
