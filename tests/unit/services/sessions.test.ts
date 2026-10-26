import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, issueSession, readBearerToken, revoke, revokeOtherSessions, SESSION_IDLE_MS, SESSION_MAX_MS } from "@/server/auth/sessions";
import { getDb } from "@/server/db";
import { findSessionWithUser } from "@/server/db/repos/sessions";
import { createUser, updateUser, type AppUserRow } from "@/server/db/repos/users";
import { hashToken } from "@/server/security/crypto";
import { useTestDb } from "../../support/db";

const T0 = new Date("2026-10-26T12:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

let cleanup: () => void;
let user: AppUserRow;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  cleanup = useTestDb().cleanup;
  user = createUser({ name: "Rita", email: "rita@empresa.com.br", passwordHash: "x", role: "rh" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const bearer = (token: string, scheme = "Bearer") => new Request("http://localhost/api/me", { headers: { authorization: `${scheme} ${token}` } });

function advance(ms: number): number {
  vi.setSystemTime(new Date(Date.now() + ms));
  return Date.now();
}

describe("sessões Bearer", () => {
  it("guarda só o hash do token", () => {
    const { token, tokenHash, expiresAt } = issueSession(user);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(hashToken(token));
    expect(expiresAt).toBe(new Date(T0.getTime() + SESSION_IDLE_MS).toISOString());
    const rows = getDb().prepare("SELECT * FROM sessions").all();
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("aceita só Authorization: Bearer (sem cookie, sem outro esquema)", () => {
    const { token } = issueSession(user);
    expect(authenticate(bearer(token))?.user.id).toBe(user.id);
    expect(authenticate(bearer(token, "bearer"))?.user.id).toBe(user.id);
    expect(authenticate(bearer(token, "Token"))).toBeNull();
    expect(authenticate(new Request("http://localhost/", { headers: { cookie: `session=${token}` } }))).toBeNull();
    expect(authenticate(bearer("curto"))).toBeNull();
    expect(readBearerToken(bearer(`${token} extra`))).toBeNull();
  });

  it("desliza o prazo, renovando no máximo a cada 5 minutos", () => {
    const { token, tokenHash } = issueSession(user);
    advance(4 * MINUTE);
    expect(authenticate(bearer(token))?.expiresAt).toBe(new Date(T0.getTime() + SESSION_IDLE_MS).toISOString());
    const now = advance(2 * MINUTE);
    const refreshed = authenticate(bearer(token));
    expect(refreshed?.expiresAt).toBe(new Date(now + SESSION_IDLE_MS).toISOString());
    expect(findSessionWithUser(tokenHash)?.session.lastSeenAt).toBe(new Date(now).toISOString());
  });

  it("expira depois de 12 h sem uso e apaga a sessão", () => {
    const { token, tokenHash } = issueSession(user);
    advance(SESSION_IDLE_MS + 1);
    expect(authenticate(bearer(token))).toBeNull();
    expect(findSessionWithUser(tokenHash)).toBeNull();
  });

  it("nunca passa de 7 dias desde o login, mesmo em uso contínuo", () => {
    const { token } = issueSession(user);
    const cap = T0.getTime() + SESSION_MAX_MS;
    for (let elapsed = 0; elapsed < SESSION_MAX_MS - 6 * HOUR; elapsed += 6 * HOUR) {
      advance(6 * HOUR);
      const session = authenticate(bearer(token));
      expect(session).not.toBeNull();
      expect(Date.parse(session!.expiresAt)).toBeLessThanOrEqual(cap);
    }
    vi.setSystemTime(new Date(cap));
    expect(authenticate(bearer(token))).toBeNull();
  });

  it("recusa usuário desativado", () => {
    const { token } = issueSession(user);
    updateUser(user.id, { active: false });
    expect(authenticate(bearer(token))).toBeNull();
  });

  it("revoga a sessão atual ou só as outras", () => {
    const first = issueSession(user);
    const second = issueSession(user);
    const third = issueSession(user);
    expect(revokeOtherSessions(user.id, second.tokenHash)).toBe(2);
    expect(authenticate(bearer(first.token))).toBeNull();
    expect(authenticate(bearer(third.token))).toBeNull();
    expect(authenticate(bearer(second.token))).not.toBeNull();
    revoke(second.tokenHash);
    expect(authenticate(bearer(second.token))).toBeNull();
  });
});
