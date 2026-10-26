"use client";

import { Eye, EyeOff, LogIn, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, toApiError, type ApiError } from "@/lib/api-client";
import { fieldErrors, focusFirstInvalid } from "@/lib/form-errors";
import { safeReturnPath, useHasToken } from "@/lib/use-session";
import { loginInput } from "@/shared/schemas";
import { AccessLayout } from "./access-layout";
import styles from "./login-screen.module.css";

function returnPath(): string {
  return safeReturnPath(new URLSearchParams(window.location.search).get("voltar"));
}

/** `/entrar`: e-mail e senha. Mensagem clara quando o acesso fica bloqueado por tentativas. */
export function LoginScreen() {
  const router = useRouter();
  const hasToken = useHasToken();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  // Já conectado (outra aba ou volta do navegador): segue direto.
  useEffect(() => {
    if (hasToken === true && !pending) router.replace(returnPath());
  }, [hasToken, pending, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = loginInput.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setFailure(null);
    setPending(true);
    try {
      const session = await api.login(parsed.data);
      router.replace(session.me.setup.stage === "ready" ? returnPath() : "/instalar");
    } catch (error) {
      setFailure(toApiError(error));
      setPending(false);
    }
  };

  const locked = failure?.status === 429;

  return (
    <AccessLayout>
      <div className={styles.card}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Entrar</h1>
          <p className={styles.lead}>Use o acesso de RH criado na instalação do Nexo.</p>
        </div>

        {failure ? (
          <Notice tone={locked ? "warning" : "error"} role="alert" title={locked ? "Acesso pausado por alguns minutos" : "Não foi possível entrar"}>
            {failure.message}
          </Notice>
        ) : null}

        <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
          <Field
            label="E-mail"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            leadingIcon={Mail}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            required
          />
          <Field
            label="Senha"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            required
            trailing={
              <button
                type="button"
                className={styles.reveal}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Esconder a senha" : "Mostrar a senha"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={20} strokeWidth={2.25} aria-hidden="true" /> : <Eye size={20} strokeWidth={2.25} aria-hidden="true" />}
              </button>
            }
          />
          <Button type="submit" variant="primary" icon={LogIn} loading={pending} fullWidth>
            Entrar
          </Button>
        </form>

        <p className={styles.help}>Esqueceu a senha? Peça a quem administra o Nexo para criar uma nova em Ajustes, na seção Equipe.</p>
      </div>
    </AccessLayout>
  );
}
