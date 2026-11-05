import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { issueSession } from "@/server/auth/sessions";
import type { RouteHandler } from "@/server/http/handler";
import { FORBIDDEN_MESSAGE, UNAUTHENTICATED_MESSAGE } from "@/server/http/handler";
import { API_ROUTES } from "@/shared/api";
import { can, type Operation } from "@/shared/permissions";
import { useTestDb } from "../support/db";
import { call, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());
vi.mock("@/server/domain", async () => (await import("./support/domain-fake")).domainFake());

/**
 * Inventário de rotas: toda rota em src/app/api responde 401 sem token, salvo a lista de exceções;
 * rotas de administrador recusam o RH (403); a tabela de src/shared/api.ts e os arquivos batem 1:1.
 */
const API_DIR = fileURLToPath(new URL("../../src/app/api", import.meta.url));
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
// "jobs/tick" é interna (só o worker do Bitrix24, com token): fica fora da tabela da API.
const PUBLIC = new Set(["health", "probe", "jobs/tick", "status", "setup/connect", "setup/account", "auth/login", "auth/transport", "tasks/[taskId]"]);

type Method = (typeof METHODS)[number];
interface RouteEntry {
  route: string;
  method: Method;
  handler: RouteHandler<string>;
}

function findRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

/** "journeys/[journeyId]/actions" → caminho concreto e parâmetros fictícios. */
function concrete(route: string): { path: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const path = route.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    params[name] = "id-inexistente";
    return "id-inexistente";
  });
  return { path: `/api/${path}`, params };
}

const entries: RouteEntry[] = [];

beforeAll(async () => {
  for (const file of findRouteFiles(API_DIR)) {
    const route = relative(API_DIR, dirname(file)).split(sep).join("/");
    const loaded = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Partial<Record<Method, RouteHandler<string>>> & { dynamic?: string };
    expect(loaded.dynamic, `${route} precisa de export const dynamic = "force-dynamic"`).toBe("force-dynamic");
    for (const method of METHODS) {
      const handler = loaded[method];
      if (handler) entries.push({ route, method, handler });
    }
  }
});

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const specOf = (route: string, method: Method) =>
  Object.values(API_ROUTES).find((spec) => spec.method === method && spec.path.split("?")[0] === `/api/${route.replace(/\[([^\]]+)\]/g, ":$1")}`);

describe("inventário de rotas da API", () => {
  it("encontra todas as rotas da tabela e nenhuma rota fora dela", () => {
    const found = new Set(entries.map((entry) => `${entry.method} /api/${entry.route.replace(/\[([^\]]+)\]/g, ":$1")}`));
    const expected = new Set(Object.values(API_ROUTES).map((spec) => `${spec.method} ${spec.path.split("?")[0]}`));
    expect([...expected].filter((key) => !found.has(key))).toEqual([]);
    const extra = [...found].filter((key) => !expected.has(key) && !key.endsWith("/api/jobs/tick"));
    expect(extra).toEqual([]);
    expect(entries.length).toBeGreaterThanOrEqual(Object.keys(API_ROUTES).length);
  });

  it("toda rota protegida responde 401 sem token (e não chama o serviço)", async () => {
    const checked: string[] = [];
    for (const entry of entries) {
      if (PUBLIC.has(entry.route)) continue;
      const { path, params } = concrete(entry.route);
      const body = entry.method === "GET" || entry.method === "DELETE" ? undefined : {};
      const result = await call<ApiErrorBody, string>(entry.handler, { method: entry.method, path, params, body });
      expect(result.status, `${entry.method} ${path}`).toBe(401);
      expect(result.body.error).toEqual({ code: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE });
      expect(result.headers.get("cache-control")).toBe("no-store");
      checked.push(`${entry.method} ${path}`);
    }
    const protectedInTable = Object.values(API_ROUTES).filter((spec) => spec.auth === "session");
    expect(checked).toHaveLength(protectedInTable.length);
  });

  it("token inválido também é 401", async () => {
    for (const entry of entries.filter((item) => !PUBLIC.has(item.route))) {
      const { path, params } = concrete(entry.route);
      const result = await call<ApiErrorBody, string>(entry.handler, { method: entry.method, path, params, token: "x".repeat(43) });
      expect(result.status, `${entry.method} ${path}`).toBe(401);
    }
  });

  it("matriz de papéis: RH recebe 403 nas operações só de administrador e passa da autenticação nas demais", async () => {
    const rh = await seedUser({ role: "rh" });
    const admin = await seedUser({ role: "admin" });
    for (const entry of entries.filter((item) => !PUBLIC.has(item.route))) {
      const { path, params } = concrete(entry.route);
      const body = entry.method === "GET" || entry.method === "DELETE" ? undefined : {};
      const spec = specOf(entry.route, entry.method);
      expect(spec?.auth, `${entry.method} ${path}`).toBe("session");
      const allowedToRh = can("rh", (spec as { operation: Operation }).operation);
      // Sessão nova a cada chamada: a rota de logout encerra a sessão usada.
      const asRh = await call<ApiErrorBody, string>(entry.handler, { method: entry.method, path, params, body, token: issueSession(rh.user).token });
      if (!allowedToRh) {
        expect(asRh.status, `${entry.method} ${path} (rh)`).toBe(403);
        expect(asRh.body.error).toEqual({ code: "FORBIDDEN", message: FORBIDDEN_MESSAGE });
        const asAdmin = await call<ApiErrorBody, string>(entry.handler, { method: entry.method, path, params, body, token: issueSession(admin.user).token });
        expect([401, 403], `${entry.method} ${path} (admin)`).not.toContain(asAdmin.status);
        expect(asAdmin.status, `${entry.method} ${path} (admin): ${asAdmin.text}`).toBeLessThan(500);
      } else {
        expect([401, 403], `${entry.method} ${path} (rh)`).not.toContain(asRh.status);
        // Entrada vazia ou id inexistente: 2xx ou 4xx com mensagem, nunca erro interno.
        expect(asRh.status, `${entry.method} ${path} (rh): ${asRh.text}`).toBeLessThan(500);
      }
    }
  });

  it("senha temporária: só as rotas de session.self respondem, para qualquer papel, antes da matriz e do Bitrix24", async () => {
    const blocked: string[] = [];
    const open: string[] = [];
    for (const role of ["rh", "admin"] as const) {
      const { user } = await seedUser({ role, mustChangePassword: true });
      for (const entry of entries.filter((item) => !PUBLIC.has(item.route))) {
        const { path, params } = concrete(entry.route);
        const body = entry.method === "GET" || entry.method === "DELETE" ? undefined : {};
        const operation = (specOf(entry.route, entry.method) as { operation: Operation }).operation;
        const label = `${entry.method} ${path} (${role})`;
        // Sessão nova a cada chamada: a rota de logout encerra a sessão usada.
        const result = await call<ApiErrorBody, string>(entry.handler, { method: entry.method, path, params, body, token: issueSession(user).token });
        if (operation === "session.self") {
          expect(result.body.error?.code, label).not.toBe("PASSWORD_CHANGE_REQUIRED");
          expect(result.status, `${label}: ${result.text}`).toBeLessThan(500);
          open.push(label);
        } else {
          expect(result.status, label).toBe(403);
          expect(result.body.error?.code, label).toBe("PASSWORD_CHANGE_REQUIRED");
          blocked.push(label);
        }
      }
    }
    expect(open).toEqual(expect.arrayContaining(["POST /api/auth/logout (rh)", "GET /api/me (rh)", "POST /api/me/password (rh)"]));
    expect(open).toHaveLength(6);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("as exceções públicas são exatamente as previstas na tabela", () => {
    const publicInTable = Object.values(API_ROUTES)
      .filter((spec) => spec.auth === "public" || spec.auth === "install")
      .map((spec) => spec.path.split("?")[0]!.replace(/^\/api\//, ""));
    const publicRoutes = [...PUBLIC].filter((route) => route !== "jobs/tick").map((route) => route.replace(/\[([^\]]+)\]/g, ":$1"));
    expect(new Set(publicInTable)).toEqual(new Set(publicRoutes));
  });
});
