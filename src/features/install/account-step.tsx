"use client";

import { Eye, EyeOff, UserPlus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, toApiError } from "@/lib/api-client";
import { fieldErrors, focusFirstInvalid } from "@/lib/form-errors";
import { createAccountInput } from "@/shared/schemas";
import styles from "./install-step.module.css";

export interface AccountStepProps {
  installToken: string;
  onCreated: () => void;
  /** Volta ao passo 1 (o vínculo da instalação expirou). */
  onRestart: () => void;
}

/** Passo 2: o primeiro acesso de RH (administração). A sessão já fica guardada ao criar. */
export function AccountStep({ installToken, onCreated, onRestart }: AccountStepProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = createAccountInput.safeParse({ installToken, name, email, password });
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      if (next.installToken) {
        setFailure("O vínculo da instalação expirou. Conecte o Bitrix24 de novo para continuar.");
      }
      setErrors(next);
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      await api.setupAccount(parsed.data);
      onCreated();
    } catch (caught) {
      setFailure(toApiError(caught).message);
      setPending(false);
    }
  };

  return (
    <div className={styles.step}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Crie seu acesso de RH</h2>
        <p className={styles.lead}>Este é o primeiro acesso, com permissão de administração. Depois você convida o restante do RH em Ajustes.</p>
      </div>

      {failure ? (
        <Notice
          tone="error"
          role="alert"
          title="Não foi possível criar o acesso"
          action={
            <Button size="s" variant="secondary" onClick={onRestart}>
              Voltar ao passo 1
            </Button>
          }
        >
          {failure}
        </Notice>
      ) : null}

      <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
        <Field label="Seu nome" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        <Field
          label="E-mail"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
        />
        <Field
          label="Senha"
          type={show ? "text" : "password"}
          name="password"
          autoComplete="new-password"
          hint="Use pelo menos 10 caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          trailing={
            <button
              type="button"
              className={styles.reveal}
              aria-pressed={show}
              aria-label={show ? "Esconder a senha" : "Mostrar a senha"}
              onClick={() => setShow((value) => !value)}
            >
              {show ? <EyeOff size={20} strokeWidth={2.25} aria-hidden="true" /> : <Eye size={20} strokeWidth={2.25} aria-hidden="true" />}
            </button>
          }
        />
        <div className={styles.actions}>
          <Button type="submit" variant="primary" icon={UserPlus} loading={pending}>
            Criar acesso
          </Button>
        </div>
      </form>
    </div>
  );
}
