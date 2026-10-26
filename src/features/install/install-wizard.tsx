"use client";

import { ArrowRight, LogIn, RefreshCw, Stethoscope } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { BandLayout } from "@/features/access/access-layout";
import { api, clearInstallToken, getInstallToken } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";
import { useHasToken } from "@/lib/use-session";
import type { WebhookCheckDTO } from "@/shared/contracts";
import type { SetupStage } from "@/shared/enums";
import { AccountStep } from "./account-step";
import { ConnectStep } from "./connect-step";
import styles from "./install-wizard.module.css";
import { PrepareStep } from "./prepare-step";

type View = "connect" | "account" | "prepare" | "login" | "done";

const STEPS = ["Conectar o Bitrix24", "Criar acesso de RH", "Preparar o Nexo"];
const STEP_INDEX: Record<View, number> = { connect: 0, account: 1, prepare: 2, login: 2, done: 3 };

function deriveView(stage: SetupStage, hasToken: boolean, hasInstallToken: boolean): View {
  if (stage === "ready") return "done";
  if (stage === "prepare") return hasToken ? "prepare" : "login";
  if (stage === "account") return hasInstallToken ? "account" : "connect";
  return "connect";
}

/**
 * `/instalar`: três passos com Stepper. O passo vem do servidor (`/api/status`) e da aba: o vínculo da
 * instalação fica no sessionStorage, então recarregar a página no passo 2 continua de onde parou.
 */
export function InstallWizard() {
  const router = useRouter();
  const hasToken = useHasToken();
  const status = useApi((signal) => api.status({ signal }), [], { revalidateOnFocus: false });
  const [override, setOverride] = useState<View | null>(null);
  const [check, setCheck] = useState<WebhookCheckDTO | null>(null);

  const stage = status.data?.setup;
  const installToken = check?.installToken ?? (stage ? getInstallToken() : null);
  const derived = stage && hasToken !== null ? deriveView(stage, hasToken, installToken !== null) : null;
  const view = override ?? derived;
  const reconnect = stage === "account" && !installToken;

  let content;
  if (status.error) {
    content = (
      <Notice
        tone="error"
        role="alert"
        title="Não foi possível falar com o servidor do Nexo"
        action={
          <>
            <Button variant="forest" icon={RefreshCw} onClick={status.reload}>
              Tentar de novo
            </Button>
            <ButtonLink href="/diagnostico" icon={Stethoscope}>
              Abrir diagnóstico
            </ButtonLink>
          </>
        }
      >
        {status.error.message}
      </Notice>
    );
  } else if (!view) {
    content = (
      <LoadingArea label="Conferindo a instalação…">
        <Skeleton height={36} width="50%" />
        <Skeleton height={220} radius={6} />
      </LoadingArea>
    );
  } else if (view === "connect" || (view === "account" && !installToken)) {
    content = (
      <ConnectStep
        check={check}
        reconnect={reconnect}
        onConnected={setCheck}
        onContinue={() => setOverride("account")}
      />
    );
  } else if (view === "account" && installToken) {
    content = (
      <AccountStep
        installToken={installToken}
        onCreated={() => setOverride("prepare")}
        onRestart={() => {
          clearInstallToken();
          setCheck(null);
          setOverride("connect");
        }}
      />
    );
  } else if (view === "prepare") {
    content = (
      <PrepareStep
        onDone={() => {
          clearInstallToken();
          router.replace("/hoje");
        }}
      />
    );
  } else if (view === "login") {
    content = (
      <Notice tone="info" title="Falta só o último passo" action={<ButtonLink href="/entrar" variant="primary" icon={LogIn}>Entrar</ButtonLink>}>
        O acesso de RH já foi criado. Entre com ele para preparar o Nexo.
      </Notice>
    );
  } else {
    content = (
      <Notice
        tone="success"
        title="O Nexo já está instalado"
        action={
          <ButtonLink href={hasToken ? "/hoje" : "/entrar"} variant="primary" iconAfter={ArrowRight}>
            {hasToken ? "Abrir o painel de hoje" : "Entrar"}
          </ButtonLink>
        }
      >
        Para trocar o webhook ou os responsáveis padrão, use Ajustes.
      </Notice>
    );
  }

  return (
    <BandLayout label="Instalação">
      <PageHeader
        title="Vamos preparar o Nexo"
        description="Três passos, uns 5 minutos, para ligar o Nexo ao Bitrix24 da sua empresa. Nada é criado no Bitrix24 antes do último passo."
      />
      <Stepper steps={STEPS} current={view ? STEP_INDEX[view] : 0} label="Passos da instalação" className={styles.stepper} />
      <div className={styles.body}>{content}</div>
    </BandLayout>
  );
}
