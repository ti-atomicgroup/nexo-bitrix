import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureScheduler, kick, schedulerEnabled, schedulerStatus, setCycleRunnerForTests, startScheduler, stopSchedulerForTests } from "@/server/engine/scheduler";
import { useTestDb } from "../../support/db";

let cleanup: () => void;
const original = process.env.NEXO_SCHEDULER;

beforeEach(() => {
  vi.useFakeTimers();
  cleanup = useTestDb().cleanup;
  stopSchedulerForTests();
  process.env.NEXO_SCHEDULER = "1";
});

afterEach(() => {
  stopSchedulerForTests();
  if (original === undefined) delete process.env.NEXO_SCHEDULER;
  else process.env.NEXO_SCHEDULER = original;
  vi.useRealTimers();
  cleanup();
});

describe("agendador", () => {
  it("roda o 1º ciclo em ~5 s, depois a cada 60 s, e um ciclo que lança erro não mata o laço", async () => {
    const runner = vi.fn().mockRejectedValueOnce(new Error("falhou")).mockResolvedValue({ followUp: false });
    setCycleRunnerForTests(runner);
    startScheduler();
    startScheduler();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(runner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runner).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runner).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runner).toHaveBeenCalledTimes(3);
    const status = schedulerStatus();
    expect(status.running).toBe(true);
    expect(Date.parse(status.nextCycleAt!) - Date.now()).toBe(60_000);
  });

  it("kick antecipa um ciclo com debounce de ~1 s", async () => {
    const runner = vi.fn().mockResolvedValue({ followUp: false });
    setCycleRunnerForTests(runner);
    startScheduler();
    await vi.advanceTimersByTimeAsync(5_000);
    kick();
    kick();
    kick();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runner).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("kick durante um ciclo e ciclo com novidade disparam outro ciclo logo em seguida", async () => {
    let release: () => void = () => undefined;
    const runner = vi
      .fn()
      .mockImplementationOnce(() => new Promise<{ followUp: boolean }>((resolve) => (release = () => resolve({ followUp: false }))))
      .mockResolvedValueOnce({ followUp: true })
      .mockResolvedValue({ followUp: false });
    setCycleRunnerForTests(runner);
    startScheduler();
    await vi.advanceTimersByTimeAsync(5_000);
    kick();
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runner).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("watchdog liga o laço que não estava rodando", async () => {
    const runner = vi.fn().mockResolvedValue({});
    setCycleRunnerForTests(runner);
    expect(schedulerStatus().running).toBe(false);
    ensureScheduler();
    expect(schedulerStatus().running).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("fica desligado em desenvolvimento e testes sem NEXO_SCHEDULER=1, e com NEXO_SCHEDULER=0", () => {
    delete process.env.NEXO_SCHEDULER;
    expect(schedulerEnabled()).toBe(false);
    startScheduler();
    kick();
    expect(schedulerStatus().running).toBe(false);
    process.env.NEXO_SCHEDULER = "0";
    expect(schedulerEnabled()).toBe(false);
    process.env.NEXO_SCHEDULER = "1";
    expect(schedulerEnabled()).toBe(true);
  });
});
