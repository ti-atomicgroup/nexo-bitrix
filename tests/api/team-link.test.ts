import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as userUpdateRoute } from "@/app/api/users/[userId]/route";
import { GET as usersRoute, POST as userCreateRoute } from "@/app/api/users/route";
import { listAudit } from "@/server/db/repos/audit";
import { upsertBitrixPeople } from "@/server/db/repos/people";
import { setProject, setWebhookRecord } from "@/server/db/repos/settings";
import * as engine from "@/server/engine";
import type { AppUserDTO } from "@/shared/contracts";
import { useTestDb } from "../support/db";
import { call, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setWebhookRecord({ encryptedUrl: "v1.a.b.c", portal: "https://empresa.bitrix24.com.br", owner: { bitrixUserId: "7", name: "Conta Técnica", position: null }, scopes: [], verifiedAt: new Date().toISOString() });
  setProject({ id: "55", name: "Nexo · Jornadas", url: "https://empresa.bitrix24.com.br/workgroups/group/55/" });
  upsertBitrixPeople([
    { bitrixUserId: "21", name: "Rita RH", email: "rita@empresa.com.br", active: true },
    { bitrixUserId: "22", name: "Inativo", email: "inativo@empresa.com.br", active: false },
  ]);
  vi.mocked(engine.projectMemberIds).mockReset();
  vi.mocked(engine.projectMemberIds).mockImplementation(async () => ["21"]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const admin = async () => (await seedUser({ role: "admin" })).token;

describe("vínculo do acesso com a pessoa do Bitrix24", () => {
  it("acesso novo com e-mail conhecido já nasce vinculado", async () => {
    const created = await call<AppUserDTO>(userCreateRoute, { path: "/api/users", token: await admin(), body: { name: "Rita", email: "rita@empresa.com.br", role: "rh", temporaryPassword: "senha-forte-123" } });
    expect(created.status).toBe(200);
    expect(created.body.bitrix).toEqual({ id: "21", name: "Rita RH", active: true, member: true });
  });

  it("a administração vincula à mão, e fica registrado; conta desativada não serve", async () => {
    const token = await admin();
    const { user } = await seedUser({ role: "rh", email: "outro@empresa.com.br" });
    const update = (bitrixUserId: string | null) => call<AppUserDTO & ApiErrorBody, "userId">(userUpdateRoute, { method: "PATCH", path: `/api/users/${user.id}`, params: { userId: user.id }, token, body: { bitrixUserId } });
    const inactive = await update("22");
    expect(inactive.status).toBe(422);
    const linked = await update("21");
    expect(linked.body.bitrix).toMatchObject({ id: "21", member: true });
    expect(listAudit({ entity: "user", entityId: user.id })[0]).toMatchObject({ action: "Acesso atualizado" });
    expect((await update(null)).body.bitrix).toBeNull();
  });

  it("a lista mostra quem participa do projeto, e não trava se o Bitrix24 estiver fora", async () => {
    const token = await admin();
    await seedUser({ role: "rh", email: "rita@empresa.com.br" });
    const list = await call<AppUserDTO[]>(usersRoute, { path: "/api/users", token });
    expect(list.status).toBe(200);
    vi.mocked(engine.projectMemberIds).mockImplementation(async () => {
      throw new Error("fora do ar");
    });
    const { user } = await seedUser({ role: "rh", email: "b@empresa.com.br" });
    await call(userUpdateRoute, { method: "PATCH", path: `/api/users/${user.id}`, params: { userId: user.id } as never, token, body: { bitrixUserId: "21" } });
    const offline = await call<AppUserDTO[]>(usersRoute, { path: "/api/users", token });
    expect(offline.status).toBe(200);
    expect(offline.body.find((item) => item.id === user.id)?.bitrix).toMatchObject({ id: "21", member: null });
  });
});
