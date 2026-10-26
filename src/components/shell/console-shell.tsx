"use client";

import { RefreshCw, Stethoscope } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useHasToken } from "@/lib/use-session";
import type { SyncStatusDTO } from "@/shared/contracts";
import { ConsoleContext, type ConsoleContextValue } from "./console-context";
import styles from "./console-shell.module.css";
import { TopBar } from "./top-bar";

/** Sem leitura própria do estado de sincronização se uma página informou há menos disso. */
const SYNC_FRESH_MS = 45_000;
const SYNC_POLL_MS = 60_000;

/**
 * Casca do console do RH. Exige sessão: sem token (ou com `/api/me` 401) volta para `/entrar`;
 * instalação incompleta volta para `/instalar`. As páginas só aparecem depois de saber quem está conectado.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ShellFrame>{children}</ShellFrame>
    </ToastProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/hoje";
  const toast = useToast();
  const hasToken = useHasToken();
  const leavingRef = useRef(false);
  const me = useApi((signal) => api.me({ signal }), [], { enabled: hasToken === true, revalidateOnFocus: false });

  useEffect(() => {
    if (hasToken !== false) return;
    router.replace(leavingRef.current ? "/entrar" : `/entrar?voltar=${encodeURIComponent(pathname)}`);
  }, [hasToken, pathname, router]);

  const stage = me.data?.setup.stage;
  useEffect(() => {
    if (stage && stage !== "ready") router.replace("/instalar");
  }, [stage, router]);

  /* Estado da sincronização para a barra superior. */
  const [sync, setSync] = useState<SyncStatusDTO | null>(null);
  const [syncing, setSyncing] = useState(false);
  const lastReportRef = useRef(0);

  const reportSync = useCallback((next: SyncStatusDTO) => {
    lastReportRef.current = Date.now();
    setSync(next);
  }, []);

  const ready = Boolean(me.data) && stage === "ready";
  useEffect(() => {
    if (!ready) return;
    let controller: AbortController | null = null;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastReportRef.current < SYNC_FRESH_MS) return;
      controller?.abort();
      controller = new AbortController();
      api.today({ signal: controller.signal }).then(
        (today) => reportSync(today.sync),
        () => undefined,
      );
    };
    const first = window.setTimeout(poll, 1_500);
    const interval = window.setInterval(poll, SYNC_POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [ready, reportSync]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      reportSync(await api.sync());
      toast.show({ tone: "success", title: "Sincronização pedida", description: "O Nexo vai conferir o Bitrix24 agora." });
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível sincronizar", description: toApiError(error).message });
    } finally {
      setSyncing(false);
    }
  }, [reportSync, toast]);

  const logout = useCallback(() => {
    leavingRef.current = true;
    api.logout().catch(() => undefined);
  }, []);

  const meData = me.data;
  if (!meData || stage !== "ready") {
    const failed = me.error && me.error.status !== 401;
    return (
      <div className={styles.shell}>
        <header className={styles.placeholderBar}>
          <Logo size={26} />
        </header>
        <main id="conteudo" className={styles.main}>
          {failed ? (
            <Notice
              tone="error"
              title="Não foi possível abrir o Nexo"
              role="alert"
              action={
                <>
                  <Button variant="forest" icon={RefreshCw} onClick={me.reload}>
                    Tentar de novo
                  </Button>
                  <ButtonLink href="/diagnostico" variant="secondary" icon={Stethoscope}>
                    Abrir diagnóstico
                  </ButtonLink>
                </>
              }
            >
              {me.error?.message}
            </Notice>
          ) : (
            <LoadingArea label="Abrindo o Nexo…">
              <Skeleton width="40%" height={20} />
              <Skeleton width="60%" height={56} />
              <Skeleton height={280} radius={6} />
            </LoadingArea>
          )}
        </main>
      </div>
    );
  }

  const value: ConsoleContextValue = { me: meData, sync, syncing, reportSync, syncNow };
  return (
    <ConsoleContext.Provider value={value}>
      <div className={styles.shell}>
        <a href="#conteudo" className={styles.skip}>
          Pular para o conteúdo
        </a>
        <TopBar me={meData} sync={sync} syncing={syncing} onSyncNow={syncNow} onLogout={logout} />
        <main id="conteudo" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>
    </ConsoleContext.Provider>
  );
}
