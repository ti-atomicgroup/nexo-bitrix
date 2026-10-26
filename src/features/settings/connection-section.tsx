"use client";

import { ExternalLink, Plug } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { ScopeList } from "@/features/install/scope-list";
import { api, toApiError } from "@/lib/api-client";
import { formatSince } from "@/lib/format";
import { useNow } from "@/lib/use-session";
import type { SettingsDTO } from "@/shared/contracts";
import { replaceWebhookInput } from "@/shared/schemas";
import styles from "./settings-section.module.css";

/** Conexão com o Bitrix24: portal, webhook mascarado, dono, permissões, projeto e troca de webhook. */
export function ConnectionSection({ settings, isAdmin, onSaved }: { settings: SettingsDTO; isAdmin: boolean; onSaved: (next: SettingsDTO) => void }) {
  const toast = useToast();
  const now = useNow(60_000);
  const [replacing, setReplacing] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const webhook = settings.webhook;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = replaceWebhookInput.safeParse({ webhookUrl: url });
    if (!parsed.success || !/^https:\/\//i.test(parsed.data.webhookUrl)) {
      setError(parsed.success ? "Use o endereço completo, que começa com https://." : (parsed.error.issues[0]?.message ?? "Cole o endereço do webhook."));
      return;
    }
    setError(null);
    setPending(true);
    try {
      onSaved(await api.webhookReplace(parsed.data));
      setUrl("");
      setReplacing(false);
      toast.show({ tone: "success", title: "Webhook trocado", description: "O Nexo já usa a nova conexão." });
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel id="conexao" title="Conexão com o Bitrix24" description="O Nexo usa um webhook de entrada. O endereço fica cifrado e nunca volta para a tela.">
      <div className={styles.stack}>
        {webhook ? (
          <dl className={styles.facts}>
            <div>
              <dt>Portal</dt>
              <dd>{settings.portal ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Webhook</dt>
              <dd className={styles.mono}>{webhook.masked}</dd>
            </div>
            <div>
              <dt>Dono do webhook</dt>
              <dd>
                {webhook.owner.name}
                {webhook.owner.position ? ` (${webhook.owner.position})` : ""}
              </dd>
            </div>
            <div>
              <dt>Conferido</dt>
              <dd>{now === null ? webhook.verifiedAt.slice(0, 10) : formatSince(webhook.verifiedAt, now)}</dd>
            </div>
            {settings.project ? (
              <div>
                <dt>Projeto das tarefas</dt>
                <dd>{settings.project.name}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <Notice tone="error" title="O Bitrix24 não está conectado">
            Sem webhook, nenhuma tarefa vai para o Bitrix24. {isAdmin ? "Conecte abaixo." : "Peça a quem administra o Nexo para conectar."}
          </Notice>
        )}

        {webhook ? <ScopeList scopes={webhook.scopes} /> : null}

        <div className={styles.actions}>
          {settings.project ? (
            <ButtonLink href={settings.project.url} external variant="ghost" icon={ExternalLink}>
              Abrir o projeto no Bitrix24
            </ButtonLink>
          ) : null}
          {isAdmin && !replacing ? (
            <Button icon={Plug} onClick={() => setReplacing(true)}>
              {webhook ? "Trocar webhook" : "Conectar webhook"}
            </Button>
          ) : null}
        </div>

        {isAdmin && replacing ? (
          <form className={styles.box} onSubmit={submit} noValidate>
            <Field
              label="Novo endereço do webhook"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://suaempresa.bitrix24.com.br/rest/1/abc123/"
              hint="Crie em Aplicativos → Desenvolvedores → Outro → Webhook de entrada, com as mesmas permissões."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              error={error}
            />
            <div className={styles.actions}>
              <Button type="submit" variant="forest" icon={Plug} loading={pending}>
                Conferir e trocar
              </Button>
              <Button variant="ghost" onClick={() => setReplacing(false)} disabled={pending}>
                Voltar
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </Panel>
  );
}
