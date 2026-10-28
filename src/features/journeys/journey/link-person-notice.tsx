"use client";

import { Link2, MailPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { PersonPicker } from "@/features/people/person-picker";
import { api, toApiError } from "@/lib/api-client";
import { firstName } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { JourneyDTO, UserRef } from "@/shared/contracts";
import styles from "./link-person-notice.module.css";

/**
 * Pessoa sem conta no Bitrix24: aviso com "Vincular conta" (escolha da conta no próprio aviso) e, se o webhook
 * permite, "Convidar para o Bitrix24". Mostra também o convite a caminho ou o motivo da falha.
 */
export function LinkPersonNotice({ journey, onLinked }: { journey: JourneyDTO; onLinked: (next: JourneyDTO) => void }) {
  const toast = useToast();
  const person = journey.summary.person;
  const first = firstName(person.name);
  const invite = person.invite ?? null;
  const settings = useApi((signal) => api.settings({ signal }), [], { revalidateOnFocus: false });
  const canInvite = Boolean(settings.data?.invitesEnabled);
  const [mode, setMode] = useState<"link" | "invite" | null>(null);
  const [account, setAccount] = useState<UserRef | null>(null);
  const [email, setEmail] = useState(person.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const open = (next: "link" | "invite" | null) => {
    setMode(next);
    setError(null);
  };

  const send = async (body: { bitrixUserId: string } | { inviteEmail: string }, success: { title: string; description: string }) => {
    setPending(true);
    try {
      onLinked(await api.journeyLinkPerson(journey.summary.id, body));
      toast.show({ tone: "success", ...success });
      setMode(null);
    } catch (caught) {
      setError(toApiError(caught).message);
    } finally {
      setPending(false);
    }
  };

  const link = () => {
    if (!account) {
      setError("Escolha a conta no Bitrix24.");
      return;
    }
    void send({ bitrixUserId: account.bitrixUserId }, { title: "Conta vinculada", description: `As tarefas de ${first} vão para o Bitrix24 no próximo ciclo.` });
  };

  const sendInvite = () => {
    if (!email.trim()) {
      setError("Informe o e-mail para enviar o convite.");
      return;
    }
    void send({ inviteEmail: email.trim() }, { title: "Convite a caminho", description: `O Bitrix24 convida ${first} no próximo ciclo.` });
  };

  const sending = invite?.status === "sending";
  const actions =
    mode || sending ? undefined : (
      <div className={styles.actions}>
        {canInvite ? (
          <Button variant="forest" size="s" icon={MailPlus} onClick={() => open("invite")}>
            {invite?.status === "failed" ? "Convidar de novo" : "Convidar para o Bitrix24"}
          </Button>
        ) : null}
        <Button variant={canInvite ? "secondary" : "forest"} size="s" icon={Link2} onClick={() => open("link")}>
          Vincular conta
        </Button>
      </div>
    );

  return (
    <Notice
      tone={invite?.status === "failed" ? "error" : sending ? "info" : "warning"}
      title={
        sending
          ? "Convite para o Bitrix24 a caminho"
          : invite?.status === "failed"
            ? `O convite de ${first} para o Bitrix24 não foi enviado`
            : `${first} ainda não tem conta no Bitrix24`
      }
      action={actions}
    >
      {sending ? (
        <p>
          O Nexo está convidando {first}
          {person.email ? ` pelo e-mail ${person.email}` : ""}. Quando o Bitrix24 criar a conta, as tarefas de {first} vão para ela sozinhas.
        </p>
      ) : invite?.status === "failed" ? (
        <p>{invite.error ?? "O Bitrix24 não confirmou o convite."} Tente de novo ou vincule a conta à mão.</p>
      ) : (
        <p>As tarefas que dependem da conta de {first} só vão para o Bitrix24 depois do vínculo.</p>
      )}
      {mode === "link" ? (
        <div className={styles.form}>
          <PersonPicker
            label={`Conta de ${first} no Bitrix24`}
            value={account}
            onChange={(value) => {
              setAccount(value);
              setError(null);
            }}
            error={error}
          />
          <div className={styles.actions}>
            <Button variant="forest" icon={Link2} loading={pending} onClick={link}>
              Vincular
            </Button>
            <Button variant="ghost" onClick={() => open(null)} disabled={pending}>
              Agora não
            </Button>
          </div>
        </div>
      ) : null}
      {mode === "invite" ? (
        <div className={styles.form}>
          <Field
            label="E-mail"
            type="email"
            autoComplete="off"
            hint="O convite do Bitrix24 chega aqui, e este e-mail vira o login da pessoa."
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            error={error ?? undefined}
          />
          <div className={styles.actions}>
            <Button variant="forest" icon={MailPlus} loading={pending} onClick={sendInvite}>
              Convidar
            </Button>
            <Button variant="ghost" onClick={() => open(null)} disabled={pending}>
              Agora não
            </Button>
          </div>
        </div>
      ) : null}
    </Notice>
  );
}
