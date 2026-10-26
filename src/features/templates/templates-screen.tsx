"use client";

import { Plus, RefreshCw, Route } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LineTrack } from "@/components/lines/line-track";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { spanText } from "@/features/journeys/labels";
import { api } from "@/lib/api-client";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { TemplateSummaryDTO } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";
import styles from "./templates-screen.module.css";

function TemplateCard({ template }: { template: TemplateSummaryDTO }) {
  const stations = Array.from({ length: Math.max(template.stageCount, 1) }, (_, index) => ({
    position: index + 1,
    name: `Etapa ${index + 1}`,
    state: "upcoming" as const,
  }));
  return (
    <article className={cx(styles.card, template.archived && styles.archived)}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>
          <Link href={`/trilhas/${encodeURIComponent(template.id)}`} className={styles.link}>
            {template.name}
          </Link>
        </h3>
        <div className={styles.chips}>
          {template.profile ? <Chip tone={template.kind === "onboarding" ? "arrival" : "departure"}>{template.profile}</Chip> : null}
          {template.archived ? <Chip tone="neutral">Arquivada</Chip> : null}
        </div>
      </div>
      {template.description ? <p className={styles.description}>{template.description}</p> : null}
      <LineTrack stations={stations} kind={template.kind} label={`${plural(template.stageCount, "etapa", "etapas")} da trilha ${template.name}`} size="compact" />
      <p className={styles.meta}>
        <strong>{plural(template.activityCount, "atividade", "atividades")}</strong> em {plural(template.stageCount, "etapa", "etapas")}, {spanText(template.span)}
      </p>
    </article>
  );
}

function Group({ kind, templates }: { kind: JourneyKind; templates: TemplateSummaryDTO[] }) {
  const title = kind === "onboarding" ? "Entradas" : "Saídas";
  return (
    <section className={styles.group} aria-labelledby={`grupo-${kind}`}>
      <h2 id={`grupo-${kind}`} className={cx(styles.groupTitle, styles[kind])}>
        {title} <span className={styles.count}>{templates.length}</span>
      </h2>
      {templates.length ? (
        <div className={styles.grid}>
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      ) : (
        <p className={styles.quiet}>Nenhuma trilha de {kind === "onboarding" ? "entrada" : "saída"} ainda.</p>
      )}
    </section>
  );
}

/** `/trilhas`: galeria dos modelos por tipo (verde para entradas, laranja para saídas) e perfil. */
export function TemplatesScreen() {
  const templates = useApi((signal) => api.templates({ signal }), []);
  const [showArchived, setShowArchived] = useState(false);
  const all = (templates.data ?? []).filter((template) => showArchived || !template.archived);
  const archivedCount = (templates.data ?? []).filter((template) => template.archived).length;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Trilhas"
        description="Os modelos de cada jornada: etapas, quando cada uma libera, quem faz o quê e em que prazo. Mudanças valem para as próximas jornadas."
        actions={
          <ButtonLink href="/trilhas/nova" variant="primary" icon={Plus}>
            Nova trilha
          </ButtonLink>
        }
      />
      {templates.error && !templates.data ? (
        <Notice
          tone="error"
          role="alert"
          title="Não foi possível carregar as trilhas"
          action={
            <Button variant="forest" icon={RefreshCw} onClick={templates.reload}>
              Tentar de novo
            </Button>
          }
        >
          {templates.error.message}
        </Notice>
      ) : templates.loading ? (
        <LoadingArea label="Carregando as trilhas…">
          <Skeleton height={180} radius={6} />
          <Skeleton height={180} radius={6} />
        </LoadingArea>
      ) : (templates.data ?? []).length === 0 ? (
        <EmptyState
          icon={Route}
          title="Nenhuma trilha ainda"
          action={
            <ButtonLink href="/trilhas/nova" variant="primary" icon={Plus}>
              Nova trilha
            </ButtonLink>
          }
        >
          A preparação do Nexo carrega as trilhas iniciais. Se elas não aparecem, crie a primeira aqui.
        </EmptyState>
      ) : (
        <>
          {archivedCount ? (
            <Checkbox label={`Mostrar ${plural(archivedCount, "trilha arquivada", "trilhas arquivadas")}`} checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
          ) : null}
          <Group kind="onboarding" templates={all.filter((template) => template.kind === "onboarding")} />
          <Group kind="offboarding" templates={all.filter((template) => template.kind === "offboarding")} />
        </>
      )}
    </div>
  );
}
