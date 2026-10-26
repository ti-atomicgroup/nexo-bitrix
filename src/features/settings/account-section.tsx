"use client";

import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { api, toApiError } from "@/lib/api-client";
import { fieldErrors } from "@/lib/form-errors";
import type { MeDTO } from "@/shared/contracts";
import { changePasswordInput } from "@/shared/schemas";
import styles from "./settings-section.module.css";

/** Sua conta: quem está conectado e troca de senha. */
export function AccountSection({ me }: { me: MeDTO }) {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = changePasswordInput.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.changePassword(parsed.data);
      toast.show({ tone: "success", title: "Senha trocada" });
      setCurrent("");
      setNext("");
    } catch (caught) {
      setErrors({ form: toApiError(caught).message });
    } finally {
      setPending(false);
    }
  };

  return (
    <Panel id="conta" title="Sua conta" description={`${me.user.name} · ${me.user.email}`}>
      <form className={styles.stack} onSubmit={submit} noValidate>
        {me.user.mustChangePassword ? (
          <Notice tone="warning" title="Troque a senha temporária">
            Sua senha foi criada por outra pessoa. Escolha uma só sua.
          </Notice>
        ) : null}
        <div className={styles.fields}>
          <Field label="Senha atual" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrent(event.target.value)} error={errors.currentPassword} />
          <Field
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            hint="Pelo menos 10 caracteres."
            value={newPassword}
            onChange={(event) => setNext(event.target.value)}
            error={errors.newPassword}
          />
        </div>
        {errors.form ? (
          <p className={styles.error} role="alert">
            {errors.form}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button type="submit" variant="forest" icon={KeyRound} loading={pending}>
            Trocar senha
          </Button>
        </div>
      </form>
    </Panel>
  );
}
