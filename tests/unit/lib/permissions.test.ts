import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_ROUTES } from "@/shared/api";
import { APP_ROLES } from "@/shared/enums";
import { can, OPERATIONS, operationRule, type Operation } from "@/shared/permissions";

const operations = Object.keys(OPERATIONS) as Operation[];

describe("matriz de papel × operação", () => {
  it("administração pode tudo; o RH não mexe na conexão, nos acessos nem nos dados de outras pessoas", () => {
    for (const operation of operations) expect(can("admin", operation), operation).toBe(true);
    for (const operation of [
      "webhook.replace",
      "workspace.prepare",
      "settings.write",
      "users.manage",
      "trigger.write",
      "crm.read",
      "person.invite",
      "diagnostics.read",
      "audit.read",
      "privacy.manage",
      "backup.download",
    ] as const) {
      expect(can("rh", operation), operation).toBe(false);
    }
    for (const operation of ["today.read", "journey.create", "activity.act", "template.write", "ledger.add", "journey.message"] as const) {
      expect(can("rh", operation), operation).toBe(true);
    }
  });

  it("toda operação diz o que faz e se chega ao Bitrix24", () => {
    for (const operation of operations) {
      const rule = operationRule(operation);
      expect(rule.label.length, operation).toBeGreaterThan(3);
      expect(["none", "read", "write"]).toContain(rule.bitrix);
      expect(rule.roles.length, operation).toBeGreaterThan(0);
      for (const role of rule.roles) expect(APP_ROLES).toContain(role);
    }
  });

  it("toda rota com sessão da tabela da API aponta para uma operação da matriz; as públicas não têm operação", () => {
    for (const [name, spec] of Object.entries(API_ROUTES)) {
      if (spec.auth === "session") expect(OPERATIONS, name).toHaveProperty([spec.operation]);
      else expect("operation" in spec, name).toBe(false);
    }
  });

  it("a matriz publicada em docs/permissoes.md lista todas as operações, com os papéis certos", () => {
    const doc = readFileSync(new URL("../../../docs/permissoes.md", import.meta.url), "utf8");
    for (const operation of operations) {
      const line = doc.split("\n").find((text) => text.includes(`\`${operation}\``));
      expect(line, `${operation} não está em docs/permissoes.md`).toBeTruthy();
      const cells = line!.split("|").map((cell) => cell.trim());
      expect(cells[2], `${operation}: coluna Administração`).toBe("Sim");
      expect(cells[3], `${operation}: coluna RH`).toBe(can("rh", operation) ? "Sim" : "Não");
    }
  });
});
