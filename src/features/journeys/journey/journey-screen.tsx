"use client";

import { History, KeyRound, Link2, RefreshCw, Route } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { todayIn } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import type { ActivityDTO, JourneyDTO } from "@/shared/contracts";
import { ActivityDrawer } from "./activity-drawer";
import { HistoryTab } from "./history-tab";
import { JourneyHeader } from "./journey-header";
import styles from "./journey-screen.module.css";
import { JourneyStages } from "./journey-stages";
import { LedgerTab } from "./ledger-tab";
import { LinkPersonNotice } from "./link-person-notice";
import { LinkTab } from "./link-tab";

function findActivity(journey: JourneyDTO, id: string): ActivityDTO | null {
  for (const stage of journey.stages) {
    const found = stage.activities.find((activity) => activity.id === id);
    if (found) return found;
  }
  return null;
}

function patchActivity(journey: JourneyDTO, updated: ActivityDTO): JourneyDTO {
  return {
    ...journey,
    stages: journey.stages.map((stage) => ({
      ...stage,
      activities: stage.activities.map((activity) => (activity.id === updated.id ? updated : activity)),
    })),
  };
}

/** `/pessoas/[id]`: a jornada de uma pessoa, com a linha por etapas, a gaveta da atividade e as abas. */
export function JourneyScreen({ journeyId }: { journeyId: string }) {
  const journey = useApi((signal) => api.journey(journeyId, { signal }), [journeyId], { refreshMs: 60_000 });
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? `/pessoas/${journeyId}`;
  const [tab, setTab] = useState("linha");
  const now = useNow(60_000);
  const today = todayIn(undefined, now === null ? undefined : new Date(now));

  // A gaveta acompanha `?atividade=<id>`: abrir e fechar só trocam a URL (sem ida ao servidor).
  const activityId = searchParams?.get("atividade") ?? null;
  const setActivityParam = (id: string | null) => {
    window.history.replaceState(null, "", id ? `${pathname}?atividade=${encodeURIComponent(id)}` : pathname);
  };

  const data = journey.data;
  if (!data) {
    return journey.error ? (
      <div className={styles.page}>
        <Notice
          tone="error"
          role="alert"
          title={journey.error.status === 404 ? "Esta jornada não existe mais" : "Não foi possível abrir a jornada"}
          action={
            journey.error.status === 404 ? (
              <ButtonLink href="/pessoas" variant="forest">
                Ver as pessoas
              </ButtonLink>
            ) : (
              <Button variant="forest" icon={RefreshCw} onClick={journey.reload}>
                Tentar de novo
              </Button>
            )
          }
        >
          {journey.error.message}
        </Notice>
      </div>
    ) : (
      <JourneySkeleton />
    );
  }

  const activity = activityId ? findActivity(data, activityId) : null;
  const openActivities = data.stages.flatMap((stage) => stage.activities).filter((item) => item.status === "open" || item.status === "in_progress" || item.status === "awaiting_approval").length;
  const pendingLedger = data.ledger.filter((item) => item.status === "planned" || item.status === "active" || item.status === "return_requested").length;

  return (
    <div className={styles.page}>
      <JourneyHeader journey={data} today={today} onChanged={(next) => journey.mutate(next)} />
      {journey.error ? (
        <Notice tone="warning" title="Não foi possível atualizar agora">
          Mostrando a última leitura. {journey.error.message}
        </Notice>
      ) : null}
      {data.summary.person.bitrixUserId === null && (data.summary.status === "active" || data.summary.status === "paused") ? (
        <LinkPersonNotice journey={data} onLinked={(next) => journey.mutate(next)} />
      ) : null}
      <Tabs
        label="Seções da jornada"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            id: "linha",
            label: "Linha",
            icon: Route,
            badge: openActivities || undefined,
            content: <JourneyStages journey={data} today={today} onOpen={setActivityParam} />,
          },
          {
            id: "inventario",
            label: "Acessos e equipamentos",
            icon: KeyRound,
            badge: pendingLedger || undefined,
            content: <LedgerTab journey={data} onChanged={journey.reload} />,
          },
          {
            id: "link",
            label: "Link do colaborador",
            icon: Link2,
            content: <LinkTab journey={data} today={today} onChanged={(link) => journey.mutate((current) => (current ? { ...current, link } : current))} />,
          },
          { id: "historico", label: "Histórico", icon: History, content: <HistoryTab entries={data.history} /> },
        ]}
      />
      <ActivityDrawer
        journey={data}
        activity={activity}
        today={today}
        onClose={() => setActivityParam(null)}
        onUpdated={(updated) => {
          journey.mutate((current) => (current ? patchActivity(current, updated) : current));
          journey.reload();
        }}
      />
    </div>
  );
}

export function JourneySkeleton() {
  return (
    <LoadingArea label="Carregando a jornada…" className={styles.page}>
      <Skeleton width={120} height={20} />
      <Skeleton width="55%" height={52} />
      <Skeleton height={96} radius={6} />
      <Skeleton height={48} />
      <Skeleton height={260} radius={6} />
    </LoadingArea>
  );
}
