import { Check, Minus, X } from "lucide-react";
import { cx } from "@/lib/cx";
import type { ScopeCheckDTO } from "@/shared/contracts";
import { OPTIONAL_SCOPES, REQUIRED_SCOPES, SCOPE_LABEL, type OptionalScope, type RequiredScope } from "@/shared/enums";
import styles from "./scope-list.module.css";

export const SCOPE_PURPOSE: Record<RequiredScope | OptionalScope, string> = {
  task: "Criar e acompanhar as tarefas de cada jornada",
  user_brief: "Escolher responsáveis entre as pessoas da empresa",
  crm: "Perceber contratações e desligamentos no CRM",
  sonet_group: "Criar o projeto privado onde ficam as tarefas",
  im: "Avisar responsáveis e enviar o link ao colaborador",
  calendar: "Marcar 1:1 e entrevista de saída na agenda",
  log: "Publicar as boas-vindas no Feed",
};

/** Permissões do webhook: obrigatórias (✓/✗) e opcionais (✓/–), sempre com texto além do ícone. */
export function ScopeList({ scopes, headingLevel = 3 }: { scopes: ScopeCheckDTO; headingLevel?: 2 | 3 | 4 }) {
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "h4";
  return (
    <div className={styles.groups}>
      <section className={styles.group}>
        <Heading className={styles.heading}>Obrigatórias</Heading>
        <ul className={styles.list}>
          {REQUIRED_SCOPES.map((scope) => {
            const ok = scopes.required[scope];
            const Icon = ok ? Check : X;
            return (
              <li key={scope} className={cx(styles.item, ok ? styles.ok : styles.missing)}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={16} strokeWidth={3} />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>
                    {SCOPE_LABEL[scope]} <code className={styles.code}>{scope}</code>
                  </span>
                  <span className={styles.purpose}>{SCOPE_PURPOSE[scope]}</span>
                </span>
                <span className={styles.state}>{ok ? "Liberada" : "Falta marcar"}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className={styles.group}>
        <Heading className={styles.heading}>Opcionais</Heading>
        <ul className={styles.list}>
          {OPTIONAL_SCOPES.map((scope) => {
            const ok = scopes.optional[scope];
            const Icon = ok ? Check : Minus;
            return (
              <li key={scope} className={cx(styles.item, ok ? styles.ok : styles.off)}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={16} strokeWidth={3} />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>
                    {SCOPE_LABEL[scope]} <code className={styles.code}>{scope}</code>
                  </span>
                  <span className={styles.purpose}>{SCOPE_PURPOSE[scope]}</span>
                </span>
                <span className={styles.state}>{ok ? "Liberada" : "Desligada"}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export function missingRequiredScopes(scopes: ScopeCheckDTO): RequiredScope[] {
  return REQUIRED_SCOPES.filter((scope) => !scopes.required[scope]);
}
