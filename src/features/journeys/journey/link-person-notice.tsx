"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toast";
import { PersonPicker } from "@/features/people/person-picker";
import { api, toApiError } from "@/lib/api-client";
import { firstName } from "@/lib/format";
import type { JourneyDTO, UserRef } from "@/shared/contracts";
import styles from "./link-person-notice.module.css";

/** Pessoa sem conta no Bitrix24: aviso com "Vincular conta" (escolha da conta no próprio aviso). */
export function LinkPersonNotice({ journey, onLinked }: { journey: JourneyDTO; onLinked: (next: JourneyDTO) => void }) {
  const toast = useToast();
  const first = firstName(journey.summary.person.name);
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<UserRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const link = async () => {
    if (!account) {
      setError("Escolha a conta no Bitrix24.");
      return;
    }
    setPending(true);
    try {
      onLinked(await api.journeyLinkPerson(journey.summary.id, { bitrixUserId: account.bitrixUserId }));
      toast.show({ tone: "success", title: "Conta vinculada", description: `As tarefas de ${first} vão para o Bitrix24 no próximo ciclo.` });
    } catch (caught) {
      setError(toApiError(caught).message);
      setPending(false);
    }
  };

  return (
    <Notice
      tone="warning"
      title={`${first} ainda não tem conta no Bitrix24`}
      action={
        open ? undefined : (
          <Button variant="forest" size="s" icon={Link2} onClick={() => setOpen(true)}>
            Vincular conta
          </Button>
        )
      }
    >
      <p>As tarefas que dependem da conta de {first} só vão para o Bitrix24 depois do vínculo.</p>
      {open ? (
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
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Agora não
            </Button>
          </div>
        </div>
      ) : null}
    </Notice>
  );
}
