"use client";

import { RefreshCw, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useHasToken } from "@/lib/use-session";
import styles from "./root-redirect.module.css";

/**
 * `/`: decide para onde ir. Instalação incompleta → `/instalar`; sem sessão → `/entrar`; com sessão → `/hoje`.
 */
export function RootRedirect() {
  const router = useRouter();
  const hasToken = useHasToken();
  const status = useApi((signal) => api.status({ signal }), [], { revalidateOnFocus: false });

  const target = hasToken === null || !status.data ? null : status.data.setup !== "ready" ? "/instalar" : hasToken ? "/hoje" : "/entrar";

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return (
    <main className={styles.page}>
      <Logo size={40} />
      {status.error ? (
        <div className={styles.error} role="alert">
          <h1 className={styles.title}>Não foi possível falar com o servidor do Nexo</h1>
          <p className={styles.text}>{status.error.message}</p>
          <div className={styles.actions}>
            <Button variant="primary" icon={RefreshCw} onClick={status.reload}>
              Tentar de novo
            </Button>
            <ButtonLink href="/diagnostico" variant="onDark" icon={Stethoscope}>
              Abrir diagnóstico
            </ButtonLink>
          </div>
        </div>
      ) : (
        <p className={styles.text} role="status">
          Abrindo o Nexo…
        </p>
      )}
    </main>
  );
}
