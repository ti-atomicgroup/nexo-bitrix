import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAudit, audit } from "@/server/db/repos/audit";
import { logBitrixCall, recentBitrixErrors } from "@/server/db/repos/api-log";
import { acquireLease, releaseLease } from "@/server/db/repos/leases";
import { beginOperation, confirmOperation, getOperation, markOperationUncertain } from "@/server/db/repos/operations";
import { createSession, deleteUserSessions, findSessionWithUser, purgeExpiredSessions } from "@/server/db/repos/sessions";
import { DEFAULT_CONTENT, getCompany, getContent, getSetupStage, getSyncState, patchSyncState, setCompany, setSetupStage } from "@/server/db/repos/settings";
import { countUsers, createUser, findUserByEmail, recordLoginFailure, recordLoginSuccess, toAppUserDTO, updateUser } from "@/server/db/repos/users";
import { completeJob, countJobs, enqueueJob, failJob, requeueStuckJobs, takeDueJobs } from "@/server/db/repos/jobs";
import { useTestDb } from "../../support/db";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
});
afterEach(() => cleanup());

describe("settings", () => {
  it("tem padrões seguros antes da instalação", () => {
    expect(getSetupStage()).toBe("connect");
    expect(getCompany()).toEqual({ name: "Minha empresa", timezone: "America/Sao_Paulo" });
    expect(getContent()).toEqual(DEFAULT_CONTENT);
    expect(getSyncState().lastCycleAt).toBeNull();
  });

  it("grava e lê valores tipados", () => {
    setSetupStage("ready");
    setCompany({ name: "Atomic Group", timezone: "America/Sao_Paulo" });
    patchSyncState({ lastCycleAt: "2026-10-26T12:00:00.000Z" });
    patchSyncState({ lastError: null });
    expect(getSetupStage()).toBe("ready");
    expect(getCompany().name).toBe("Atomic Group");
    expect(getSyncState().lastCycleAt).toBe("2026-10-26T12:00:00.000Z");
  });
});

describe("usuários e sessões", () => {
  it("cria usuário com e-mail normalizado e registra tentativas", () => {
    const user = createUser({ name: "Marina RH", email: " Marina@Empresa.com ", passwordHash: "hash", role: "admin" });
    expect(user.email).toBe("marina@empresa.com");
    expect(findUserByEmail("MARINA@empresa.com")?.id).toBe(user.id);
    const lock = { now: "2026-10-26T12:00:00.000Z", lockUntil: "2026-10-26T12:15:00.000Z", maxFailures: 2 };
    expect(recordLoginFailure(user.id, lock)).toEqual({ failedLogins: 1, lockedUntil: null });
    expect(findUserByEmail("marina@empresa.com")?.failedLogins).toBe(1);
    // A 2ª falha bloqueia; uma falha atrasada (de uma leitura antiga) nunca apaga o bloqueio em vigor.
    expect(recordLoginFailure(user.id, lock)).toEqual({ failedLogins: 2, lockedUntil: "2026-10-26T12:15:00.000Z" });
    expect(recordLoginFailure(user.id, lock).lockedUntil).toBe("2026-10-26T12:15:00.000Z");
    // Bloqueio vencido recomeça a contagem.
    expect(recordLoginFailure(user.id, { ...lock, now: "2026-10-26T13:00:00.000Z", lockUntil: "2026-10-26T13:15:00.000Z" })).toEqual({ failedLogins: 1, lockedUntil: null });
    recordLoginSuccess(user.id);
    const after = findUserByEmail("marina@empresa.com")!;
    expect(after.failedLogins).toBe(0);
    expect(after.lockedUntil).toBeNull();
    expect(after.lastLoginAt).not.toBeNull();
    expect(updateUser(user.id, { active: false })?.active).toBe(false);
    expect(toAppUserDTO(after)).not.toHaveProperty("passwordHash");
    expect(countUsers()).toBe(1);
  });

  it("encontra a sessão com o usuário e expurga as vencidas", () => {
    const user = createUser({ name: "Rita", email: "rita@empresa.com", passwordHash: "h", role: "rh" });
    createSession({ tokenHash: "abc", userId: user.id, expiresAt: "2999-01-01T00:00:00.000Z" });
    createSession({ tokenHash: "old", userId: user.id, expiresAt: "2000-01-01T00:00:00.000Z" });
    expect(findSessionWithUser("abc")?.user.email).toBe("rita@empresa.com");
    expect(purgeExpiredSessions()).toBe(1);
    deleteUserSessions(user.id);
    expect(findSessionWithUser("abc")).toBeNull();
  });
});

describe("fila de jobs", () => {
  it("não duplica com a mesma chave e reabre jobs concluídos", () => {
    const first = enqueueJob({ kind: "push", dedupeKey: "activity:1" });
    const again = enqueueJob({ kind: "push", dedupeKey: "activity:1" });
    expect(again.id).toBe(first.id);
    const [taken] = takeDueJobs(new Date(Date.now() + 1000).toISOString());
    expect(taken?.status).toBe("running");
    completeJob(first.id);
    const reopened = enqueueJob({ kind: "push", dedupeKey: "activity:1" });
    expect(reopened.status).toBe("queued");
    expect(countJobs("queued")).toBe(1);
  });

  it("reagenda falhas e devolve jobs presos", () => {
    const job = enqueueJob({ kind: "push" });
    takeDueJobs(new Date(Date.now() + 1000).toISOString());
    failJob(job.id, "limite", "2999-01-01T00:00:00.000Z");
    expect(countJobs("queued")).toBe(1);
    expect(takeDueJobs(new Date(Date.now() + 1000).toISOString())).toHaveLength(0);
    const stuck = enqueueJob({ kind: "poll" });
    takeDueJobs(new Date(Date.now() + 1000).toISOString());
    // Um job lento que este processo ainda executa não é "preso": não volta para a fila (rodaria duas vezes).
    expect(requeueStuckJobs("2999-01-01T00:00:00.000Z", [stuck.id])).toBe(0);
    expect(requeueStuckJobs("2999-01-01T00:00:00.000Z")).toBe(1);
    failJob(stuck.id, "definitivo", null);
    expect(countJobs("failed")).toBe(1);
  });
});

describe("operações e lease", () => {
  it("conta tentativas e confirma o resultado", () => {
    beginOperation("task:create:1");
    markOperationUncertain("task:create:1");
    const second = beginOperation("task:create:1");
    expect(second.attempts).toBe(2);
    confirmOperation("task:create:1", "65184");
    expect(getOperation("task:create:1")).toMatchObject({ status: "confirmed", resultId: "65184" });
  });

  it("garante um único executor até o lease expirar", () => {
    const now = Date.now();
    expect(acquireLease("ciclo", "a", 1000, now)).toBe(true);
    expect(acquireLease("ciclo", "b", 1000, now + 10)).toBe(false);
    expect(acquireLease("ciclo", "a", 1000, now + 20)).toBe(true);
    expect(acquireLease("ciclo", "b", 1000, now + 5000)).toBe(true);
    releaseLease("ciclo", "b");
    expect(acquireLease("ciclo", "c", 1000, now + 5001)).toBe(true);
  });
});

describe("auditoria e log do Bitrix", () => {
  it("lista o histórico com rótulos legíveis", () => {
    audit({ actorType: "system", action: "Tarefa criada no Bitrix", entity: "journey", entityId: "j1", detail: { text: "Criar conta Google" } });
    audit({ actorType: "user", actorName: "Marina", action: "Jornada iniciada", entity: "journey", entityId: "j1" });
    const entries = listAudit({ entity: "journey", entityId: "j1" });
    expect(entries.map((entry) => entry.actor)).toEqual(["Marina", "Nexo"]);
    expect(entries[1]?.detail).toBe("Criar conta Google");
  });

  it("guarda só o método e o código de erro", () => {
    logBitrixCall({ method: "tasks.task.add", ok: false, errorCode: "QUERY_LIMIT_EXCEEDED", durationMs: 120.4 });
    logBitrixCall({ method: "user.get", ok: true, durationMs: 80 });
    expect(recentBitrixErrors()).toEqual([expect.objectContaining({ method: "tasks.task.add", code: "QUERY_LIMIT_EXCEEDED" })]);
  });
});
