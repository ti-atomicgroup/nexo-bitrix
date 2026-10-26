"use client";

import { ArrowRight, CircleCheck, Plus, RefreshCw, Settings, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DepartureBoard } from "@/components/lines/departure-board";
import { useConsole } from "@/components/shell/console-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { JourneyLineCard } from "@/features/journeys/journey-line-card";
import { api, toApiError } from "@/lib/api-client";
import { firstName, formatDateLong, plural } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import type { BoardRowDTO, TodayDTO } from "@/shared/contracts";
import styles from "./today-screen.module.css";
import { UpcomingList } from "./upcoming-list";

const REFRESH_MS = 30_000;

function greeting(now: number | null, name: string): string {
  const hour = now === null ? null : new Date(now).getHours();
  const hello = hour === null ? "Olá" : hour < 5 ? "Boa noite" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return `${hello}, ${firstName(name)}`;
}

/** Destino das ações que só navegam; `null` para as que agem na hora (cobrar, aprovar). */
function actionHref(row: BoardRowDTO): string | null {
  const { type, targetId } = row.action;
  const journeyId = row.who.journeyId;
  if (type === "start_journey") return `/pessoas/nova?deteccao=${encodeURIComponent(targetId)}`;
  if (type === "open_activity") {
    return journeyId ? `/pessoas/${encodeURIComponent(journeyId)}?atividade=${encodeURIComponent(targetId)}` : "/pessoas";
  }
  if (type === "nudge" || type === "approve") return null;
  return `/pessoas/${encodeURIComponent(journeyId ?? targetId)}`;
}

/** `/hoje`: o painel de partidas do RH, com o que fazer agora, as linhas em andamento e os próximos 14 dias. */
export function TodayScreen() {
  const { me, reportSync, syncNow, syncing } = useConsole();
  const toast = useToast();
  const now = useNow(60_000);
  const today = useApi((signal) => api.today({ signal }), [], { refreshMs: REFRESH_MS });
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const data = today.data;
  useEffect(() => {
    if (data) reportSync(data.sync);
  }, [data, reportSync]);

  const runAction = async (row: BoardRowDTO) => {
    const { type, targetId } = row.action;
    if (type !== "nudge" && type !== "approve") return;
    setBusyRow(row.id);
    try {
      await api.activityAction(targetId, type === "nudge" ? { action: "nudge" } : { action: "approve" });
      toast.show(
        type === "nudge"
          ? { tone: "success", title: "Cobrança enviada", description: `O responsável pela atividade de ${row.who.name} recebe um comentário na tarefa do Bitrix24.` }
          : { tone: "success", title: "Atividade aprovada", description: "A aprovação vai para o Bitrix24 no próximo ciclo." },
      );
      today.reload();
    } catch (error) {
      toast.show({ tone: "error", title: type === "nudge" ? "Não foi possível cobrar" : "Não foi possível aprovar", description: toApiError(error).message });
    } finally {
      setBusyRow(null);
    }
  };

  const dismiss = async (row: BoardRowDTO) => {
    setBusyRow(row.id);
    try {
      await api.detectionDismiss(row.action.targetId);
      toast.show({ tone: "info", title: "Detecção dispensada", description: `${row.who.name} saiu do painel. Nada foi criado no Bitrix24.` });
      today.reload();
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível dispensar", description: toApiError(error).message });
    } finally {
      setBusyRow(null);
    }
  };

  const renderAction = (row: BoardRowDTO) => {
    const href = actionHref(row);
    const strong = row.action.type === "start_journey" || row.status.tone === "late";
    return (
      <>
        {href ? (
          <ButtonLink href={href} size="s" variant={strong ? "primary" : "onDark"}>
            {row.action.label}
          </ButtonLink>
        ) : (
          <Button size="s" variant="primary" loading={busyRow === row.id} onClick={() => runAction(row)}>
            {row.action.label}
          </Button>
        )}
        {row.kind === "detection" ? (
          <Button size="s" variant="onDark" icon={X} disabled={busyRow === row.id} onClick={() => dismiss(row)}>
            Dispensar
          </Button>
        ) : null}
      </>
    );
  };

  if (!data) {
    return today.error ? (
      <Notice
        tone="error"
        role="alert"
        title="Não foi possível abrir o painel de hoje"
        action={
          <Button variant="forest" icon={RefreshCw} onClick={today.reload}>
            Tentar de novo
          </Button>
        }
      >
        {today.error.message}
      </Notice>
    ) : (
      <TodaySkeleton />
    );
  }

  return (
    <div className={styles.page}>
      <SyncNotice data={data} syncing={syncing} onSyncNow={syncNow} />
      {today.error ? (
        <Notice tone="warning" title="Não foi possível atualizar agora">
          Mostrando a última leitura. {today.error.message}
        </Notice>
      ) : null}

      <section className={styles.station} aria-labelledby="hoje-titulo">
        <header className={styles.head}>
          <div className={styles.titles}>
            <h1 id="hoje-titulo" className={styles.title}>
              Painel de hoje
            </h1>
            <p className={styles.date}>
              {formatDateLong(data.date)} · {greeting(now, data.greetingName || me.user.name)}
            </p>
          </div>
          <dl className={styles.counters}>
            <div className={styles.counter}>
              <dt>{data.counters.actions === 1 ? "ação para hoje" : "ações para hoje"}</dt>
              <dd className={styles.countActions}>{data.counters.actions}</dd>
            </div>
            <div className={styles.counter}>
              <dt>chegando</dt>
              <dd className={styles.countArriving}>{data.counters.arriving}</dd>
            </div>
            <div className={styles.counter}>
              <dt>saindo</dt>
              <dd className={styles.countLeaving}>{data.counters.leaving}</dd>
            </div>
          </dl>
        </header>

        {data.board.length ? (
          <DepartureBoard rows={data.board} caption="O que fazer agora, em ordem de horário" renderAction={renderAction} framed={false} className={styles.board} />
        ) : (
          <div className={styles.clear}>
            <CircleCheck className={styles.clearIcon} size={40} strokeWidth={2.25} aria-hidden="true" />
            <h2 className={styles.clearTitle}>Nenhuma pendência hoje</h2>
            <p className={styles.clearText}>
              Tudo em dia. Quando alguém for contratado ou desligado no Bitrix24, ou uma tarefa atrasar, aparece aqui com a ação certa.
            </p>
            <ButtonLink href="/pessoas/nova" variant="primary" icon={Plus}>
              Nova jornada
            </ButtonLink>
          </div>
        )}
      </section>

      <div className={styles.columns}>
        <section className={styles.section} aria-labelledby="linhas-titulo">
          <div className={styles.sectionHead}>
            <h2 id="linhas-titulo" className={styles.sectionTitle}>
              Linhas em andamento
            </h2>
            <ButtonLink href="/pessoas" variant="ghost" size="s" iconAfter={ArrowRight}>
              Ver todas as pessoas
            </ButtonLink>
          </div>
          {data.lines.length ? (
            <div className={styles.lines}>
              {data.lines.map((journey) => (
                <JourneyLineCard key={journey.id} journey={journey} today={data.date} />
              ))}
            </div>
          ) : (
            <p className={styles.quiet}>
              Nenhuma linha em andamento. <Link href="/pessoas/nova">Comece uma nova jornada</Link>.
            </p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="proximos-titulo">
          <div className={styles.sectionHead}>
            <h2 id="proximos-titulo" className={styles.sectionTitle}>
              Próximos 14 dias
            </h2>
            <p className={styles.sectionMeta}>{plural(data.upcoming.length, "data", "datas")}</p>
          </div>
          {data.upcoming.length ? <UpcomingList items={data.upcoming} /> : <p className={styles.quiet}>Ninguém chega ou sai nos próximos 14 dias.</p>}
        </section>
      </div>
    </div>
  );
}

function SyncNotice({ data, syncing, onSyncNow }: { data: TodayDTO; syncing: boolean; onSyncNow: () => Promise<void> }) {
  if (!data.sync.connected) {
    return (
      <Notice
        tone="error"
        title="O Bitrix24 está desconectado"
        action={
          <ButtonLink href="/ajustes" variant="forest" size="s" icon={Settings}>
            Abrir Ajustes
          </ButtonLink>
        }
      >
        As tarefas não estão indo para o Bitrix24. Confira o webhook em Ajustes.
      </Notice>
    );
  }
  if (data.sync.lastError) {
    return (
      <Notice
        tone="warning"
        title="A última sincronização com o Bitrix24 falhou"
        action={
          <Button variant="forest" size="s" icon={RefreshCw} loading={syncing} onClick={onSyncNow}>
            Sincronizar agora
          </Button>
        }
      >
        {data.sync.lastError}
      </Notice>
    );
  }
  return null;
}

function TodaySkeleton() {
  return (
    <LoadingArea label="Carregando o painel de hoje…" className={styles.page}>
      <div className={styles.station}>
        <div className={styles.head}>
          <div className={styles.titles}>
            <Skeleton onDark width={260} height={48} />
            <Skeleton onDark width={220} height={18} />
          </div>
          <div className={styles.counters}>
            <Skeleton onDark width={80} height={64} />
            <Skeleton onDark width={80} height={64} />
            <Skeleton onDark width={80} height={64} />
          </div>
        </div>
        <div className={styles.skeletonRows}>
          <Skeleton onDark height={44} />
          <Skeleton onDark height={44} />
          <Skeleton onDark height={44} />
        </div>
      </div>
      <Skeleton height={160} radius={6} />
    </LoadingArea>
  );
}
