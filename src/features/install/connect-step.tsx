"use client";

import { ArrowRight, Plug, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { api, setInstallToken, toApiError } from "@/lib/api-client";
import { listPtBr } from "@/lib/format";
import { focusFirstInvalid } from "@/lib/form-errors";
import type { WebhookCheckDTO } from "@/shared/contracts";
import { SCOPE_LABEL } from "@/shared/enums";
import { connectWebhookInput } from "@/shared/schemas";
import styles from "./install-step.module.css";
import { missingRequiredScopes, ScopeList } from "./scope-list";

export interface ConnectStepProps {
  check: WebhookCheckDTO | null;
  onConnected: (check: WebhookCheckDTO) => void;
  onContinue: () => void;
  /** A aba perdeu o vínculo da instalação (ex.: recarregou): pedir para conectar de novo. */
  reconnect?: boolean;
}

/** Passo 1: como criar o webhook de entrada, colar o endereço e conferir as permissões. */
export function ConnectStep({ check, onConnected, onContinue, reconnect = false }: ConnectStepProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; detail: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const missing = check ? missingRequiredScopes(check.scopes) : [];

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = connectWebhookInput.safeParse({ webhookUrl: url });
    const value = parsed.success ? parsed.data.webhookUrl : "";
    const problem = !parsed.success
      ? (parsed.error.issues[0]?.message ?? "Cole o endereço do webhook.")
      : !/^https:\/\//i.test(value)
        ? "Use o endereço completo, que começa com https://."
        : null;
    if (problem) {
      setError(problem);
      focusFirstInvalid(formRef.current);
      return;
    }
    setError(null);
    setFailure(null);
    setPending(true);
    try {
      const result = await api.setupConnect({ webhookUrl: value });
      setInstallToken(result.installToken);
      setUrl("");
      onConnected(result);
    } catch (caught) {
      const apiError = toApiError(caught);
      setFailure({ message: apiError.message, detail: apiError.detail });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.step}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Conecte seu Bitrix24</h2>
        <p className={styles.lead}>O Nexo conversa com o Bitrix24 por um webhook de entrada. Leva uns 2 minutos.</p>
      </div>

      {reconnect ? (
        <Notice tone="warning" title="Conecte de novo nesta aba">
          O Bitrix24 já foi conectado, mas esta aba perdeu o vínculo da instalação. Cole o webhook outra vez para continuar.
        </Notice>
      ) : null}

      <ol className={styles.howto}>
        <li>
          No Bitrix24, abra <strong>Aplicativos → Desenvolvedores → Outro → Webhook de entrada</strong>.
        </li>
        <li>
          Em <strong>Configurar permissões</strong>, marque <strong>Tarefas, Usuários, CRM e Grupos de trabalho</strong>. Para os extras, marque também{" "}
          <strong>Notificações, Agenda e Feed de notícias</strong>.
        </li>
        <li>
          Clique em <strong>Salvar</strong>, copie o endereço do webhook e cole abaixo.
        </li>
      </ol>

      <Notice tone="info" icon={ShieldCheck} title="Dica de segurança">
        Crie o webhook com uma conta dedicada, sem acesso de administrador. O Nexo guarda o endereço cifrado e nunca o mostra de novo.
      </Notice>

      <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
        <Field
          label="Endereço do webhook"
          type="url"
          name="webhookUrl"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://suaempresa.bitrix24.com.br/rest/1/abc123/"
          hint="Começa com https:// e termina com uma barra."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          error={error}
        />
        <div className={styles.actions}>
          <Button type="submit" variant={check ? "secondary" : "primary"} icon={Plug} loading={pending}>
            {check ? "Conectar de novo" : "Conectar"}
          </Button>
        </div>
      </form>

      {failure ? (
        <Notice tone="error" role="alert" title="Não foi possível conectar">
          {failure.message}
          {failure.detail ? ` Detalhe técnico: ${failure.detail}.` : null}
        </Notice>
      ) : null}

      {check ? (
        <Panel
          title={`Conectado a ${check.portal}`}
          description={`Dono do webhook: ${check.owner.name}${check.owner.position ? ` (${check.owner.position})` : ""}`}
          headingLevel={3}
        >
          <div className={styles.result} role="status">
            <ScopeList scopes={check.scopes} headingLevel={4} />
            {missing.length ? (
              <Notice tone="error" title="Falta marcar permissões obrigatórias">
                Marque {listPtBr(missing.map((scope) => SCOPE_LABEL[scope]))} no webhook, salve no Bitrix24 e clique em Conectar de novo.
              </Notice>
            ) : null}
          </div>
          <div className={styles.actions}>
            <Button variant="primary" iconAfter={ArrowRight} disabled={missing.length > 0} onClick={onContinue}>
              Continuar
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
