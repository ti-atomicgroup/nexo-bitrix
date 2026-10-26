"use client";

import { RefreshCw } from "lucide-react";
import { useMe } from "@/components/shell/console-context";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import type { SettingsDTO } from "@/shared/contracts";
import { AccountSection } from "./account-section";
import { CompanySection } from "./company-section";
import { ConnectionSection } from "./connection-section";
import { ContentSection } from "./content-section";
import { DiagnosticsSection } from "./diagnostics-section";
import styles from "./settings-screen.module.css";
import { TeamSection } from "./team-section";
import { TriggersSection } from "./triggers-section";

const SECTIONS = [
  ["conexao", "Conexão com o Bitrix24"],
  ["automacoes", "Automações do CRM"],
  ["equipe", "Equipe"],
  ["conteudo", "Conteúdo do colaborador"],
  ["empresa", "Empresa e recursos"],
  ["diagnostico", "Diagnóstico"],
  ["registro", "Registro de atividades"],
  ["conta", "Sua conta"],
] as const;

/** `/ajustes`: configuração do Nexo. Quem é RH vê; só a administração muda. */
export function SettingsScreen() {
  const me = useMe();
  const isAdmin = me.user.role === "admin";
  const settings = useApi((signal) => api.settings({ signal }), [], { revalidateOnFocus: false });
  const saved = (next: SettingsDTO) => settings.mutate(next);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Ajustes"
        description={isAdmin ? "Conexão, automações, equipe e o que o colaborador vê." : "Você pode consultar os ajustes. Só a administração muda."}
      />
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Seções de Ajustes">
          <ul>
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.sections}>
          {settings.loading ? (
            <LoadingArea label="Carregando os ajustes…">
              <Skeleton height={240} radius={6} />
              <Skeleton height={240} radius={6} />
            </LoadingArea>
          ) : settings.error || !settings.data ? (
            <Notice
              tone="error"
              role="alert"
              title="Não foi possível carregar os ajustes"
              action={
                <Button variant="forest" icon={RefreshCw} onClick={settings.reload}>
                  Tentar de novo
                </Button>
              }
            >
              {settings.error?.message}
            </Notice>
          ) : (
            <>
              <ConnectionSection settings={settings.data} isAdmin={isAdmin} onSaved={saved} />
              <TriggersSection isAdmin={isAdmin} />
              <TeamSection settings={settings.data} isAdmin={isAdmin} onSaved={saved} />
              <ContentSection key={JSON.stringify(settings.data.content)} settings={settings.data} isAdmin={isAdmin} onSaved={saved} />
              <CompanySection key={`${settings.data.company.name}|${settings.data.company.timezone}`} settings={settings.data} isAdmin={isAdmin} onSaved={saved} />
            </>
          )}
          <DiagnosticsSection />
          <AccountSection me={me} />
        </div>
      </div>
    </div>
  );
}
