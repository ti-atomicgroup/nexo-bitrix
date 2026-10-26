"use client";

import { Plus, RefreshCw, Search, Users } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { plural, todayIn } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import type { JourneyRisk, JourneySummaryDTO } from "@/shared/contracts";
import { JourneyLineCard } from "./journey-line-card";
import styles from "./people-screen.module.css";

type Filter = "open" | "onboarding" | "offboarding" | "closed";

const RISK_ORDER: Record<JourneyRisk, number> = { critical: 0, attention: 1, ok: 2 };

function isOpen(journey: JourneySummaryDTO): boolean {
  return journey.status === "active" || journey.status === "paused";
}

function matches(journey: JourneySummaryDTO, filter: Filter): boolean {
  if (filter === "closed") return !isOpen(journey);
  if (!isOpen(journey)) return false;
  return filter === "open" || journey.kind === filter;
}

/** Sem acentos e em minúsculas, para a busca achar "João" digitando "joao". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
}

/** `/pessoas`: o mapa das linhas, com busca e filtros. */
export function PeopleScreen() {
  const journeys = useApi((signal) => api.journeys({}, { signal }), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const now = useNow(60_000);
  const today = todayIn(undefined, now === null ? undefined : new Date(now));

  const all = journeys.data ?? [];
  const counts: Record<Filter, number> = {
    open: all.filter((journey) => matches(journey, "open")).length,
    onboarding: all.filter((journey) => matches(journey, "onboarding")).length,
    offboarding: all.filter((journey) => matches(journey, "offboarding")).length,
    closed: all.filter((journey) => matches(journey, "closed")).length,
  };
  const needle = normalize(query.trim());
  const visible = all
    .filter((journey) => matches(journey, filter))
    .filter((journey) => !needle || normalize(`${journey.person.name} ${journey.templateName} ${journey.profile} ${journey.person.position ?? ""}`).includes(needle))
    .sort((a, b) =>
      filter === "closed"
        ? b.anchorDate.localeCompare(a.anchorDate)
        : RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.anchorDate.localeCompare(b.anchorDate),
    );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pessoas"
        meta={journeys.data ? plural(counts.open, "linha em andamento", "linhas em andamento") : null}
        description="Cada pessoa percorre uma linha. Veja em que etapa cada uma está e qual é a próxima parada."
        actions={
          <ButtonLink href="/pessoas/nova" variant="primary" icon={Plus}>
            Nova jornada
          </ButtonLink>
        }
      />

      <div className={styles.toolbar}>
        <Field
          label="Buscar pessoa ou trilha"
          type="search"
          leadingIcon={Search}
          placeholder="Nome, cargo ou trilha"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={styles.search}
        />
        <Segmented
          legend="Mostrar"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Em andamento", count: counts.open },
            { value: "onboarding", label: "Entradas", count: counts.onboarding },
            { value: "offboarding", label: "Saídas", count: counts.offboarding },
            { value: "closed", label: "Encerradas", count: counts.closed },
          ]}
        />
      </div>

      {journeys.error && !journeys.data ? (
        <Notice
          tone="error"
          role="alert"
          title="Não foi possível carregar as pessoas"
          action={
            <Button variant="forest" icon={RefreshCw} onClick={journeys.reload}>
              Tentar de novo
            </Button>
          }
        >
          {journeys.error.message}
        </Notice>
      ) : journeys.loading ? (
        <LoadingArea label="Carregando as linhas…">
          <Skeleton height={148} radius={6} />
          <Skeleton height={148} radius={6} />
          <Skeleton height={148} radius={6} />
        </LoadingArea>
      ) : all.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhuma jornada ainda"
          action={
            <ButtonLink href="/pessoas/nova" variant="primary" icon={Plus}>
              Nova jornada
            </ButtonLink>
          }
        >
          Comece uma entrada ou uma saída. Cada atividade liberada vira uma tarefa no Bitrix24, com responsável e prazo.
        </EmptyState>
      ) : (
        <>
          <p className="sr-only" role="status">
            {plural(visible.length, "pessoa na lista", "pessoas na lista")}
          </p>
          {visible.length ? (
            <div className={styles.list}>
              {visible.map((journey) => (
                <JourneyLineCard key={journey.id} journey={journey} today={today} headingLevel={2} />
              ))}
            </div>
          ) : (
            <p className={styles.none}>
              {needle ? `Ninguém encontrado para “${query.trim()}”.` : "Nenhuma pessoa neste filtro."}{" "}
              <button
                type="button"
                className={styles.reset}
                onClick={() => {
                  setQuery("");
                  setFilter("open");
                }}
              >
                Limpar busca e filtros
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
